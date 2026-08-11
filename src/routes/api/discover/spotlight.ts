// src/routes/api/discover/spotlight.ts
//
// CineLog V2 — Spotlight DB Persistence (Phase 18 deep fix)
// ---------------------------------------------------------------------
// GET  /api/discover/spotlight        — read today's cached Spotlight pick
// POST /api/discover/spotlight        — persist today's Spotlight pick
//
// WHY THIS ROUTE EXISTS
// ---------------------
// The Spotlight (the daily rotating hero on the Discover page) previously
// cached its daily pick ONLY in localStorage. Because localStorage is
// per-browser, the same user signed in on Chrome and Lemur would see
// DIFFERENT Spotlight picks on the same day — each browser generated +
// cached its own pick independently. This is the root cause of the
// "Spotlight differs between browsers" bug.
//
// The deep fix is to mirror the daily pick in the user_preferences table
// (prefs_json.spotlight), so all browsers signed in as the same user see
// the SAME pick for the same day. The localStorage cache remains as a
// fast first-paint fallback (no API call needed on a refresh within the
// same browser), but the DB is the source of truth across browsers.
//
// FLOW
// ----
//   GET:
//     1. Authenticate via Authorization: Bearer header.
//     2. Read user_preferences.prefs_json.spotlight.
//     3. If the cached pick's date matches today, return it.
//     4. Otherwise return 404 (no cached pick for today — the client
//        will generate a fresh one and POST it).
//
//   POST:
//     1. Authenticate via Authorization: Bearer header.
//     2. Validate the request body: must have a SpotlightPick + date.
//     3. Read the current prefs_json, merge the spotlight key, upsert.
//     4. Return 200 on success.
//
// STORAGE SHAPE
// -------------
//   user_preferences.prefs_json.spotlight = {
//     date: "2026-08-12",            // YYYY-MM-DD
//     pick: SpotlightPick,           // the full pick object
//     seen: Record<string, number>   // optional: 30-day seen-titles map
//   }
//
// The `seen` field is OPTIONAL — if the client sends it, we persist it
// so other browsers also exclude those titles from future picks. This
// makes the 30-day no-repeat rule work ACROSS browsers, not just within
// a single browser.
//
// COMPLIANCE
// ----------
//   - Auth: Bearer header (no @supabase/ssr cookies).
//   - Rate limiting: not added (the route is cheap — one DB read/write).
//   - Design system: unchanged.

import { isServer } from "solid-js/web";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAccessTokenFromRequest } from "~/lib/supabase/admin/sessionCookie";
import { saveExtendedPreference } from "~/lib/supabase/repositories/settings";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpotlightPick } from "~/shared/types";

interface APIEvent {
  request: Request;
}

interface CachedSpotlight {
  /** YYYY-MM-DD — the day this pick was cached for. */
  date: string;
  /** The serialized SpotlightPick. */
  pick: SpotlightPick;
  /** Optional: 30-day seen-titles map (mediaType:tmdbId → timestamp). */
  seen?: Record<string, number>;
}

interface GetResponse {
  spotlight: CachedSpotlight | null;
}

interface PostBody {
  date: string;
  pick: SpotlightPick;
  seen?: Record<string, number>;
}

interface ErrorResponse {
  error: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Private cache — Spotlight is per-user. s-maxage=0 prevents CDN
      // caching entirely (the pick changes daily + is user-scoped).
      "Cache-Control": "private, max-age=0, s-maxage=0, no-store"
    }
  });
}

/**
 * Authenticate the caller via the Bearer header. Returns the user id
 * and a user-scoped Supabase client, or null on failure.
 */
async function requireSignedInUser(
  request: Request
): Promise<{ userId: string; userClient: SupabaseClient } | null> {
  const accessToken = getSupabaseAccessTokenFromRequest(request);
  if (!accessToken) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await verifyClient.auth.getUser(accessToken);
  if (error || !data?.user) return null;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });

  return { userId: data.user.id, userClient };
}

