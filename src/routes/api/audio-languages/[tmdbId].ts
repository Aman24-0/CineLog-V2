// src/routes/api/audio-languages/[tmdbId].ts
//
// CineLog V2 — Server API: Audio Languages
// ---------------------------------------------------------------------
// Returns dubbed-audio language information for a TMDB title.
//
// Endpoint:
//   GET /api/audio-languages/{tmdbId}?type={movie|tv}&region={IN}&refresh={0|1}
//
// Query params:
//   type    — "movie" | "tv" (required). Default: "movie".
//   region  — ISO 3166-1 alpha-2 (default: "IN").
//   refresh — "1" to force a fresh worker run (ignores cache). Admin-only
//             in practice but we don't gate it here — the cost is bounded
//             by the worker TTL + the source adapters' rate.
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
//     "region": "IN",
//     "noData": false,
//     "error": false,
//     "sourceCount": 2,
//     "fromCache": false
//   }
//
// Behavior:
//   1. Check audio_languages_cache for (media_type, tmdb_id).
//   2. Fresh → return immediately.
//   3. Stale → return stale + trigger background refresh (non-blocking).
//   4. No cache → run worker synchronously, write to cache, return.
//
// Per spec STEP 22: the audio-language worker runs INDEPENDENTLY of the
// movie detail page. A failure here does NOT break the detail page —
// the modal shows an error state but the rest of the page works.
//
// Per spec STEP 21: all external API keys (TMDB, JustWatch) are
// server-side only. None are exposed to the browser.

import {
  getAudioLanguages,
  refreshStaleEntries
} from "~/server/audio-language/worker";
import type { AudioLanguageApiResponse, TitleType } from "~/server/audio-language/types";

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

    const rawRegion = url.searchParams.get("region");
    const region =
      rawRegion && rawRegion.length >= 2 && rawRegion.length <= 3
        ? rawRegion.toUpperCase()
        : "IN";

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
    const payload: AudioLanguageApiResponse = {
      tmdbId,
      type,
      originalLanguages: result.originalLanguages,
      dubbedLanguages: result.dubbedLanguages.map((l) => ({
        code: l.code,
        name: l.name,
        confidence: l.confidence,
        sources: l.sources
      })),
      status: result.status,
      checkedAt: result.checkedAt,
      region: result.region,
      noData:
        result.dubbedLanguages.length === 0 &&
        result.detectedAudioLanguages.length === 0 &&
        result.status === "unknown",
      error: result.status === "error",
      message: result.status === "error" ? "Unable to retrieve audio-language information." : undefined,
      seasonAvailability: result.seasonAvailability,
      sourceCount: result.sources.filter((s) => s.success && !s.noData).length,
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
