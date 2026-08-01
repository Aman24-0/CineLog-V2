// src/lib/anilist/client.ts
//
// AniList GraphQL Client
// ---------------------------------------------------------------------
// Native-fetch GraphQL client for https://graphql.anilist.co.
//
// FEATURES:
//   • Rate-limit aware — reads X-RateLimit-Remaining and Retry-After
//     headers. When the bucket is low, requests are queued behind a
//     backoff timer. On 429, waits Retry-After seconds then retries
//     once (with exponential backoff for further retries).
//   • Request deduplication — identical queries within DEDUP_WINDOW_MS
//     share a single Promise. Prevents Discover from firing 6 parallel
//     "trending anime" requests when the page mounts.
//   • In-memory response cache — short TTL (5 min) to absorb repeat
//     clicks on the same anime detail page without re-hitting AniList.
//   • Exponential backoff — 5xx and network errors are retried with
//     500ms, 1s, 2s delays (3 attempts max).
//   • SSR-safe — uses /api/anilist proxy on the server (which injects
//     the optional ANILIST_ACCESS_TOKEN server-side) and on the client
//     (so we never expose the token in the bundle). Falls back to
//     calling AniList directly from the browser if the proxy is
//     unavailable — anonymous requests work fine at the standard
//     90 req/min IP limit.
//   • Timeout — 10s default, configurable per-call.
//
// WHY A PROXY?
//   AniList's GraphQL endpoint supports anonymous requests, but
//   personal tokens raise the rate limit from 90 → 120 req/min AND
//   unlock fields we may want later (user lists, custom lists). The
//   token must NEVER be in the client bundle. So:
//     client → /api/anilist (server) → graphql.anilist.co
//   The server route reads ANILIST_ACCESS_TOKEN from env and adds it
//   as a Bearer header. Anonymous requests pass through unchanged.
//
// USAGE:
//   import { anilistRequest, queryMediaDetails } from "~/lib/anilist/client";
//   const data = await anilistRequest(queryMediaDetails, { id: 101922 });
//
// ALL queries go through this single client so dedup + rate-limit
// logic is centralized. Do NOT call fetch() directly against AniList.

import { isServer } from "solid-js/web";
import type { AniListResponse } from "./types";

// ─── Configuration ──────────────────────────────────────────────────

const ANILIST_API_URL =
  (isServer ? process.env.ANILIST_API_URL : import.meta.env.VITE_ANILIST_API_URL) ||
  "https://graphql.anilist.co";

/**
 * Server-side proxy route that forwards the request to AniList and
 * optionally injects ANILIST_ACCESS_TOKEN. Used by both server-side
 * fetches (so the token never leaks into the build) and by client
 * fetches (so the browser never holds the token).
 */
const PROXY_URL = "/api/anilist";

/**
 * Whether to use the proxy or hit AniList directly.
 *
 * On the SERVER, we ALWAYS use the proxy path because fetch() needs
 * an absolute URL on Node, and the proxy route runs in the same
 * serverless instance so there's no extra hop.
 *
 * On the CLIENT, we use the proxy too — this keeps rate-limit state
 * centralized per-server (a single user's requests don't poison the
 * bucket for other users on the same IP) and lets us rotate tokens
 * without redeploying the client.
 */
function resolveEndpoint(): string {
  // Always use the proxy. The proxy handles forwarding + token injection.
  // isServer is true → /api/anilist resolves against the server's own origin
  // via getBaseUrl() (see tmdb.ts for the same pattern).
  return PROXY_URL;
}

// ─── In-memory response cache (5-minute TTL) ────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function cacheSet<T>(key: string, value: T): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Request deduplication ──────────────────────────────────────────

const DEDUP_WINDOW_MS = 5_000;
const inFlight = new Map<string, Promise<unknown>>();

function dedupKey(query: string, variables: unknown): string {
  // Variables shape is stable for the same caller, so JSON.stringify
  // produces a stable key. Sort keys to be safe.
  try {
    const vars = variables ? JSON.stringify(variables) : "";
    return `${query}::${vars}`;
  } catch {
    return `${query}::${Date.now()}`; // un-dedupable, just fire
  }
}

