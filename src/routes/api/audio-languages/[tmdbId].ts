// src/routes/api/audio-languages/[tmdbId].ts
//
// CineLog V2 — Server API: Audio Languages
// ---------------------------------------------------------------------
// Returns dubbed-audio language information for a TMDB title.
//
// Endpoint:
//   GET /api/audio-languages/{tmdbId}?type={movie|tv}
//
// Query params:
//   type    — "movie" | "tv" (required). Default: "movie".
//   region  — Optional admin override (ISO 3166-1 alpha-2). When
//             omitted, the endpoint reads the signed-in user's
//             profile.country dynamically. Per spec §7: do NOT
//             hard-code "IN".
//   refresh — "1" to force a fresh worker run (ignores cache).
//
// Response (200):
//   {
//     "tmdbId": 530385,
//     "type": "movie",
//     "originalLanguages": [{ "code": "en", "name": "English" }],
//     "dubbedLanguages": [
//       { "code": "hi", "name": "Hindi", "confidence": "high",
//         "sources": ["JustWatch"] }
//     ],
//     "status": "success",
//     "checkedAt": "...",
//     "region": "IN",            // INTERNAL — for cache/debug only.
//                                // The UI does NOT render this.
//     "noData": false,
//     "error": false,
//     "sourceCount": 1,
//     "fromCache": false
//   }
//
// Behavior:
//   1. Resolve the user's profile country (session cookie → profiles).
//      Fall back to "US" if signed-out or no country set.
//   2. Check audio_languages_cache for (media_type, tmdb_id, region).
//   3. Fresh → return immediately.
//   4. Stale → return stale + trigger background refresh (non-blocking).
//   5. No cache → run worker synchronously, write to cache, return.
//
// Per spec §11: the response retains the region internally (for
// debugging + cache), but the frontend MUST NOT render it in the
// Language modal. See AudioLanguageModal.tsx.
//
// Per spec §1: TMDB translations are NOT used as an audio source.
// Only JustWatch `offer.audioLanguages` populates `dubbedLanguages`.
//
// Per spec STEP 22: the audio-language worker runs INDEPENDENTLY of the
// movie detail page. A failure here does NOT break the detail page —
// the modal shows an error state but the rest of the page works.

import { createClient } from "@supabase/supabase-js";
import {
  getAudioLanguages,
  DEFAULT_REGION,
  refreshStaleEntries
} from "~/server/audio-language/worker";
import { excludeDetected } from "~/server/audio-language/resolver";
import type { AudioLanguageApiResponse, TitleType } from "~/server/audio-language/types";
import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";

// ─── Types ────────────────────────────────────────────────────────────
interface APIEvent {
  request: Request;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Determine the allowed CORS origin for a request. Same pattern as
 * /api/media/ratings.ts — only allow the app's own domain.
 */
function getAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  let appBaseUrl: string;
  try {
    appBaseUrl =
      (import.meta as ImportMeta & { env?: Record<string, string> }).env
        ?.VITE_APP_BASE_URL ?? "https://cinelogv2.vercel.app";
  } catch {
    appBaseUrl = "https://cinelogv2.vercel.app";
  }
  appBaseUrl = appBaseUrl.replace(/\/+$/, "");
  const allowedOrigins = [appBaseUrl];
  if (appBaseUrl.includes("vercel.app")) {
    try {
      const url = new URL(origin);
      if (url.hostname.endsWith(".vercel.app")) return origin;
    } catch {
      /* ignore */
    }
  }
  if (
    appBaseUrl.includes("localhost") ||
    origin.startsWith("http://localhost:") ||
    origin === "http://localhost:3000"
  ) {
    allowedOrigins.push("http://localhost:3000");
    if (origin.startsWith("http://localhost:")) return origin;
  }
  if (allowedOrigins.includes(origin)) return origin;
  return null;
}

function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = getAllowedOrigin(request);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin"
  };
}

