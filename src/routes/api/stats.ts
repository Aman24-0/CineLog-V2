// src/routes/api/stats.ts
//
// CineLog V2 — Server-Side Stats API (Phase 7 Task 3)
// ---------------------------------------------------------------------
// GET /api/stats?range=all|year|6months
//
// Returns the full statistics payload (`AllStats`) for the currently
// authenticated user, computed SERVER-SIDE.
//
// WHY SERVER-SIDE?
// ----------------
// The previous implementation computed stats client-side from the
// in-memory `WatchlistItem[]`. That works for small libraries but
// freezes the browser on the main thread once the vault grows past
// ~10k items (every calculator is O(n), and 10 of them run on every
// `useStatsData` recompute). Moving the computation server-side:
//
//   1. Keeps the main thread responsive — the browser just renders
//      the response JSON, no heavy iteration.
//   2. Allows us to use a Supabase materialized view (or, today,
//      a single vault fetch + pure calculators) without shipping
//      the calculator code to the client.
//   3. Is the architectural seam for future scaling: when we add a
//      materialized view or a pre-aggregated stats cache, only this
//      route changes — the client stays the same.
//
// ARCHITECTURE
// ------------
//   1. Authenticate via the Supabase server client's getSession()
//      (reads the access_token from the request cookies — see
//      Phase 7 Task 5 for the cookie-storage migration).
//   2. If no session: 401.
//   3. Call `fetchUserLibrary(userId)` — the SAME adapter the client
//      uses. This gives us the enriched `WatchlistItem[]` (with TMDB
//      metadata for genres, decades, runtime, etc.).
//   4. Optionally filter by date range (addedAt >= cutoff), mirroring
//      the client-side `useStatsData` filter.
//   5. Run `getStatsData(list)` — the SAME pure calculators.
//   6. Return the JSON with a short cache-control header.
//
// SECURITY
// --------
//   • The route uses the user-scoped server client (NOT the admin
//     client) so RLS policies are enforced — the user can only see
//     their own vault rows.
//   • The session is read from the request, not from a query param,
//     so the endpoint can't be used to enumerate other users' stats.
//   • The response includes `Cache-Control: private` so CDNs don't
//     cache one user's stats and serve them to another.

import { isServer } from "solid-js/web";
import { createServerClientFromRequest } from "~/lib/supabase/server";
import { fetchUserLibrary } from "~/shared/hooks/userLibraryAdapter";
import { getStatsData, type AllStats } from "~/lib/supabase/repositories/stats";
import type { WatchlistItem } from "~/shared/types";

interface APIEvent {
  request: Request;
}

interface StatsResponse {
  stats: AllStats | null;
  range: "all" | "year" | "6months";
  /** Total count BEFORE the date-range filter is applied. */
  totalTitlesAllTime: number;
  /** Server timestamp for client cache validation. */
  fetchedAt: string;
}

function jsonResponse(
  body: unknown,
  status = 200,
  opts?: {
    cacheControl?: string;
    /** Cookie jar from `createServerClientFromRequest` — its
     *  Set-Cookie headers + response headers are appended to the
     *  Response so refreshed auth tokens persist on the client and
     *  CDN-cache-prevention headers are set correctly. */
    cookieJar?: {
      toSetCookieHeaders: () => string[];
      getResponseHeaders: () => Record<string, string>;
    } | null;
  }
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  // Default to private, short cache — stats are per-user so CDNs must
  // not cache them. The browser may cache for 30s to avoid re-fetching
  // on rapid tab switches.
  headers["Cache-Control"] = opts?.cacheControl ?? "private, max-age=30, s-maxage=0";
  // Apply any response headers from the cookie jar (Cache-Control,
  // Expires, Pragma — set by supabase when auth cookies are written).
  // These OVERRIDE our defaults because supabase's "no-cache" headers
  // are stricter (correct — a response that sets auth cookies must NOT
  // be cached by CDNs/proxies).
  if (opts?.cookieJar) {
    for (const [key, value] of Object.entries(opts.cookieJar.getResponseHeaders())) {
      headers[key] = value;
    }
  }
  const response = new Response(JSON.stringify(body), { status, headers });
  // Append any Set-Cookie headers from the supabase client (e.g.
  // refreshed auth tokens). Using `append` (not `set`) so multiple
  // Set-Cookie headers are emitted correctly.
  if (opts?.cookieJar) {
    for (const header of opts.cookieJar.toSetCookieHeaders()) {
      response.headers.append("Set-Cookie", header);
    }
  }
  return response;
}

/**
 * Resolve a WatchlistItem's addedAt to a millisecond timestamp.
 * Mirrors the client-side helper in `useStatsData.ts` so the server
 * filter is identical to the client filter (no off-by-one bugs when
 * the user toggles between client/server modes).
 */
