// src/routes/api/sync/trakt/execute.ts
//
// CineLog V2 — Trakt Sync Execute (Server-Only)
// ---------------------------------------------------------------------
// POST /api/sync/trakt/execute
//   → 200 {
//       ok: true,
//       imported: number,            // new items added to vault
//       updated: number,             // existing items updated with Trakt data
//       skipped: number,             // items skipped (no TMDB ID, etc.)
//       totalProcessed: number,
//       duration_ms: number,
//       trakt_username: string
//     }
//   → 401 if not signed in
//   → 409 if Trakt is not connected
//   → 422 if request body has invalid options
//   → 502 if Trakt API call fails
//   → 500 on server error
//
// WHAT THIS DOES:
//   Performs the actual bulk upsert of the user's Trakt history into
//   their CineLog vault. This is the "commit" step after the user has
//   reviewed the preview.
//
//   For each Trakt history item:
//     • movie  → vault row with media_type='movie', status='completed'
//     • show   → vault row with media_type='tv', status='completed'
//     • watched_at → vault.watched_on (most recent watch timestamp)
//     • rating (if present) → vault.rating (Trakt's 1-10 matches CineLog's 1-10)
//
//   UPSERT strategy (matches the existing BackupService.restore pattern):
//     • If a vault row with the same (user_id, tmdb_id, media_type)
//       already exists, it is UPDATED with the Trakt data — but only
//       the fields Trakt knows about (status, watched_on, rating).
//       User-owned fields like notes, is_favorite, is_pinned,
//       rewatch_count, etc. are PRESERVED.
//     • If no such row exists, a new one is INSERTED.
//
//   We use the service-role admin client for the upsert because the
//   user's anon-key session might not have clean write access to the
//   vault table via RLS in the route context (some clients reject
//   mutations when the access token has been verified but the session
//   cookie isn't a real supabase session). The admin client bypasses
//   RLS, but we've already verified the user's identity + ownership
//   of the integration row, so this is safe.
//
// SECURITY:
//   • Requires an authenticated CineLog session.
//   • The Trakt access_token is read from the DB (server-side only).
//   • The upsert is scoped to the verified user_id — we never write
//     to another user's vault.
//   • Trakt tokens NEVER appear in the response.

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

interface ExecuteRequestBody {
  /** Optional: if true, only import items that don't exist in the vault
   *  yet (skip conflicts). Defaults to false (upsert all). */
  skipConflicts?: unknown;
  /** Optional: if true, overwrite the existing rating with the Trakt
   *  rating when there's a conflict. Defaults to false (keep user's
   *  existing rating). */
  overwriteRating?: unknown;
}

interface ExecuteResponse {
  ok: true;
  imported: number;
  updated: number;
  skipped: number;
  totalProcessed: number;
  duration_ms: number;
  trakt_username: string;
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
 * Load the user's Trakt integration row.
 */
async function loadTraktIntegration(userId: string): Promise<{
  accessToken: string;
  username: string;
} | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_integrations")
    .select("access_token, provider_user_id")
    .eq("user_id", userId)
    .eq("provider", "trakt")
    .maybeSingle();

  if (error) {
    throw new Error(`[trakt/execute] DB read failed: ${error.message}`);
  }
  if (!data) return null;

  return {
    accessToken: data.access_token,
    username: data.provider_user_id ?? "me"
  };
}

/**
 * Vault row shape used by the upsert comparison. We only need the
 * fields that determine whether we INSERT or UPDATE.
 */
interface VaultRow {
  id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  status: string;
  rating: number | null;
  watched_on: string | null;
}

/**
 * Load the user's existing vault rows for the items we're about to
 * import. We only need rows whose (tmdb_id, media_type) appear in
 * the Trakt list — fetching all rows is wasteful for users with
 * large vaults.
 *
 * Uses the service-role admin client (we've already verified the user,
 * and scoping by user_id ensures we only see their rows).
 */
async function loadMatchingVaultRows(
  userId: string,
  traktItems: NormalizedTraktItem[]
): Promise<Map<string, VaultRow>> {
  if (traktItems.length === 0) return new Map();

  const admin = createAdminClient();
  // Build arrays of (tmdb_id, media_type) pairs to filter on.
  // Supabase's `in` filter only works on a single column, so we
  // fetch by tmdb_id list AND media_type, then filter in JS.
  // For very large Trakt histories (5000+ items), we may need to
  // batch this — but a single in() filter handles up to ~32k items
  // in Postgres, and Supabase's HTTP layer paginates under the hood.
  const tmdbIds = Array.from(new Set(traktItems.map((i) => i.tmdb_id)));

  const { data, error } = await admin
    .from("vault")
    .select("id, tmdb_id, media_type, status, rating, watched_on")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("tmdb_id", tmdbIds);

  if (error) {
    throw new Error(`[trakt/execute] Vault read failed: ${error.message}`);
  }

  const byKey = new Map<string, VaultRow>();
  for (const row of (data ?? []) as VaultRow[]) {
    byKey.set(`${row.media_type}:${row.tmdb_id}`, row);
  }
  return byKey;
}