// Short cache for success — let the CDN hold the response for 5 min so
// rapid re-opens don't re-hit the worker. The cache table TTL is 14 days
// so this is just a CDN edge cache.
const CACHE_HEADERS_SUCCESS = {
  "Cache-Control": "public, max-age=300, s-maxage=600"
};
const CACHE_HEADERS_ERROR = {
  "Cache-Control": "public, max-age=60, s-maxage=120"
};

/**
 * Resolve the signed-in user's profile country (ISO 3166-1 alpha-2).
 *
 * Per spec §7: the user's profile country MUST be the source region
 * used for region-dependent services. We do NOT hard-code "IN".
 *
 * Flow:
 *   1. Read the Supabase access_token from the cookie.
 *   2. Verify it via getUser() (never trust the cookie payload directly).
 *   3. Look up the user's profile row and read `country`.
 *
 * Returns DEFAULT_REGION ("US") when:
 *   - the user is not signed in (anonymous access is allowed — the
 *     detail page works without auth)
 *   - env vars are missing
 *   - the profile has no country set (legacy account)
 *   - any error occurs (fail-open: better to serve US data than to
 *     break the modal)
 */
async function resolveProfileCountry(request: Request): Promise<string> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return DEFAULT_REGION;

  const cookieHeader = request.headers.get("cookie") ?? "";
  const accessToken = getSupabaseAccessToken(cookieHeader);
  if (!accessToken) return DEFAULT_REGION;

  try {
    // Verify the token — never trust the cookie payload directly.
    const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: userData, error: userErr } =
      await verifyClient.auth.getUser(accessToken);
    if (userErr || !userData?.user?.id) return DEFAULT_REGION;

    // Read the profile row using the user-scoped client (RLS enforces
    // owner-only read on profiles).
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const { data: profile, error: profileErr } = await userClient
      .from("profiles")
      .select("country")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileErr || !profile) return DEFAULT_REGION;
    const country = (profile as { country?: string }).country;
    if (!country || country.length !== 2) return DEFAULT_REGION;
    return country.toUpperCase();
  } catch (err) {
    console.warn("[audio-languages API] resolveProfileCountry failed:", err);
    return DEFAULT_REGION;
  }
}