function addedAtToMs(addedAt: WatchlistItem["addedAt"]): number {
  if (!addedAt) return NaN;
  if (typeof addedAt === "string") return new Date(addedAt).getTime();
  if (addedAt instanceof Date) return addedAt.getTime();
  if (typeof addedAt === "object" && "seconds" in addedAt) {
    return addedAt.seconds * 1000;
  }
  return NaN;
}

/**
 * Compute the cutoff timestamp for the given date range.
 * Mirrors `cutoffForRange` in `useStatsData.ts`.
 */
function cutoffForRange(range: "all" | "year" | "6months"): number {
  if (range === "all") return 0;
  const now = new Date();
  if (range === "year") {
    return new Date(now.getFullYear(), 0, 1).getTime();
  }
  if (range === "6months") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 6);
    return d.getTime();
  }
  return 0;
}

/**
 * Parse + validate the `range` query param. Defaults to "all".
 * Returns null if the value is invalid (caller returns 400).
 */
function parseRange(value: string | null): "all" | "year" | "6months" | null {
  if (value === null || value === "") return "all";
  if (value === "all" || value === "year" || value === "6months") return value;
  return null;
}

export async function GET(event: APIEvent): Promise<Response> {
  // ── Guard: this route is server-only ──────────────────────────────
  // The `createServerClient` call throws on the browser, but we add
  // an explicit guard so the error message is clearer if the route
  // is somehow invoked during a client-side build.
  if (!isServer) {
    return jsonResponse({ error: "This route is server-only." }, 500);
  }

  // ── Parse query params ────────────────────────────────────────────
  const url = new URL(event.request.url);
  const range = parseRange(url.searchParams.get("range"));
  if (range === null) {
    return jsonResponse(
      { error: "Invalid `range`. Must be one of: all, year, 6months." },
      400
    );
  }

  // ── Authenticate via session (Bearer header preferred, cookie fallback) ─
  // Phase 13 Chunk 1: `createServerClientFromRequest` is now async and
  // Bearer-aware. When the browser sends `Authorization: Bearer
  // <token>`, the helper injects the session via `auth.setSession()`
  // so the `getSession()` call below returns the signed-in user. If
  // no Bearer header is present, it falls back to the legacy cookie
  // path (for SSR or server-to-server calls).
  let userId: string | null = null;
  let cookieJar: Awaited<ReturnType<typeof createServerClientFromRequest>>["cookies"] | null = null;
  try {
    const { client, cookies } = await createServerClientFromRequest(event.request);
    cookieJar = cookies;
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn("[api/stats] getSession error:", error.message);
    }
    userId = data.session?.user?.id ?? null;
  } catch (err) {
    console.error("[api/stats] Failed to read session:", err);
    return jsonResponse({ error: "Failed to read session." }, 500);
  }

  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ── Fetch the user's library (vault + TMDB enrichment) ────────────
  // This is the SAME adapter the client uses, so the stats are
  // identical to what the client would compute. The adapter handles
  // TMDB cache lookups (localStorage won't be available on the
  // server, so it falls back to the tmdb_cache table + TMDB API).
  let library: WatchlistItem[];
  try {
    library = await fetchUserLibrary(userId);
  } catch (err) {
    console.error("[api/stats] fetchUserLibrary failed:", err);
    return jsonResponse({ error: "Failed to load library." }, 500);
  }

  const totalTitlesAllTime = library.length;

  // ── Apply date-range filter ───────────────────────────────────────
  let filtered: WatchlistItem[];
  if (range === "all") {
    filtered = library;
  } else {
    const cutoff = cutoffForRange(range);
    filtered = library.filter((m) => {
      const ms = addedAtToMs(m.addedAt);
      if (isNaN(ms)) return false;
      return ms >= cutoff;
    });
  }

  // ── Compute stats ─────────────────────────────────────────────────
  // Empty library → return null (the client shows the empty state).
  if (filtered.length === 0) {
    const body: StatsResponse = {
      stats: null,
      range,
      totalTitlesAllTime,
      fetchedAt: new Date().toISOString()
    };
    return jsonResponse(body, 200, { cookieJar });
  }

  let stats: AllStats;
  try {
    stats = getStatsData(filtered);
  } catch (err) {
    console.error("[api/stats] getStatsData failed:", err);
    return jsonResponse({ error: "Failed to compute stats." }, 500, { cookieJar });
  }

  const body: StatsResponse = {
    stats,
    range,
    totalTitlesAllTime,
    fetchedAt: new Date().toISOString()
  };

  return jsonResponse(body, 200, { cookieJar });
}
