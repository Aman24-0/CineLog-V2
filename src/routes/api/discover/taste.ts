// src/routes/api/discover/taste.ts
//
// CineLog V2 — Server-Side Taste Profile API (Phase 7 Task 4)
// ---------------------------------------------------------------------
// GET /api/discover/taste
//
// Returns the authenticated user's `TasteProfile` computed SERVER-SIDE.
//
// WHY SERVER-SIDE?
// ----------------
// The taste profile is the architectural seam for future ML /
// collaborative-filtering recommendations. Today it's a pure
// heuristic over the vault; tomorrow it can call an ML model or an
// LLM. Moving the computation server-side NOW means:
//
//   1. The client stays a thin consumer — no heuristic code shipped
//      to the browser. When we swap in an ML model, only this route
//      changes; the Discover page is unaffected.
//   2. The route can call Supabase directly (no client-side round-
//      trip for the vault) and can use heavy ML libraries that would
//      bloat the client bundle.
//   3. The route can be cached at the edge (per-user) so repeat
//      visits are instant.
//
// ARCHITECTURE
// ------------
//   1. Authenticate via the Supabase server client's getSession().
//   2. Call `fetchUserLibrary(userId)` — the SAME adapter the client
//      uses, so the vault is TMDB-enriched (genres, directors, etc.).
//   3. Call `computeTasteProfile(list, isGuest=false)` — the SHARED
//      pure function from `src/lib/discover/tasteProfile.ts`.
//   4. Return the JSON.
//
// SECURITY
// --------
//   • Uses the user-scoped server client (NOT admin) so RLS is
//     enforced — the user can only see their own vault.
//   • Response is `Cache-Control: private` so CDNs don't leak one
//     user's taste profile to another.

import { isServer } from "solid-js/web";
import { createServerClientFromRequest } from "~/lib/supabase/server";
import { fetchUserLibrary } from "~/shared/hooks/userLibraryAdapter";
import { computeTasteProfile } from "~/lib/discover/tasteProfile";
import type { TasteProfile } from "~/shared/types";

interface APIEvent {
  request: Request;
}

interface TasteResponse {
  profile: TasteProfile;
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
  // Private cache — taste profiles are per-user. Short max-age so the
  // profile stays fresh as the user rates new titles.
  headers["Cache-Control"] = opts?.cacheControl ?? "private, max-age=60, s-maxage=0";
  if (opts?.cookieJar) {
    for (const [key, value] of Object.entries(opts.cookieJar.getResponseHeaders())) {
      headers[key] = value;
    }
  }
  const response = new Response(JSON.stringify(body), { status, headers });
  if (opts?.cookieJar) {
    for (const header of opts.cookieJar.toSetCookieHeaders()) {
      response.headers.append("Set-Cookie", header);
    }
  }
  return response;
}

export async function GET(event: APIEvent): Promise<Response> {
  // ── Guard: server-only ────────────────────────────────────────────
  if (!isServer) {
    return jsonResponse({ error: "This route is server-only." }, 500);
  }

  // ── Authenticate via session cookie ───────────────────────────────
  // The server client reads the access_token from the request's
  // httpOnly cookies (Phase 7 Task 5). If the supabase client refreshes
  // an expired token during this request, the new cookie values are
  // collected in `cookieJar` and flushed to the Response below.
  let userId: string | null = null;
  let cookieJar: ReturnType<typeof createServerClientFromRequest>["cookies"] | null = null;
  try {
    const { client, cookies } = createServerClientFromRequest(event.request);
    cookieJar = cookies;
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn("[api/discover/taste] getSession error:", error.message);
    }
    userId = data.session?.user?.id ?? null;
  } catch (err) {
    console.error("[api/discover/taste] Failed to read session:", err);
    return jsonResponse({ error: "Failed to read session." }, 500);
  }

  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ── Fetch the user's library (vault + TMDB enrichment) ────────────
  let library: Awaited<ReturnType<typeof fetchUserLibrary>>;
  try {
    library = await fetchUserLibrary(userId);
  } catch (err) {
    console.error("[api/discover/taste] fetchUserLibrary failed:", err);
    return jsonResponse({ error: "Failed to load library." }, 500, { cookieJar });
  }

  // ── Compute the taste profile ─────────────────────────────────────
  // `isGuest=false` because we have an authenticated session.
  const profile = computeTasteProfile(library, false);

  const body: TasteResponse = {
    profile,
    fetchedAt: new Date().toISOString()
  };

  return jsonResponse(body, 200, { cookieJar });
}