/**
 * Convert a Trakt history item into a vault row payload for INSERT.
 * Used when no existing vault row matches.
 */
function buildInsertPayload(
  userId: string,
  item: NormalizedTraktItem
): Record<string, unknown> {
  return {
    user_id: userId,
    tmdb_id: item.tmdb_id,
    media_type: item.media_type,
    status: "completed",
    rating: item.rating,
    watched_on: item.watched_at,
    completed_at: item.watched_at,
    last_activity_at: item.watched_at,
    is_favorite: false,
    is_pinned: false,
    rewatch_count: 0
  };
}

/**
 * Convert a Trakt history item into a vault row payload for UPDATE.
 * Only updates fields that Trakt knows about — preserves user-owned
 * fields like notes, is_favorite, etc.
 *
 * @param existing  The existing vault row.
 * @param item      The Trakt history item.
 * @param overwriteRating  If true, overwrite the existing rating with
 *                         Trakt's. If false, keep the user's existing
 *                         rating when both are non-null.
 */
function buildUpdatePayload(
  existing: VaultRow,
  item: NormalizedTraktItem,
  overwriteRating: boolean
): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  // Always set status to 'completed' (Trakt history implies completed).
  if (existing.status !== "completed") {
    update.status = "completed";
  }

  // Update watched_on if Trakt's is more recent (or missing).
  // We keep the more recent of the two timestamps.
  if (item.watched_at) {
    if (!existing.watched_on || item.watched_at > existing.watched_on) {
      update.watched_on = item.watched_at;
    }
  }

  // Rating — only update if overwriteRating is true OR the user has no
  // existing rating. Never overwrite a user-set rating without explicit
  // opt-in (overwriteRating=true).
  if (item.rating !== null) {
    if (existing.rating === null) {
      update.rating = item.rating;
    } else if (overwriteRating && item.rating !== existing.rating) {
      update.rating = item.rating;
    }
  }

  // Update last_activity_at if we're updating watched_on.
  if (update.watched_on) {
    update.last_activity_at = update.watched_on;
  }
  // completed_at — only set if not already set (don't overwrite the
  // user's first-completed timestamp with a later Trakt timestamp).
  if (item.watched_at && !existing.id) {
    // (existing.id is always set for UPDATE, but this is defensive)
    update.completed_at = item.watched_at;
  }

  return update;
}

/**
 * Perform a batched upsert into the vault table.
 *
 * Supabase's REST API accepts arrays for INSERT, but UPDATE needs to
 * be per-row (since each row may have a different update payload).
 * We batch INSERTs in groups of 100 (Supabase's default max) and
 * run UPDATEs sequentially with a small delay to avoid rate limits.
 *
 * This mirrors the resilience pattern in src/features/sync/backup/restore.ts
 * — failures are collected, the loop continues, and we report a final
 * count at the end.
 */
