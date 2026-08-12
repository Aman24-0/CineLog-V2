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
//   1. Authenticate via Bearer token (getSupabaseAccessTokenFromRequest
//      + getUser()) — stateless, cookie-free.
//   2. Call `fetchUserLibrary(userId)` — the SAME adapter the client
//      uses, so the vault is TMDB-enriched (genres, directors, etc.).
//   3. Call `computeTasteProfile(list, isGuest=false)` — the SHARED
//      pure function from `src/lib/discover/tasteProfile.ts`.
//   4. Return the JSON.
//
// SECURITY
// --------
//   • Verifies the Bearer token via getUser() before proceeding —
//     unverified tokens are rejected with 401.
//   • Response is `Cache-Control: private` so CDNs don't leak one
//     user's taste profile to another.

import { isServer } from "solid-js/web";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAccessTokenFromRequest } from "~/lib/supabase/admin/sessionCookie";
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
  }
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  // Private cache — taste profiles are per-user. Short max-age so the
  // profile stays fresh as the user rates new titles.
  headers["Cache-Control"] = opts?.cacheControl ?? "private, max-age=60, s-maxage=0";
  return new Response(JSON.stringify(body), { status, headers });
}

export async function GET(event: APIEvent): Promise<Response> {
  // ── Guard: server-only ────────────────────────────────────────────
  if (!isServer) {
    return jsonResponse({ error: "This route is server-only." }, 500);
  }

  // ── Authenticate via Bearer header ───────────────────────────────────
  // Extract the access token from the Authorization header. This is
  // the stateless, cookie-free pattern: the client sends the JWT it
  // already has, and we verify it server-side via getUser(). No
  // session cookies, no refresh-token handling, no cookie jar.
  const accessToken = getSupabaseAccessTokenFromRequest(event.request);
  if (!accessToken) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let userId: string;
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[api/discover/taste] Missing Supabase env vars");
      return jsonResponse({ error: "Server misconfiguration." }, 500);
    }

    // Verify the token via getUser() — never trust the header payload
    // directly since headers can be tampered with.
    const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await verifyClient.auth.getUser(accessToken);
    if (error || !data?.user) {
      console.warn("[api/discover/taste] getUser verification failed:", error?.message);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    userId = data.user.id;
  } catch (err) {
    console.error("[api/discover/taste] Failed to verify token:", err);
    return jsonResponse({ error: "Failed to verify token." }, 500);
  }

  // ── Fetch the user's library (vault + TMDB enrichment) ────────────
  let library: Awaited<ReturnType<typeof fetchUserLibrary>>;
  try {
    library = await fetchUserLibrary(userId);
  } catch (err) {
    console.error("[api/discover/taste] fetchUserLibrary failed:", err);
    return jsonResponse({ error: "Failed to load library." }, 500);
  }

  // ── Compute the taste profile ─────────────────────────────────────
  // `isGuest=false` because we have an authenticated session.
  const profile = computeTasteProfile(library, false);

  const body: TasteResponse = {
    profile,
    fetchedAt: new Date().toISOString()
  };

  return jsonResponse(body, 200);
}
