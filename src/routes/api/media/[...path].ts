/**
 * CineLog V2 — Server Proxy: TMDB Media API
 * ---------------------------------------------------------------------
 * Catch-all server-side proxy that routes /api/media/* requests to
 * https://api.themoviedb.org/3/*, injecting the TMDB API key from a
 * server-only environment variable.
 *
 * Why this exists:
 *   1. ISP/DNS blocking — some regions cannot reach api.themoviedb.org
 *      directly. The proxy runs on Vercel (edge/server), which is always
 *      reachable, so the client never needs to connect to TMDB.
 *   2. API key security — the key is read from TMDB_API_KEY (no VITE_
 *      prefix) and never appears in the client bundle. Any api_key
 *      query param sent by the client is stripped before forwarding.
 *   3. HTTP caching — Cache-Control headers let Vercel's CDN cache
 *      responses, reducing TMDB rate-limit pressure and improving
 *      latency for repeated queries.
 *   4. Retry resilience — 5xx upstream errors are retried up to 2
 *      times with exponential backoff (1s, 2s).
 *
 * Route mapping:
 *   /api/media/movie/550?language=en-US
 *   → https://api.themoviedb.org/3/movie/550?language=en-US&api_key=xxx
 *
 * The proxy forwards all query params EXCEPT api_key (which it strips
 * and replaces with the server-side key). The response body, status,
 * and Content-Type are preserved from upstream.
 *
 * Security: TMDB_API_KEY is server-only (no VITE_ prefix). It is
 * NEVER exposed to the browser. Falls back to VITE_TMDB_API_KEY
 * for smooth migration from the old client-side model.
 */

// ─── Helper: origin validation for CORS ───────────────────────────────

/**
 * Determine the allowed CORS origin for a request.
 *
 * Returns the request's Origin header if it matches the app's domain,
 * otherwise returns null (which means no Access-Control-Allow-Origin header
 * should be set, and the browser will block the cross-origin request).
 *
 * This replaces the previous `Access-Control-Allow-Origin: *` wildcard,
 * which allowed any third-party site to call these API routes.
 */
function getAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  // Allow the app's own domain(s). VITE_APP_BASE_URL is the primary
  // domain (e.g. https://cinelogv2.vercel.app). We also allow
  // localhost for local development.
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
  // Allow Vercel preview deployments and local dev
  if (appBaseUrl.includes("vercel.app")) {
    // Allow *.vercel.app for preview deploys
    try {
      const url = new URL(origin);
      if (url.hostname.endsWith(".vercel.app")) return origin;
    } catch { /* ignore */ }
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

// ─── Helper: build CORS headers for a request ────────────────────────

function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = getAllowedOrigin(request);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}

// ─── Types ────────────────────────────────────────────────────────────
// SolidStart/Nitro passes a H3Event-shaped object to route handlers.
// We define a minimal structural type for type safety without importing h3.

interface APIEvent {
  request: Request;
}

// ─── 404 short-circuit (Phase 16 upgrade) ─────────────────────────────
//
// The failedTmdb404s Set in src/core/tmdb/tmdb.ts records every
// "{mediaType}/{id}" that has previously returned a 404 from TMDB.
// fetchTmdbMetadata checks this Set BEFORE calling the proxy, so
// repeat browser fetches are silenced. But the FIRST fetch still
// goes through the proxy → the proxy fetches TMDB → TMDB returns 404
// → the proxy returns 404 → the browser logs it in the Network tab.
//
// By importing the Set helpers into the proxy, we add a SECOND layer:
// if the SERVER-side fetchTmdbMetadata (e.g. from the ai-recommendations
// route) has already recorded a 404 for this ID, the proxy can
// short-circuit BEFORE making the upstream TMDB request. This prevents
// redundant TMDB API calls + prevents the browser from seeing the 404
// in the Network tab for server-side calls that go through the proxy.
//
// The Set is module-level + shared between the proxy route and
// fetchTmdbMetadata (same Node module instance on the server), so a 404
// recorded by either code path is visible to both.

