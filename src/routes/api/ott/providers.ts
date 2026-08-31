// src/routes/api/ott/providers.ts
//
// CineLog V2 — JustWatch OTT API: Published Provider Catalogue
// ---------------------------------------------------------------------
// Returns the PUBLISHED JustWatch provider catalogue for the caller's
// country — i.e. the rows in `justwatch_provider_catalog` with
// `active = true`. This is the user-side read path for the Library
// Platform filter dropdown options.
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
// Behavior (Part 4 redesign):
//   1. Resolve the caller's profile country via `resolveJustWatchCountry`
//      (or accept a `region` / `country` query-param override). Anonymous
//      requests fall back to "US".
//   2. Call `getPublishedProviderCatalog(country)` — Supabase ONLY.
//      NO JustWatch fallback. If no rows are published for the
//      country, `providers` is `[]` (still 200) and the UI shows
//      "No platforms available for your country".
//   3. Return `{ country, providers }`.
//
// Caching:
//   - `private, no-store`. The published catalogue is admin-controlled
//     and tiny (typically <100 rows), so correctness >> cache efficiency.
//     A previous version used `public, max-age=300, s-maxage=600` (5
//     min browser / 10 min CDN), which meant a stale EMPTY response
//     (e.g. served before the admin published providers) could be
//     cached for up to 10 minutes — the user would see "No platforms
//     available" even though Supabase had 91 published rows. With
//     `no-store`, every request goes to Supabase, so a newly-published
//     catalogue is visible to the user on the next Library page load
//     (or the next time the `usePublishedProviderCatalog` effect
//     re-fires, e.g. on country change). The Supabase read is fast
//     (indexed by `(country, active)`).
//   - Errors: same headers (the response is still 200 with empty
//     providers — `no-store` ensures the empty response is NOT cached
//     either, so a transient error doesn't poison the next request).
//
// Auth: optional. Anonymous callers get "US" country. NEVER returns 401
// for missing/invalid session — the route always fails open with HTTP 200
// (mirrors `/api/audio-languages/[tmdbId]`).

import { getPublishedProviderCatalog } from "~/server/justwatch/cache";
import { resolveJustWatchCountry } from "~/server/justwatch/region";
import type { JustWatchPackage } from "~/shared/types/justwatch";

interface APIEvent {
  request: Request;
}

// Part 4 follow-up — `private, no-store` guarantees the user sees a
// newly-published catalogue immediately. The catalogue is tiny so the
// per-request Supabase read is fast. See the header comment for the
// full rationale.
const CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
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

// ─── Country override ──────────────────────────────────────────────
// The client knows the user's profile country reactively via
// `useDiscoverRegion()`. On the Vercel preview, server-side
// `resolveJustWatchCountry()` may fall back to "US" because the Supabase
// session cookie isn't always present on the serverless request. Accepting
// a `region` / `country` query param lets the client hand its already-known
// country to the route.

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
    const queryCountry = normalizeCountry(
      url.searchParams.get("region") ?? url.searchParams.get("country")
    );

    let country = "US";
    if (queryCountry) {
      country = queryCountry;
    } else {
      try {
        country = await resolveJustWatchCountry(event.request);
      } catch (err) {
        console.warn(
          "[/api/ott/providers] resolveJustWatchCountry threw:",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // Part 4 redesign — Supabase ONLY. No JustWatch fallback.
    let providers: JustWatchPackage[] = [];
    try {
      const published = await getPublishedProviderCatalog(country);
      providers = published ?? [];
    } catch (err) {
      console.warn(
        "[/api/ott/providers] getPublishedProviderCatalog threw:",
        err instanceof Error ? err.message : String(err)
      );
      providers = [];
    }

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
