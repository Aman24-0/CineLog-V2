// src/routes/api/sync/trakt/preview.ts
//
// CineLog V2 — Trakt Sync Preview (Server-Only)
// ---------------------------------------------------------------------
// GET /api/sync/trakt/preview
//   → 200 {
//       connected: true,
//       trakt_username: string,
//       trakt_email: string | null,
//       summary: {
//         newMovies: number,         // in Trakt, not in CineLog vault
//         newShows: number,          // in Trakt, not in CineLog vault
//         conflicts: number,         // in both, with different rating/status
//         alreadyInVault: number,    // in both, no changes needed
//         totalTraktItems: number,   // total normalized items from Trakt
//         totalVaultItems: number    // total vault items for this user
//       },
//       sample: {
//         newMovies: Array<{ tmdb_id, title, year, watched_at, rating }>,  // up to 10
//         newShows: Array<{ tmdb_id, title, year, watched_at, rating }>    // up to 10
//       },
//       fetched_at: string  // ISO timestamp
//     }
//   → 401 if not signed in
//   → 409 if Trakt is not connected (no user_integrations row)
//   → 502 if Trakt API call fails
//   → 500 on server error
//
// WHAT THIS DOES:
//   Fetches the user's Trakt watched history (using the stored token)
//   and compares it against their CineLog vault. Returns a JSON
//   summary that the frontend can render as a "Here's what will be
//   imported" preview BEFORE the user commits to the actual sync.
//
//   The comparison is done purely on TMDB ID + media_type — if a
//   Trakt item's (tmdb_id, media_type) pair exists in the vault, it's
//   "alreadyInVault" (or "conflict" if the rating differs); otherwise
//   it's "new".
//
// SECURITY:
//   • Requires an authenticated CineLog session.
//   • The Trakt access_token is read from the DB (server-side only)
//     via the service-role client — never sent to the browser.
//   • The Trakt email is included in the response so the user can
//     verify which Trakt account they're syncing from. The access_token
//     and refresh_token are NEVER included.

import { isServer } from "solid-js/web";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";
import {
  getNormalizedTraktHistory,
  type NormalizedTraktItem
} from "~/lib/server/trakt";

interface APIEvent {
  request: Request;
}

// ─── Types ────────────────────────────────────────────────────────

interface VaultRow {
  tmdb_id: number;
  media_type: "movie" | "tv";
  status: string;
  rating: number | null;
  watched_on: string | null;
}

interface PreviewSummary {
  newMovies: number;
  newShows: number;
  conflicts: number;
  alreadyInVault: number;
  totalTraktItems: number;
  totalVaultItems: number;
}

interface SampleItem {
  tmdb_id: number;
  title: string;
  year: number | null;
  watched_at: string;
  rating: number | null;
}

interface PreviewResponse {
  connected: true;
  trakt_username: string;
  trakt_email: string | null;
  summary: PreviewSummary;
  sample: {
    newMovies: SampleItem[];
    newShows: SampleItem[];
  };
  fetched_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

/**
 * Verify the user is signed in. Returns the user_id on success.
 */
async function requireSignedInUser(
  request: Request
): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const accessToken = getSupabaseAccessToken(cookieHeader);
  if (!accessToken) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data, error } = await verifyClient.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user.id;
}

/**
 * Load the user's Trakt integration row from the DB.
 * Returns null if no Trakt connection exists.
 *
 * Uses the service-role admin client to bypass RLS — the access_token
 * is a server-side secret that the user's anon-key client cannot read.
 */
async function loadTraktIntegration(userId: string): Promise<{
  accessToken: string;
  username: string;
  email: string | null;
} | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_integrations")
    .select("access_token, provider_user_id, provider_email")
    .eq("user_id", userId)
    .eq("provider", "trakt")
    .maybeSingle();

  if (error) {
    throw new Error(
      `[trakt/preview] DB read failed: ${error.message}`
    );
  }
  if (!data) return null;

  return {
    accessToken: data.access_token,
    username: data.provider_user_id ?? "me",
    email: data.provider_email ?? null
  };
}

/**
 * Load the user's vault rows. We only need the fields used for the
 * comparison: tmdb_id, media_type, status, rating, watched_on.
 *
 * Uses the anon-key client WITH the user's access token so RLS
 * enforces row-level isolation (the user can only see their own vault).
 */
async function loadUserVault(
  userId: string,
  accessToken: string
): Promise<VaultRow[]> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("[trakt/preview] Missing Supabase env vars");
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  // Set the session on the client so RLS sees the user.
  await client.auth.setSession({
    access_token: accessToken,
    refresh_token: "" // not needed for SELECT; getUser already verified
  });

  const { data, error } = await client
    .from("vault")
    .select("tmdb_id, media_type, status, rating, watched_on")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`[trakt/preview] Vault read failed: ${error.message}`);
  }

  return (data ?? []) as VaultRow[];
}

/**
 * Compute the preview summary by comparing Trakt items against the
 * user's vault.
 *
 * Rules:
 *   • "new" — Trakt item's (tmdb_id, media_type) is NOT in the vault.
 *   • "alreadyInVault" — Trakt item IS in the vault, AND the vault
 *     rating matches (or both are null) AND the vault status is not
 *     "planned" (which would be a downgrade from Trakt's "completed").
 *   • "conflict" — Trakt item IS in the vault, BUT the rating differs
 *     OR the vault status is "planned" (Trakt says "completed", we
 *     would overwrite the status).
 */
