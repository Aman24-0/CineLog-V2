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

// ─── Types ────────────────────────────────────────────────────────────
// SolidStart/Nitro passes a H3Event-shaped object to route handlers.
// We define a minimal structural type for type safety without importing h3.

interface APIEvent {
  request: Request;
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
  "Cache-Control": "public, max-age=900, s-maxage=1800, stale-while-revalidate=3600",
};

// Shorter cache for errors — don't poison the CDN with long-lived 4xx/5xx
const CACHE_HEADERS_ERROR = {
  "Cache-Control": "public, max-age=60, s-maxage=120",
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

async function fetchWithRetry(url: string, retries: number = MAX_RETRIES): Promise<Response> {
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
          headers: { "Content-Type": "application/json", ...CACHE_HEADERS_ERROR },
        });
      }
      tmdbPath = pathname.slice(prefix.length);
    }

    if (!tmdbPath || tmdbPath.length === 0) {
      return new Response(JSON.stringify({ error: "Empty TMDB path" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CACHE_HEADERS_ERROR },
      });
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

    // Read the response body
    const body = await upstreamRes.text();

    // Determine Content-Type from upstream (preserve TMDB's response format)
    const contentType = upstreamRes.headers.get("Content-Type") ?? "application/json";

    // Build response headers: preserve upstream Content-Type + add our cache headers
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      // Add CORS headers so the browser can call /api/media/ directly
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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
      headers,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[media-proxy] GET error:", errMsg);

    return new Response(JSON.stringify({ error: errMsg }), {
      status: 502, // Bad Gateway — proxy couldn't reach upstream
      headers: { "Content-Type": "application/json", ...CACHE_HEADERS_ERROR },
    });
  }
}

// ─── OPTIONS handler (CORS preflight) ─────────────────────────────────

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400", // 24h — browsers cache preflight results
    },
  });
}