import {
  isKnownTmdb404,
  recordFailedTmdb404,
  tmdb404Key
} from "~/core/tmdb/tmdb";

/**
 * Parse a TMDB path like "movie/550" or "tv/1399" into its
 * { mediaType, id } components. Returns null if the path doesn't
 * match the expected pattern (e.g. "discover/movie", "genre/movie/list",
 * "search/multi" — these are list endpoints, not single-title fetches,
 * so the 404 Set doesn't apply).
 */
function parseTmdbPathFor404Check(
  tmdbPath: string
): { mediaType: string; id: string } | null {
  // Match paths like "movie/550", "tv/1399", "movie/550/season/1" (we
  // only care about the first two segments). The ID must be numeric.
  const match = tmdbPath.match(/^(movie|tv)\/(\d+)/);
  if (!match) return null;
  return { mediaType: match[1], id: match[2] };
}

// ─── Constants ─────────────────────────────────────────────────────────

const TMDB_ORIGIN = "https://api.themoviedb.org/3";
const MAX_RETRIES = 2;

// Cache-Control for successful responses.
// public          — Vercel CDN can cache across users
// max-age=900     — browser cache: 15 minutes
// s-maxage=1800   — CDN cache: 30 minutes
// stale-while-revalidate=3600 — serve stale for up to 1 hour while
//   revalidating in the background (reduces TMDB API calls)
const CACHE_HEADERS_SUCCESS = {
  "Cache-Control":
    "public, max-age=900, s-maxage=1800, stale-while-revalidate=3600"
};

// Shorter cache for errors — don't poison the CDN with long-lived 4xx/5xx
const CACHE_HEADERS_ERROR = {
  "Cache-Control": "public, max-age=60, s-maxage=120"
};

// ─── Helper: get TMDB API key from server env ────────────────────────

function getTmdbApiKey(): string {
  // Primary: TMDB_API_KEY (server-only, no VITE_ prefix — never in client bundle)
  const serverKey = process.env.TMDB_API_KEY;
  if (serverKey) return serverKey;

  // Fallback: VITE_TMDB_API_KEY — during migration, some deployments
  // may still only have the VITE_ prefixed key set. This fallback
  // ensures the proxy works immediately without a separate env var.
  // NOTE: VITE_TMDB_API_KEY is accessible server-side in SolidStart
  // because Vinxi bundles all env vars into the server runtime.
  const viteKey = process.env.VITE_TMDB_API_KEY;
  if (viteKey) return viteKey;

  // No key available — proxy cannot function
  throw new Error("TMDB_API_KEY or VITE_TMDB_API_KEY is not set");
}

// ─── Helper: retry fetch with exponential backoff ────────────────────

async function fetchWithRetry(
  url: string,
  retries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);

      // 5xx server errors — retryable
      if (res.status >= 500 && res.status < 600 && attempt < retries) {
        lastError = new Error(`TMDB upstream ${res.status}, retrying...`);
        // Exponential backoff: 1s, 2s
        const delayMs = 1000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      // Success (2xx/3xx) or non-retryable error (4xx) — return immediately
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Network error (DNS failure, connection refused, timeout) — retryable
      if (attempt < retries) {
        const delayMs = 1000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
    }
  }

  // All retries exhausted
  throw lastError ?? new Error("TMDB upstream fetch failed after retries");
}

