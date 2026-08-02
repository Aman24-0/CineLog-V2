// src/routes/api/anilist.ts
//
// CineLog V2 — Server Proxy: AniList GraphQL API
// ---------------------------------------------------------------------
// Forwards POST /api/anilist to https://graphql.anilist.co, optionally
// injecting the ANILIST_ACCESS_TOKEN server-side so the token never
// reaches the client bundle.
//
// WHY THIS EXISTS (mirrors the /api/media proxy for TMDB):
//   1. Token security — ANILIST_ACCESS_TOKEN is read from env (no
//      VITE_ prefix) and never appears in the client bundle. Anonymous
//      requests (no token set) pass through unchanged.
//   2. Centralized rate-limit state — because all client requests
//      route through this single endpoint per-deployment, the
//      client.ts rate-limit backoff logic is per-server instead of
//      per-tab. (AniList rate-limits by IP, so this naturally
//      aggregates all users on a Vercel instance.)
//   3. HTTP caching — read-only GraphQL queries get Cache-Control
//      headers so Vercel's CDN absorbs repeated identical queries.
//   4. Retry resilience — 5xx upstream errors are retried up to 2
//      times with exponential backoff (1s, 2s).
//
// ROUTE:
//   POST /api/anilist
//   Body: { "query": "...", "variables": { ... } }
//   → forwards to https://graphql.anilist.co with same body + headers
//
// SECURITY:
//   • Only POST is allowed (AniList is GraphQL, not REST).
//   • The body is forwarded verbatim — we don't parse or rewrite it.
//   • We DO add Authorization header if ANILIST_ACCESS_TOKEN is set.
//   • We strip any incoming Authorization header from the client so
//     the client can't override our server-side token.

interface APIEvent {
  request: Request;
}

const ANILIST_URL =
  process.env.ANILIST_API_URL || "https://graphql.anilist.co";
const MAX_RETRIES = 2;

// Cache-Control for successful responses.
// AniList's data changes slowly (trending refreshes every few hours,
// seasonal data is stable for ~3 months). Cache aggressively.
const CACHE_HEADERS_SUCCESS = {
  "Cache-Control":
    "public, max-age=300, s-maxage=600, stale-while-revalidate=3600"
};

const CACHE_HEADERS_ERROR = {
  "Cache-Control": "public, max-age=30, s-maxage=60"
};

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    }
  });
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      // ── 5xx: server error → retry ────────────────────────────────
      if (res.status >= 500 && res.status < 600 && attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      // ── 403: AniList temporarily disabled (outage) → retry ───────
      // AniList returns 403 with a "temporarily disabled" message when
      // the API is down for stability reasons. This is a transient
      // outage, not a permanent auth error. We check the body to
      // distinguish from genuine 403s.
      if (res.status === 403 && attempt < retries) {
        // Clone the response so we can read the body without consuming it.
        const cloned = res.clone();
        try {
          const text = await cloned.text();
          if (
            text.includes("temporarily disabled") ||
            text.includes("severe stability issues")
          ) {
            const delay = 2000 * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
        } catch {
          // Can't read body — assume transient outage and retry.
          const delay = 2000 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }
  throw lastError ?? new Error("AniList upstream fetch failed after retries");
}

export async function POST(event: APIEvent): Promise<Response> {
  // Method guard — only POST is supported (GraphQL queries are POST bodies)
  if (event.request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, {
      Allow: "POST"
    });
  }

  let body: { query?: string; variables?: Record<string, unknown> };
  try {
    body = await event.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body.query || typeof body.query !== "string") {
    return jsonResponse({ error: "Missing `query` field in body" }, 400);
  }

  // Build the upstream request. We forward the query + variables
  // verbatim — we do NOT parse or rewrite the GraphQL query.
  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  // Inject server-side token if present. We do NOT trust any
  // Authorization header the client might send — we strip it.
  const token = process.env.ANILIST_ACCESS_TOKEN;
  if (token) {
    forwardHeaders.Authorization = `Bearer ${token}`;
  }

  try {
    const upstream = await fetchWithRetry(ANILIST_URL, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify({
        query: body.query,
        variables: body.variables ?? {}
      })
    });

    // Read body once so we can re-serialize + add cache headers.
    const text = await upstream.text();
    const status = upstream.status;

    // Cache control — never cache 403 outage responses (AniList down).
    // These are transient and should be retried quickly.
    let cacheControl: string;
    if (status >= 200 && status < 300) {
      cacheControl = CACHE_HEADERS_SUCCESS["Cache-Control"];
    } else if (
      status === 403 &&
      (text.includes("temporarily disabled") ||
        text.includes("severe stability issues"))
    ) {
      // AniList outage — don't cache at all (client will retry soon).
      cacheControl = "no-store, max-age=0";
    } else {
      cacheControl = CACHE_HEADERS_ERROR["Cache-Control"];
    }

    // Pass through rate-limit headers so the client can react.
    const rateLimitHeaders: Record<string, string> = {};
    const passthroughHeaders = [
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "Retry-After"
    ];
    for (const h of passthroughHeaders) {
      const v = upstream.headers.get(h);
      if (v) rateLimitHeaders[h] = v;
    }

    return new Response(text, {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": cacheControl,
        ...rateLimitHeaders
      }
    });
  } catch (err) {
    console.error("[anilist-proxy] upstream fetch failed:", err);
    return jsonResponse(
      { errors: [{ message: "AniList upstream fetch failed", status: 502 }] },
      502,
      { "Cache-Control": CACHE_HEADERS_ERROR["Cache-Control"] }
    );
  }
}

// Reject GET / other methods so crawlers don't accidentally trigger
// expensive GraphQL queries.
export async function GET(_event: APIEvent): Promise<Response> {
  return jsonResponse(
    { error: "GET not supported. Use POST with a GraphQL query body." },
    405,
    { Allow: "POST" }
  );
}