// ─── GET handler ──────────────────────────────────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  const corsHeaders: Record<string, string> = {
    ...buildCorsHeaders(event.request),
    "Content-Type": "application/json"
  };

  try {
    const url = new URL(event.request.url);

    // ── Parse path param: /api/audio-languages/{tmdbId} ────────────
    // SolidStart file-routing: [tmdbId] becomes a path param.
    // We read it from the URL pathname (last segment) so we don't depend
    // on Vinxi's event.params typing.
    const segments = url.pathname.split("/").filter(Boolean);
    const tmdbIdStr = segments[segments.length - 1] ?? "";
    const tmdbId = parseInt(tmdbIdStr, 10);

    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      return new Response(
        JSON.stringify({
          error: `Invalid tmdb id: "${tmdbIdStr}"`
        }),
        {
          status: 400,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR }
        }
      );
    }

    // ── Parse query params ─────────────────────────────────────────
    const rawType = url.searchParams.get("type") ?? "movie";
    const type: TitleType = rawType === "tv" ? "tv" : "movie";

    // Region: prefer the user's profile country (spec §7). The
    // ?region= query param is an admin override only — the UI does
    // NOT send it (the previous hard-coded India region was removed
    // from the modal's fetcher).
    const overrideRegion = url.searchParams.get("region");
    const region =
      overrideRegion && /^[A-Za-z]{2}$/.test(overrideRegion)
        ? overrideRegion.toUpperCase()
        : await resolveProfileCountry(event.request);

    const forceRefresh = url.searchParams.get("refresh") === "1";

    // ── Run the worker ─────────────────────────────────────────────
    // backgroundRefreshIfStale=true → if cache is stale, return it
    // immediately and trigger a background refresh so the next open is
    // fast. This keeps the modal responsive.
    const { result, fromCache, stale } = await getAudioLanguages({
      tmdbId,
      type,
      region,
      forceRefresh,
      backgroundRefreshIfStale: true
    });

    // ── Build the API response (compact, no raw source payloads) ──
    // Per spec §11: the region is retained in the response for
    // debugging + cache, but the UI MUST NOT render it.
    //
    // Per the targeted fix "Remove DETECTED Audio Languages":
    //   The user-facing `dubbedLanguages` list MUST contain only
    //   VERIFIED (high) or CONFIRMED (medium) genuine audio languages.
    //   DETECTED (low-confidence) entries are filtered out here as a
    //   defensive measure — the resolver already filters them on fresh
    //   runs, but this also catches stale cache rows written before
    //   commit b4d36c7 (which still contain TMDB-translation "low"
    //   entries). The internal `detectedAudioLanguages` array (kept on
    //   the worker result) is unaffected.
    //
    //   `sourceCount` is recomputed from the FILTERED list so the
    //   modal's "N verified source(s)" subtitle only counts sources
    //   that contributed to the remaining verified/confirmed entries —
    //   never sources whose contributions were all DETECTED.
    const filteredDubbed = excludeDetected(result.dubbedLanguages);
    const verifiedSourceNames = new Set<string>();
    for (const lang of filteredDubbed) {
      for (const src of lang.sources) verifiedSourceNames.add(src);
    }

    const payload: AudioLanguageApiResponse = {
      tmdbId,
      type,
      originalLanguages: result.originalLanguages,
      dubbedLanguages: filteredDubbed.map((l) => ({
        code: l.code,
        name: l.name,
        confidence: l.confidence,
        sources: l.sources
      })),
      status: result.status,
      checkedAt: result.checkedAt,
      region: result.region,
      noData:
        filteredDubbed.length === 0 &&
        result.detectedAudioLanguages.length === 0 &&
        result.status === "unknown",
      error: result.status === "error",
      message: result.status === "error" ? "Unable to retrieve audio-language information." : undefined,
      seasonAvailability: result.seasonAvailability,
      // Per spec §9 + targeted fix: source count = number of genuine
      // audio sources that contributed to the FILTERED (verified/
      // confirmed) dubbed list. Sources whose only contributions were
      // DETECTED (low) are NOT counted.
      sourceCount: verifiedSourceNames.size,
      fromCache,
      stale
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, ...CACHE_HEADERS_SUCCESS }
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[audio-languages API] GET error:", errMsg);
    return new Response(
      JSON.stringify({
        error: "Unable to retrieve audio-language information.",
        message: errMsg
      }),
      {
        status: 500,
        headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR }
      }
    );
  }
}

// ─── OPTIONS handler (CORS preflight) ─────────────────────────────────

export async function OPTIONS(event: APIEvent): Promise<Response> {
  const corsHeaders = buildCorsHeaders(event.request);
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Max-Age": "86400"
    }
  });
}

// ─── POST handler — admin background refresh trigger ──────────────────
//
// Body: { "action": "refresh-stale", "limit": 50 }
// Triggers a background refresh of stale cache entries. Intended for
// cron jobs / admin use. Returns the count of refreshed entries.

export async function POST(event: APIEvent): Promise<Response> {
  const corsHeaders: Record<string, string> = {
    ...buildCorsHeaders(event.request),
    "Content-Type": "application/json"
  };

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      action?: string;
      limit?: number;
    };

    if (body.action !== "refresh-stale") {
      return new Response(
        JSON.stringify({ error: "Unknown action. Use action=refresh-stale." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const limit = Math.min(50, Math.max(1, body.limit ?? 10));
    const { refreshed, failed } = await refreshStaleEntries(limit);

    return new Response(JSON.stringify({ refreshed, failed }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[audio-languages API] POST error:", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
