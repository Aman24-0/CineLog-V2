// src/routes/api/ott-providers/[tmdbId].ts
//
// CineLog V2 — Server API: OTT Provider Availability
// ---------------------------------------------------------------------
// Returns provider availability data for a TMDB title from JustWatch.
//
// Endpoint:
//   GET /api/ott-providers/{tmdbId}?type={movie|tv}
//
// Query params:
//   type    — "movie" | "tv" (required). Default: "movie".
//   region  — Optional admin override (ISO 3166-1 alpha-2). When
//             omitted, the endpoint reads the signed-in user's
//             profile.country dynamically.
//   title   — Optional title string for JustWatch search. If omitted,
//             the endpoint attempts to fetch it from TMDB.
//   refresh — "1" to force a fresh worker run (ignores cache).
//
// Response (200):
//   {
//     "tmdbId": 530385,
//     "type": "movie",
//     "region": "IN",
//     "providers": [
//       { "providerName": "Netflix", "monetizationType": "flatrate" },
//       { "providerName": "Prime Video", "monetizationType": "rent" }
//     ],
//     "checkedAt": "...",
//     "justWatchNodeId": "...",
//     "fromCache": false,
//     "stale": false
//   }
//
// Behavior:
//   1. Resolve the user's profile country (session cookie → profiles).
//      Fall back to "US" if signed-out or no country set.
//   2. Check ott_provider_availability cache for (media_type, tmdb_id, region).
//   3. Fresh → return immediately.
//   4. Stale → return stale + trigger background refresh (non-blocking).
//   5. No cache → run worker synchronously, write to cache, return.

import {
  getProviderAvailability
} from "~/server/ott-providers/worker";
import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";
import { createClient } from "@supabase/supabase-js";
import type { TitleType } from "~/server/ott-providers/types";

interface APIEventExt {
  request: Request;
}

function buildCorsHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json"
  };
}

const CACHE_HEADERS_SUCCESS = {
  "Cache-Control": "public, max-age=300, s-maxage=600"
};
const CACHE_HEADERS_ERROR = {
  "Cache-Control": "public, max-age=60, s-maxage=120"
};

/**
 * Resolve the signed-in user's profile country (ISO 3166-1 alpha-2).
 * Returns "US" as a safe fallback.
 */
async function resolveProfileCountry(request: Request): Promise<string> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return "US";

  const cookieHeader = request.headers.get("cookie") ?? "";
  const accessToken = getSupabaseAccessToken(cookieHeader);
  if (!accessToken) return "US";

  try {
    const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: userData, error: userErr } =
      await verifyClient.auth.getUser(accessToken);
    if (userErr || !userData?.user?.id) return "US";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const { data: profile, error: profileErr } = await userClient
      .from("profiles")
      .select("country")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileErr || !profile) return "US";
    const country = (profile as { country?: string }).country;
    if (!country || country.length !== 2) return "US";
    return country.toUpperCase();
  } catch (err) {
    console.warn("[ott-providers API] resolveProfileCountry failed:", err);
    return "US";
  }
}

export async function GET(event: APIEventExt): Promise<Response> {
  const corsHeaders = buildCorsHeaders();

  try {
    const url = new URL(event.request.url);

    const segments = url.pathname.split("/").filter(Boolean);
    const tmdbIdStr = segments[segments.length - 1] ?? "";
    const tmdbId = parseInt(tmdbIdStr, 10);

    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      return new Response(
        JSON.stringify({ error: `Invalid tmdb id: "${tmdbIdStr}"` }),
        { status: 400, headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR } }
      );
    }

    const rawType = url.searchParams.get("type") ?? "movie";
    const type: TitleType = rawType === "tv" ? "tv" : "movie";

    const overrideRegion = url.searchParams.get("region");
    const region =
      overrideRegion && /^[A-Za-z]{2}$/.test(overrideRegion)
        ? overrideRegion.toUpperCase()
        : await resolveProfileCountry(event.request);

    const forceRefresh = url.searchParams.get("refresh") === "1";
    const title = url.searchParams.get("title") ?? undefined;

    const { result, fromCache, stale } = await getProviderAvailability({
      tmdbId,
      type,
      region,
      title,
      forceRefresh,
      backgroundRefreshIfStale: true
    });

    return new Response(
      JSON.stringify({
        tmdbId,
        type,
        region,
        providers: result.providers,
        checkedAt: result.checkedAt,
        justWatchNodeId: result.justWatchNodeId,
        fromCache,
        stale
      }),
      { status: 200, headers: { ...corsHeaders, ...CACHE_HEADERS_SUCCESS } }
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[ott-providers API] GET error:", errMsg);
    return new Response(
      JSON.stringify({
        error: "Unable to retrieve provider availability.",
        message: errMsg
      }),
      { status: 500, headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR } }
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      ...buildCorsHeaders(),
      "Access-Control-Max-Age": "86400"
    }
  });
}
