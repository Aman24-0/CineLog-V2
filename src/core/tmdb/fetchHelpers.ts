/**
 * CineLog V2 — TMDB fetch helpers (timeout + retry)
 * ---------------------------------------------------------------------
 * Shared network primitives used by every TMDB API call. Extracted to
 * a single module so discover.ts and tmdb.ts use identical timeout
 * and retry semantics.
 *
 * Capabilities:
 *   • fetchWithTimeout — AbortController-based 10-second timeout.
 *     Prevents the Discover / Details UI from hanging forever when
 *     TMDB (or the /api/media proxy) is unreachable.
 *
 *   • fetchWithRetry — wraps fetchWithTimeout with a single retry on
 *     transient failures (5xx response or a network TypeError).
 *     Timeouts (AbortError) and 4xx responses are NOT retried —
 *     timeouts would just hang again, and 4xx is a permanent client
 *     error that retrying can't fix.
 *
 * Both helpers are pure fetch() wrappers — they don't touch the cache.
 * Cache + in-flight dedup are handled by `cachedFetch` in
 * `~/shared/utils/apiCache`, which wraps these helpers at each call
 * site.
 */

/** Default timeout for TMDB API calls (10 seconds). */
export const TMDB_FETCH_TIMEOUT_MS = 10_000;

/**
 * fetch with AbortController timeout.
 * If the server is unreachable or slow, the request is aborted after
 * `timeoutMs` milliseconds instead of hanging indefinitely (which
 * would leave the Discover page stuck on a skeleton forever).
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = TMDB_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * fetchWithRetry — wraps fetchWithTimeout with a single retry on
 * transient failures.
 *
 * Retry policy:
 *   • 5xx response   → retry once. On second 5xx, return the response
 *                       so the caller's `if (!r.ok) throw` fires with
 *                       the original status code.
 *   • Network error  → retry once. (TypeError from fetch() when the
 *                       request can't reach the server — DNS failure,
 *                       connection refused, offline, etc.)
 *   • Timeout        → never retry. AbortError means the server is
 *                       slow; retrying would just hang for another
 *                       10 seconds before failing again.
 *   • 4xx response   → never retry. 4xx is a client error (bad URL,
 *                       unauthenticated, not-found); retrying can't
 *                       fix it.
 *
 * @param url       Absolute or relative URL to fetch.
 * @param timeoutMs Per-attempt timeout in milliseconds.
 */
export async function fetchWithRetry(
  url: string,
  timeoutMs: number = TMDB_FETCH_TIMEOUT_MS
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs);
      // Pass through 2xx/3xx/4xx immediately. Only 5xx retries.
      if (res.status < 500) return res;
      // 5xx — record and retry on the first attempt; on the second
      // attempt, return the response so the caller can throw a
      // descriptive error with the original status.
      lastError = new Error(`HTTP ${res.status}`);
      if (attempt === 1) return res;
    } catch (err: unknown) {
      // Timeout (AbortError) — never retry. Throw immediately so the
      // caller's error handling (e.g. cachedFetch skipping cache
      // writes on error) kicks in.
      if (
        err &&
        typeof err === "object" &&
        "name" in err &&
        (err as { name: string }).name === "AbortError"
      ) {
        throw err;
      }
      // Other errors (typically TypeError for network failures) —
      // retry once. On the second failure, rethrow.
      lastError = err;
      if (attempt === 1) throw err;
    }
  }

  // Unreachable — both branches above return or throw on attempt 1.
  throw lastError ?? new Error("fetchWithRetry: unreachable");
}