// ─── GET handler ──────────────────────────────────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  try {
    const url = new URL(event.request.url);

    // Extract the catch-all path segments.
    // SolidStart encodes [...path] as a single query param "path" with
    // value like "movie/550" or "discover/movie".
    // If "path" is not in query params, fall back to parsing the URL
    // pathname after "/api/media/".
    const pathParam = url.searchParams.get("path");
    let tmdbPath: string;

    if (pathParam) {
      // SolidStart convention: catch-all segments stored in ?path=
      tmdbPath = pathParam;
      // Remove the "path" param so it doesn't get forwarded to TMDB
      url.searchParams.delete("path");
    } else {
      // Fallback: extract from pathname (handles Vinxi/Nitro routing)
      const prefix = "/api/media/";
      const pathname = url.pathname;
      if (!pathname.startsWith(prefix)) {
        return new Response(JSON.stringify({ error: "Invalid proxy path" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...CACHE_HEADERS_ERROR
          }
        });
      }
      tmdbPath = pathname.slice(prefix.length);
    }

    if (!tmdbPath || tmdbPath.length === 0) {
      return new Response(JSON.stringify({ error: "Empty TMDB path" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CACHE_HEADERS_ERROR }
      });
    }

    // ── Phase 16 upgrade: 404 short-circuit ────────────────────────
    // Before making the upstream TMDB request, check if this ID is
    // already known to 404 (recorded by a previous fetchTmdbMetadata
    // call or a previous proxy request). If so, return a 404 response
    // immediately WITHOUT calling TMDB. This prevents:
    //   1. Redundant TMDB API calls for known-missing IDs.
    //   2. The browser logging the 404 in the Network tab for
    //      server-side calls that go through the proxy.
    //
    // We only short-circuit single-title fetches (movie/{id} or tv/{id}).
    // List endpoints (discover, search, genre) are never short-circuited
    // because they don't have a single ID to check.
    const parsed = parseTmdbPathFor404Check(tmdbPath);
    if (parsed && isKnownTmdb404(parsed.mediaType, parsed.id)) {
      return new Response(
        JSON.stringify({
          status_message: "Resource not found (cached 404).",
          success: false,
          status_code: 34 // TMDB's standard "resource not found" code
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...CACHE_HEADERS_ERROR
          }
        }
      );
    }

    // Strip any api_key the client might send — we inject our server-side key.
    // This prevents accidental key leakage through the proxy.
    url.searchParams.delete("api_key");

    // Inject the server-side TMDB API key
    const apiKey = getTmdbApiKey();
    url.searchParams.set("api_key", apiKey);

    // Build the upstream TMDB URL
    const upstreamUrl = `${TMDB_ORIGIN}/${tmdbPath}?${url.searchParams.toString()}`;

    // Fetch with retry logic for 5xx errors
    const upstreamRes = await fetchWithRetry(upstreamUrl);

    // ── Phase 16 upgrade: record 404s ──────────────────────────────
    // If the upstream returned a 404 for a single-title fetch, record
    // the ID in the failedTmdb404s Set so future requests (both from
    // fetchTmdbMetadata AND from this proxy route) are short-circuited.
    // This is the SERVER-SIDE recording path — it complements the
    // client-side recording in fetchTmdbMetadata's catch block.
    if (upstreamRes.status === 404 && parsed) {
      recordFailedTmdb404(tmdb404Key(parsed.mediaType, parsed.id));
    }

    // Read the response body
    const body = await upstreamRes.text();

    // Determine Content-Type from upstream (preserve TMDB's response format)
    const contentType =
      upstreamRes.headers.get("Content-Type") ?? "application/json";

    // Build response headers: preserve upstream Content-Type + add our cache headers
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      // Add CORS headers restricted to the app's own domain
      ...buildCorsHeaders(event.request)
    };

    // Add cache headers based on response status
    if (upstreamRes.ok) {
      Object.assign(headers, CACHE_HEADERS_SUCCESS);
    } else {
      Object.assign(headers, CACHE_HEADERS_ERROR);
    }

    // Mirror upstream status code (404, 401, etc. pass through)
    return new Response(body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[media-proxy] GET error:", errMsg);

    return new Response(JSON.stringify({ error: errMsg }), {
      status: 502, // Bad Gateway — proxy couldn't reach upstream
      headers: { "Content-Type": "application/json", ...CACHE_HEADERS_ERROR }
    });
  }
}

// ─── OPTIONS handler (CORS preflight) ─────────────────────────────────

export async function OPTIONS(event: APIEvent): Promise<Response> {
  const corsHeaders = buildCorsHeaders(event.request);
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Max-Age": "86400" // 24h — browsers cache preflight results
    }
  });
}
