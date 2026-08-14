// src/routes/api/ott/availability/[tmdbId].ts
//
// CineLog V2 — JustWatch OTT API: Single-Title Availability
// ---------------------------------------------------------------------
// Returns JustWatch OTT availability (provider offers) for a single
// TMDB title in the caller's country.
//
// Endpoint:
//   GET /api/ott/availability/{tmdbId}?type={movie|tv}&title=...&year=...
//
// Query params:
//   type  — "movie" | "tv" (required). Anything else → 400.
//   title — string, optional. REQUIRED for a cache miss — without a
//           title we cannot resolve the TMDB id to a JustWatch node.
//           If omitted and no cache hit, the response is `offers: []`.
//   year  — string, optional. Parsed to a number and used as a ±1
//           release-year window to disambiguate title collisions.
//
// Response (200):
//   {
//     "tmdbId": 530385,
//     "mediaType": "movie",
//     "country": "IN",
//     "justwatchNodeId": "tmR6NTMwMzg1",
//     "offers": [ ... ]
//   }
//
// When the title cannot be resolved or has no offers:
//   {
//     "tmdbId": 530385,
//     "mediaType": "movie",
//     "country": "IN",
//     "offers": []
//   }
//
// Caching:
//   - Success: `public, max-age=300, s-maxage=600`. The underlying
//     Supabase `ott_availability_cache` has a 48h TTL; the CDN cache
//     is just an edge cache for repeated reads.
//   - Empty result: same headers. The TTL is short enough that a fresh
//     JustWatch lookup will appear within 5 minutes once the title is
//     indexed.
//
// Auth: optional. Anonymous callers get "US" country. NEVER returns 401
// for missing/invalid session — the route always fails open with HTTP 200
// (or 400 for invalid input) — mirrors `/api/audio-languages/[tmdbId]`.

import { getTitleOttAvailability } from "~/server/justwatch/service";
import { resolveJustWatchCountry } from "~/server/justwatch/region";

interface APIEvent {
  request: Request;
}

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=600",
  "Content-Type": "application/json"
};

const ERROR_HEADERS_400 = {
  "Cache-Control": "public, max-age=60, s-maxage=120",
  "Content-Type": "application/json"
};

// ─── CORS (same pattern as /api/audio-languages/[tmdbId].ts) ─────────

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin"
  };
}

// ─── Country override (Chunk 6D) ─────────────────────────────────────
// See the long comment in `providers.ts` for the rationale. Identical
// helper, identical precedence: client-supplied `region` / `country`
// query param wins if it's a valid 2-letter code; otherwise we fall
// back to `resolveJustWatchCountry(request)` (which itself fails open
// to "US").

function normalizeCountry(value: string | null): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

// ─── GET handler ─────────────────────────────────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  const corsHeaders = buildCorsHeaders(event.request);
  try {
    const url = new URL(event.request.url);

    // ── Parse path param: /api/ott/availability/{tmdbId} ────────────
    // SolidStart file-routing: [tmdbId] becomes a path param. We read
    // it from the URL pathname (last segment) so we don't depend on
    // Vinxi's event.params typing (mirrors the audio-languages route).
    const segments = url.pathname.split("/").filter(Boolean);
    const tmdbIdStr = segments[segments.length - 1] ?? "";
    const tmdbId = parseInt(tmdbIdStr, 10);

    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      return new Response(
        JSON.stringify({ error: `Invalid tmdb id: "${tmdbIdStr}"` }),
        { status: 400, headers: { ...corsHeaders, ...ERROR_HEADERS_400 } }
      );
    }

    // ── Parse query params ─────────────────────────────────────────
    const rawType = url.searchParams.get("type");
    if (rawType !== "movie" && rawType !== "tv") {
      return new Response(
        JSON.stringify({
          error: `Invalid type "${rawType}" — expected "movie" or "tv"`
        }),
        { status: 400, headers: { ...corsHeaders, ...ERROR_HEADERS_400 } }
      );
    }
    const mediaType: "movie" | "tv" = rawType;

    const title = url.searchParams.get("title") ?? undefined;
    const yearRaw = url.searchParams.get("year");
    let releaseYear: number | null = null;
    if (yearRaw != null && yearRaw !== "") {
      const parsed = Number(yearRaw);
      releaseYear = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    // ── Resolve country ────────────────────────────────────────────
    // Precedence (Chunk 6D):
    //   1. `region` / `country` query param if valid 2-letter code.
    //   2. `resolveJustWatchCountry(request)` (reads the Supabase
    //      session cookie, falls back to "US" on anonymous/error).
    //   3. "US" defensive fallback.
    let country = "US";
    const queryCountry = normalizeCountry(
      url.searchParams.get("region") ?? url.searchParams.get("country")
    );
    if (queryCountry) {
      country = queryCountry;
    } else {
      try {
        country = await resolveJustWatchCountry(event.request);
      } catch (err) {
        console.warn(
          "[/api/ott/availability] resolveJustWatchCountry threw:",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // ── Fetch offers (cache-first, never throws) ──────────────────
    let result;
    try {
      result = await getTitleOttAvailability({
        mediaType,
        tmdbId,
        country,
        title,
        releaseYear
      });
    } catch (err) {
      console.warn(
        "[/api/ott/availability] getTitleOttAvailability threw:",
        err instanceof Error ? err.message : String(err)
      );
      result = null;
    }

    if (!result || !result.offers || result.offers.length === 0) {
      return new Response(
        JSON.stringify({ tmdbId, mediaType, country, offers: [] }),
        { status: 200, headers: { ...corsHeaders, ...CACHE_HEADERS } }
      );
    }

    return new Response(
      JSON.stringify({
        tmdbId,
        mediaType,
        country,
        justwatchNodeId: result.nodeId,
        offers: result.offers
      }),
      { status: 200, headers: { ...corsHeaders, ...CACHE_HEADERS } }
    );
  } catch (err) {
    console.warn(
      "[/api/ott/availability] GET error:",
      err instanceof Error ? err.message : String(err)
    );
    // Defensive fallback — never throw to client, never return 401
    return new Response(
      JSON.stringify({ tmdbId: 0, mediaType: "movie", country: "US", offers: [] }),
      { status: 200, headers: { ...corsHeaders, ...CACHE_HEADERS } }
    );
  }
}

// ─── OPTIONS handler (CORS preflight) ────────────────────────────────

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