/**
 * Read the cached Spotlight pick from user_preferences.prefs_json.spotlight.
 * Returns null if no row, no prefs_json, or no spotlight key.
 */
async function readCachedSpotlight(
  userClient: SupabaseClient,
  userId: string
): Promise<CachedSpotlight | null> {
  try {
    const { data, error } = await userClient
      .from("user_preferences")
      .select("prefs_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;
    const prefs = data.prefs_json as Record<string, unknown> | null;
    if (!prefs) return null;
    const spotlight = prefs.spotlight as Partial<CachedSpotlight> | undefined;
    if (
      !spotlight ||
      typeof spotlight.date !== "string" ||
      typeof spotlight.pick !== "object" ||
      spotlight.pick === null
    ) {
      return null;
    }
    return spotlight as CachedSpotlight;
  } catch (err) {
    console.warn("[api/discover/spotlight] cache read failed:", err);
    return null;
  }
}

/** Return today's date as YYYY-MM-DD in the server's local timezone. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── GET /api/discover/spotlight ──────────────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "This route is server-only." } satisfies ErrorResponse, 500);
  }

  let auth: { userId: string; userClient: SupabaseClient } | null;
  try {
    auth = await requireSignedInUser(event.request);
  } catch (err) {
    console.error("[api/discover/spotlight] session read failed:", err);
    return jsonResponse({ error: "Failed to read session." } satisfies ErrorResponse, 500);
  }
  if (!auth) {
    return jsonResponse({ error: "Unauthorized" } satisfies ErrorResponse, 401);
  }

  const cached = await readCachedSpotlight(auth.userClient, auth.userId);
  if (cached && cached.date === todayKey()) {
    return jsonResponse({ spotlight: cached } satisfies GetResponse, 200);
  }

  // No cached pick for today — return 404 so the client knows to
  // generate a fresh one and POST it back.
  return jsonResponse({ spotlight: null } satisfies GetResponse, 404);
}

// ─── POST /api/discover/spotlight ─────────────────────────────────

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "This route is server-only." } satisfies ErrorResponse, 500);
  }

  let auth: { userId: string; userClient: SupabaseClient } | null;
  try {
    auth = await requireSignedInUser(event.request);
  } catch (err) {
    console.error("[api/discover/spotlight] session read failed:", err);
    return jsonResponse({ error: "Failed to read session." } satisfies ErrorResponse, 500);
  }
  if (!auth) {
    return jsonResponse({ error: "Unauthorized" } satisfies ErrorResponse, 401);
  }
  const { userId, userClient } = auth;

  let body: PostBody;
  try {
    body = (await event.request.json()) as PostBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." } satisfies ErrorResponse, 400);
  }

  if (
    !body ||
    typeof body.date !== "string" ||
    typeof body.pick !== "object" ||
    body.pick === null
  ) {
    return jsonResponse({ error: "Invalid body — expected { date, pick }." } satisfies ErrorResponse, 400);
  }

  const payload: CachedSpotlight = {
    date: body.date,
    pick: body.pick,
    ...(body.seen !== undefined && { seen: body.seen })
  };

  // saveExtendedPreference reads the current prefs_json, merges the
  // spotlight key, and upserts. We pass the user-scoped client so RLS
  // is enforced (owner-only write).
  //
  // IMPORTANT: saveExtendedPreference returns { error } — it does NOT
  // throw. We MUST check the returned error field (Phase 18 deep fix:
  // this was the root cause of the AI recommendations cache silently
  // failing — the caller's try/catch never triggered because the
  // function returned the error instead of throwing it).
  const { error: saveError } = await saveExtendedPreference(
    userId,
    "spotlight",
    payload,
    userClient
  );

  if (saveError) {
    console.error("[api/discover/spotlight] cache write failed:", saveError.message);
    return jsonResponse({ error: "Failed to persist Spotlight pick." } satisfies ErrorResponse, 500);
  }

  return jsonResponse({ ok: true }, 200);
}