function computeSummary(
  traktItems: NormalizedTraktItem[],
  vault: VaultRow[]
): PreviewSummary {
  // Index vault by (media_type, tmdb_id) for O(1) lookup.
  const vaultByKey = new Map<string, VaultRow>();
  for (const row of vault) {
    vaultByKey.set(`${row.media_type}:${row.tmdb_id}`, row);
  }

  let newMovies = 0;
  let newShows = 0;
  let conflicts = 0;
  let alreadyInVault = 0;

  for (const item of traktItems) {
    const key = `${item.media_type}:${item.tmdb_id}`;
    const existing = vaultByKey.get(key);

    if (!existing) {
      if (item.media_type === "movie") newMovies += 1;
      else newShows += 1;
      continue;
    }

    // Item exists in vault — check for conflicts.
    // Conflict if: vault rating differs from Trakt rating (and both
    // are non-null), OR vault status is "planned" (Trakt would
    // upgrade it to "completed").
    const ratingDiffers =
      item.rating !== null &&
      existing.rating !== null &&
      item.rating !== existing.rating;
    const statusIsPlanned = existing.status === "planned";

    if (ratingDiffers || statusIsPlanned) {
      conflicts += 1;
    } else {
      alreadyInVault += 1;
    }
  }

  return {
    newMovies,
    newShows,
    conflicts,
    alreadyInVault,
    totalTraktItems: traktItems.length,
    totalVaultItems: vault.length
  };
}

// ─── GET handler ──────────────────────────────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  // ─── 1. Verify session ───────────────────────────────────────────
  const userId = await requireSignedInUser(event.request);
  if (!userId) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  // ─── 2. Load the Trakt integration ───────────────────────────────
  let integration: {
    accessToken: string;
    username: string;
    email: string | null;
  } | null;
  try {
    integration = await loadTraktIntegration(userId);
  } catch (err) {
    console.error(
      "[trakt/preview] Integration load failed:",
      err instanceof Error ? err.message : String(err)
    );
    return jsonResponse(
      { error: "Failed to load Trakt integration from DB" },
      500
    );
  }

  if (!integration) {
    return jsonResponse(
      {
        connected: false,
        error:
          "Trakt is not connected. Visit /settings/sync to connect your Trakt account."
      },
      409
    );
  }

  // ─── 3. Fetch the Trakt history (with ratings) ───────────────────
  let traktItems: NormalizedTraktItem[];
  try {
    traktItems = await getNormalizedTraktHistory(
      integration.accessToken,
      integration.username
    );
  } catch (err) {
    console.error(
      "[trakt/preview] Trakt API call failed:",
      err instanceof Error ? err.message : String(err)
    );
    return jsonResponse(
      {
        connected: true,
        error:
          "Failed to fetch Trakt history. The access token may have expired — try reconnecting your Trakt account."
      },
      502
    );
  }

  // ─── 4. Load the user's vault ────────────────────────────────────
  // Reuse the access token from the cookie for the RLS-aware vault read.
  const cookieHeader = event.request.headers.get("cookie") ?? "";
  const cinelogAccessToken = getSupabaseAccessToken(cookieHeader);
  if (!cinelogAccessToken) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  let vault: VaultRow[];
  try {
    vault = await loadUserVault(userId, cinelogAccessToken);
  } catch (err) {
    console.error(
      "[trakt/preview] Vault load failed:",
      err instanceof Error ? err.message : String(err)
    );
    return jsonResponse(
      { error: "Failed to load your CineLog vault" },
      500
    );
  }

  // ─── 5. Compute the summary ──────────────────────────────────────
  const summary = computeSummary(traktItems, vault);

  // ─── 6. Build a sample of new items for the UI ───────────────────
  // Show up to 10 new movies + 10 new shows so the user can see what
  // will be imported without us sending the entire history list.
  const sampleNewMovies: SampleItem[] = [];
  const sampleNewShows: SampleItem[] = [];
  const vaultKeySet = new Set(
    vault.map((v) => `${v.media_type}:${v.tmdb_id}`)
  );
  for (const item of traktItems) {
    if (vaultKeySet.has(`${item.media_type}:${item.tmdb_id}`)) continue;
    const sampleItem: SampleItem = {
      tmdb_id: item.tmdb_id,
      title: item.title,
      year: item.year,
      watched_at: item.watched_at,
      rating: item.rating
    };
    if (item.media_type === "movie" && sampleNewMovies.length < 10) {
      sampleNewMovies.push(sampleItem);
    } else if (item.media_type === "tv" && sampleNewShows.length < 10) {
      sampleNewShows.push(sampleItem);
    }
    if (sampleNewMovies.length >= 10 && sampleNewShows.length >= 10) break;
  }

  const response: PreviewResponse = {
    connected: true,
    trakt_username: integration.username,
    trakt_email: integration.email,
    summary,
    sample: {
      newMovies: sampleNewMovies,
      newShows: sampleNewShows
    },
    fetched_at: new Date().toISOString()
  };

  return jsonResponse(response);
}

// Reject POST — this is a read-only preview.
export async function POST(): Promise<Response> {
  return jsonResponse(
    { error: "Method not allowed. Use GET for the preview." },
    405
  );
}