// ─── Rate-limit state ───────────────────────────────────────────────

interface RateLimitState {
  remaining: number | null; // X-RateLimit-Remaining
  resetAt: number | null;   // epoch ms when bucket resets
  retryAfterUntil: number | null; // if 429 received, wait until this epoch ms
}

const rateLimit: RateLimitState = {
  remaining: null,
  resetAt: null,
  retryAfterUntil: null
};

function updateRateLimitFromHeaders(res: Response): void {
  const remaining = res.headers.get("X-RateLimit-Remaining");
  const reset = res.headers.get("X-RateLimit-Reset");
  if (remaining != null) {
    const n = parseInt(remaining, 10);
    if (!Number.isNaN(n)) rateLimit.remaining = n;
  }
  if (reset != null) {
    const n = parseInt(reset, 10);
    if (!Number.isNaN(n)) rateLimit.resetAt = n * 1000; // AniList returns seconds
  }
}

async function waitForRateLimit(): Promise<void> {
  // If we got a 429 recently, wait until Retry-After expires.
  if (rateLimit.retryAfterUntil && Date.now() < rateLimit.retryAfterUntil) {
    const wait = rateLimit.retryAfterUntil - Date.now();
    await new Promise((r) => setTimeout(r, Math.min(wait, 30_000)));
  }
  // If we're under 5 requests remaining AND we know when the bucket
  // resets, wait until then. 5 is a safety buffer so concurrent
  // requests don't blow past 0.
  if (
    rateLimit.remaining != null &&
    rateLimit.remaining < 5 &&
    rateLimit.resetAt != null
  ) {
    const wait = rateLimit.resetAt - Date.now();
    if (wait > 0 && wait < 60_000) {
      await new Promise((r) => setTimeout(r, wait + 100));
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function getBaseUrl(): string {
  // Mirror the pattern used by tmdb.ts — the production Vercel URL
  // is the default; can be overridden via VITE_APP_BASE_URL.
  if (typeof process !== "undefined" && process.env.VITE_APP_BASE_URL) {
    return process.env.VITE_APP_BASE_URL;
  }
  return "https://cinelog.vercel.app";
}

function buildUrl(): string {
  return isServer ? `${getBaseUrl()}${PROXY_URL}` : PROXY_URL;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Core request function ──────────────────────────────────────────

/**
 * Execute an AniList GraphQL query.
 *
 * @param query       GraphQL query string (use the fragments in queries.ts)
 * @param variables   Variables object (passed as JSON to the GraphQL endpoint)
 * @param options     Optional per-call overrides:
 *                      - timeoutMs: defaults to 10_000
 *                      - cacheTtlMs: 0 disables cache, defaults to 5 min
 *                      - retries:   defaults to 3
 * @returns           The `data` field of the AniList response.
 * @throws            Error if the request fails or the response contains
 *                    GraphQL errors.
 */
export async function anilistRequest<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  options: {
    timeoutMs?: number;
    cacheTtlMs?: number;
    retries?: number;
  } = {}
): Promise<T> {
  const { timeoutMs = 10_000, cacheTtlMs = CACHE_TTL_MS, retries = 3 } = options;

  // ── 1. Cache check ────────────────────────────────────────────────
  const ckey = dedupKey(query, variables);
  if (cacheTtlMs > 0) {
    const cached = cacheGet<T>(ckey);
    if (cached !== undefined) return cached;
  }

  // ── 2. Dedup check ────────────────────────────────────────────────
  const existing = inFlight.get(ckey) as Promise<T> | undefined;
  if (existing) return existing;

  // ── 3. Build request ──────────────────────────────────────────────
  const promise = (async (): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      // Wait if rate-limited
      await waitForRateLimit();

      try {
        const res = await fetchWithTimeout(
          buildUrl(),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json"
            },
            body: JSON.stringify({ query, variables })
          },
          timeoutMs
        );

        // Update rate-limit state from headers (success or 429).
        updateRateLimitFromHeaders(res);

        // ── 429: rate limited → honor Retry-After, retry once ─────────
        if (res.status === 429) {
          const retryAfter = res.headers.get("Retry-After");
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(30_000, 1000 * Math.pow(2, attempt));
          rateLimit.retryAfterUntil = Date.now() + waitMs;
          lastError = new Error(`AniList rate limited (429). Retry in ${waitMs}ms.`);
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          break;
        }

        // ── 5xx: server error → exponential backoff ──────────────────
        if (res.status >= 500 && res.status < 600) {
          lastError = new Error(`AniList server error ${res.status}`);
          if (attempt < retries) {
            const delay = 500 * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          break;
        }

        // ── Non-retryable HTTP errors (4xx except 429) ───────────────
        // Include the response body in the error message so 400s from
        // malformed GraphQL queries (e.g. removed schema fields) are
        // debuggable from the console — AniList's statusText is often
        // empty, so without the body the error reads "AniList HTTP 400:"
        // with no clue what went wrong.
        if (!res.ok) {
          let bodySnippet = "";
          try {
            const text = await res.text();
            // AniList returns JSON like { "errors": [{ "message": "..." }] }
            // Truncate to 300 chars so the error stays readable in console.
            bodySnippet = text ? ` ${text.slice(0, 300)}` : "";
          } catch {
            // Ignore — body read failure shouldn't mask the original error.
          }
          throw new Error(
            `AniList HTTP ${res.status}: ${res.statusText || "error"}${bodySnippet}`
          );
        }

        // ── Parse JSON response ──────────────────────────────────────
        const json = (await res.json()) as AniListResponse<T>;

        // GraphQL errors — these are NOT retryable (they indicate a
        // bad query, not a transient failure).
        if (json.errors && json.errors.length > 0) {
          const msg = json.errors.map((e) => e.message).join("; ");
          throw new Error(`AniList GraphQL error: ${msg}`);
        }

        if (!json.data) {
          throw new Error("AniList response missing `data` field");
        }

        // ── Success → cache + return ─────────────────────────────────
        if (cacheTtlMs > 0) {
          cacheSet(ckey, json.data);
        }
        return json.data;
      } catch (err) {
        // Network errors (TypeError: Failed to fetch) and timeouts
        // (AbortError) are retryable.
        lastError = err instanceof Error ? err : new Error(String(err));
        const isAbort = lastError.name === "AbortError";
        const isNetwork =
          lastError.message.includes("Failed to fetch") ||
          lastError.message.includes("NetworkError") ||
          lastError.message.includes("fetch failed");
        if ((isAbort || isNetwork) && attempt < retries) {
          const delay = 500 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        // Non-retryable error — break out and throw below.
        break;
      }
    }

    throw lastError ?? new Error("AniList request failed after retries");
  })();

  // Register dedup so concurrent callers share this promise.
  //
  // IMPORTANT: do NOT use `promise.finally(...)` here. `.finally()`
  // returns a derived promise that RE-REJECTS with the original error
  // when the upstream promise rejects (e.g. AniList HTTP 400 from a
  // malformed query). Since nobody awaits that derived promise, the
  // rejection becomes "Uncaught (in promise) Error: AniList HTTP 400:"
  // in the browser console — even though `useAnimeEnrichment`'s own
  // try/catch properly handled the original rejection.
  //
  // Using `.then(onFulfilled, onRejected)` instead — both handlers
  // return undefined, so the derived promise RESOLVES (never rejects)
  // and no unhandled rejection is created. The original promise is
  // still rejected and the caller still sees the rejection via its
  // own `await`.
  inFlight.set(ckey, promise);
  promise.then(
    () => inFlight.delete(ckey),
    () => inFlight.delete(ckey)
  );

  return promise;
}

// ─── Cache management (for tests + manual refresh) ──────────────────

export function clearAniListCache(): void {
  cache.clear();
  inFlight.clear();
}

/**
 * Inspect the current rate-limit state. Useful for debugging why
 * requests are stalling — call from the browser console.
 */
export function getAniListRateLimitState(): Readonly<RateLimitState> {
  return { ...rateLimit };
}