async function performBulkUpsert(
  userId: string,
  traktItems: NormalizedTraktItem[],
  options: { skipConflicts: boolean; overwriteRating: boolean }
): Promise<{ imported: number; updated: number; skipped: number }> {
  const admin = createAdminClient();

  // Load existing rows so we can decide INSERT vs UPDATE per item.
  const existingByKey = await loadMatchingVaultRows(userId, traktItems);

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: Array<{ id: string; payload: Record<string, unknown> }> = [];
  let skipped = 0;

  for (const item of traktItems) {
    const key = `${item.media_type}:${item.tmdb_id}`;
    const existing = existingByKey.get(key);

    if (!existing) {
      // New item — INSERT.
      toInsert.push(buildInsertPayload(userId, item));
      continue;
    }

    // Existing item — UPDATE (unless skipConflicts is set).
    if (options.skipConflicts) {
      // Check if there's actually a conflict — if the existing row
      // already has status='completed', same rating, and a watched_on
      // >= Trakt's, then there's nothing to update and we can skip
      // even without skipConflicts.
      const noChangeNeeded =
        existing.status === "completed" &&
        (existing.rating === item.rating ||
          item.rating === null ||
          (!options.overwriteRating && existing.rating !== null)) &&
        (existing.watched_on && item.watched_at <= existing.watched_on);
      if (noChangeNeeded) {
        skipped += 1;
        continue;
      }
      // skipConflicts=true means skip items that would change existing data.
      skipped += 1;
      continue;
    }

    const payload = buildUpdatePayload(existing, item, options.overwriteRating);
    // If the payload is empty, there's nothing to update.
    if (Object.keys(payload).length === 0) {
      skipped += 1;
      continue;
    }
    toUpdate.push({ id: existing.id, payload });
  }

  // ─── Batched INSERT (100 at a time) ──────────────────────────────
  const INSERT_BATCH_SIZE = 100;
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += INSERT_BATCH_SIZE) {
    const batch = toInsert.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await admin.from("vault").insert(batch);
    if (error) {
      console.error(
        `[trakt/execute] Insert batch ${i / INSERT_BATCH_SIZE + 1} failed:`,
        error.message
      );
      // Continue with the next batch — partial success is better than
      // aborting the whole import. The user will see the imported count
      // and can re-run if needed.
      continue;
    }
    imported += batch.length;
  }

  // ─── Per-row UPDATE (sequentially, 30ms delay) ───────────────────
  // Updates can't be batched because each row has a different payload.
  // The 30ms delay keeps us under Supabase's rate limit (matches the
  // pattern in BackupService.restore).
  let updated = 0;
  for (const { id, payload } of toUpdate) {
    const { error } = await admin
      .from("vault")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId); // defensive — never update another user's row

    if (error) {
      console.error(
        `[trakt/execute] Update for vault row ${id} failed:`,
        error.message
      );
      continue;
    }
    updated += 1;
    // Small delay to avoid hitting Supabase's per-second rate limit.
    // Only delay if we have more updates to do.
    await new Promise((r) => setTimeout(r, 30));
  }

  return { imported, updated, skipped };
}

// ─── POST handler ─────────────────────────────────────────────────

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  const startTime = Date.now();

  // ─── 1. Verify session ───────────────────────────────────────────
  const userId = await requireSignedInUser(event.request);
  if (!userId) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  // ─── 2. Parse body (optional) ────────────────────────────────────
  let body: ExecuteRequestBody = {};
  try {
    const text = await event.request.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text) as ExecuteRequestBody;
    }
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const skipConflicts = body.skipConflicts === true;
  const overwriteRating = body.overwriteRating === true;

  // ─── 3. Load the Trakt integration ───────────────────────────────
  let integration: { accessToken: string; username: string } | null;
  try {
    integration = await loadTraktIntegration(userId);
  } catch (err) {
    console.error(
      "[trakt/execute] Integration load failed:",
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

  // ─── 4. Fetch the Trakt history (with ratings) ───────────────────
  let traktItems: NormalizedTraktItem[];
  try {
    traktItems = await getNormalizedTraktHistory(
      integration.accessToken,
      integration.username
    );
  } catch (err) {
    console.error(
      "[trakt/execute] Trakt API call failed:",
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

  if (traktItems.length === 0) {
    // No history to import — return early with a zero-count success.
    return jsonResponse({
      ok: true,
      imported: 0,
      updated: 0,
      skipped: 0,
      totalProcessed: 0,
      duration_ms: Date.now() - startTime,
      trakt_username: integration.username
    } satisfies ExecuteResponse);
  }

  // ─── 5. Perform the bulk upsert ──────────────────────────────────
  let result: { imported: number; updated: number; skipped: number };
  try {
    result = await performBulkUpsert(userId, traktItems, {
      skipConflicts,
      overwriteRating
    });
  } catch (err) {
    console.error(
      "[trakt/execute] Bulk upsert failed:",
      err instanceof Error ? err.message : String(err)
    );
    return jsonResponse(
      { error: "Bulk upsert failed. Partial changes may have been applied." },
      500
    );
  }

  const response: ExecuteResponse = {
    ok: true,
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
    totalProcessed: traktItems.length,
    duration_ms: Date.now() - startTime,
    trakt_username: integration.username
  };

  console.log(
    `[trakt/execute] User ${userId} synced Trakt: imported=${result.imported}, ` +
      `updated=${result.updated}, skipped=${result.skipped}, ` +
      `duration=${response.duration_ms}ms`
  );

  return jsonResponse(response);
}

// Reject GET — this is a write endpoint.
export async function GET(): Promise<Response> {
  return jsonResponse(
    { error: "Method not allowed. Use POST to execute the sync." },
    405
  );
}
