// src/routes/api/ott/providers.ts
//
// CineLog V2 — JustWatch OTT API: Provider Catalog
// ---------------------------------------------------------------------
// Returns the JustWatch provider catalog for the caller's country.
//
// Endpoint:
//   GET /api/ott/providers
//
// Response (200):
//   {
//     "country": "IN",
//     "providers": [
//       {
//         "id": "cGF8...",
//         "clearName": "Netflix",
//         "shortName": "NF",
//         "technicalName": "netflix",
//         "icon": "/icon/4982/{profile}/{technicalName}.{format}"
//       },
//       ...
//     ]
//   }
//
// Behavior:
//   1. Resolve the caller's profile country via `resolveJustWatchCountry`.
//      Anonymous requests fall back to "US".
//   2. Call `getProviderCatalog(country)` — cache-first, falls back to a
//      live JustWatch `packages(country, platform: WEB)` fetch on cache
//      miss, never throws.
//   3. Return `{ country, providers }`. Empty catalog is returned as
//      `providers: []` (still 200) — the UI renders an empty state.
//
// Caching:
//   - Success: `public, max-age=300, s-maxage=600` (5 min browser,
//     10 min CDN). The underlying Supabase cache has a 48h TTL, so the
//     CDN cache is just an edge cache for repeated reads.
//   - Errors: same headers (the response is still 200 with empty
//     providers — caching that for 5 min is fine).
//
// Auth: optional. Anonymous callers get "US" country. NEVER returns 401
// for missing/invalid session — the route always fails open with HTTP 200
// (mirrors `/api/audio-languages/[tmdbId]`).

import { getProviderCatalog } from "~/server/justwatch/service";
import { resolveJustWatchCountry } from "~/server/justwatch/region";
import type { JustWatchPackage } from "~/shared/types/justwatch";

interface APIEvent {
  request: Request;
}

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=600",
  "Content-Type": "application/json"
};

// ─── CORS ────────────────────────────────────────────────────────────
// Same pattern as /api/audio-languages/[tmdbId].ts — only allow the
// app's own origin (and *.vercel.app preview siblings when the canonical
// origin is a vercel.app domain). Pre-flight OPTIONS is answered with
// 204 + Access-Control-Max-Age so the browser caches it for a day.

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
// The client knows the user's profile country reactively via
// `useDiscoverRegion()` (a global signal kept in sync with the
// `profiles.country` column). On the Vercel preview, server-side
// `resolveJustWatchCountry()` may fall back to "US" because the Supabase
// session cookie isn't always present on the serverless request (e.g.
// when the route is hit via a fetch without credentials, or when the
// session token has expired). Accepting a `region` / `country` query
// param lets the client hand its already-known country to the route,
// which is the same pattern the audio-languages admin route uses for its
// `region` override. The override is validated as a 2-letter ISO code;
// any invalid value is dropped and we fall back to the server resolver.

/**
 * Validate and normalize a country code from a query param.
 * Accepts any 2-letter string, uppercases it. Returns null for invalid
 * input so the caller can fall back to `resolveJustWatchCountry`.
 */
function normalizeCountry(value: string | null): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

// ─── GET handler ─────────────────────────────────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  const corsHeaders = buildCorsHeaders(event.request);
  try {
    // Parse the optional region/country query override. `region` is the
    // preferred name (matches the audio-languages admin route); `country`
    // is accepted as an alias for caller convenience.
    const url = new URL(event.request.url);
    const queryCountry = normalizeCountry(
      url.searchParams.get("region") ?? url.searchParams.get("country")
    );

    let country = "US";
    if (queryCountry) {
      // Client-supplied override wins — skip the Supabase round-trip.
      country = queryCountry;
    } else {
      try {
        country = await resolveJustWatchCountry(event.request);
      } catch (err) {
        // resolveJustWatchCountry already catches internally — this is a
        // defensive backstop in case a future refactor introduces a throw.
        console.warn(
          "[/api/ott/providers] resolveJustWatchCountry threw:",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    let providers: JustWatchPackage[];
    try {
      providers = await getProviderCatalog(country);
    } catch (err) {
      console.warn(
        "[/api/ott/providers] getProviderCatalog threw:",
        err instanceof Error ? err.message : String(err)
      );
      providers = [];
    }

    // Chunk 6E: temporary diagnostic log — helps diagnose intermittent
    // provider catalog emptiness in Vercel preview. Will be removed in
    // a later cleanup chunk.
    console.log(
      `[OTT providers] country=${country} count=${providers.length} source=${queryCountry ? "query-override" : "session-resolver"}`
    );

    return new Response(JSON.stringify({ country, providers }), {
      status: 200,
      headers: { ...corsHeaders, ...CACHE_HEADERS }
    });
  } catch (err) {
    console.warn(
      "[/api/ott/providers] GET error:",
      err instanceof Error ? err.message : String(err)
    );
    return new Response(
      JSON.stringify({ country: "US", providers: [] }),
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
