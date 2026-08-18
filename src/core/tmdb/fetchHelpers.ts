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
 *   • TMDBError — custom Error subclass that carries the HTTP status
 *     code, so callers can distinguish "404 not found" (expected when
 *     batch-fetching auto-mapped AniList↔TMDB IDs that may be stale)
 *     from real failures (5xx, network). This lets `fetchTmdbMetadata`
 *     silently swallow 404s when called from a batch context while
 *     still logging real errors.
 *
 *   • TMDBRateLimitError — subclass of TMDBError for HTTP 429. Carries
 *     the Retry-After header value so callers can surface a "slow down"
 *     message with a specific backoff time. Never retried.
 *
 *   • TMDBTimeoutError — thrown when AbortController aborts the fetch.
 *     Distinct from TMDBError / TypeError so callers can differentiate
 *     "the server is slow" from "the server returned an error" or
 *     "the network is down". Never retried.
 *
 * Both helpers are pure fetch() wrappers — they don't touch the cache.
 * Cache + in-flight dedup are handled by `cachedFetch` in
 * `~/shared/utils/apiCache`, which wraps these helpers at each call
 * site.
 */

/** Default timeout for TMDB API calls (10 seconds). */
export const TMDB_FETCH_TIMEOUT_MS = 10_000;

/**
 * Custom Error subclass for TMDB HTTP failures.
 *
 * The `status` field lets callers distinguish between:
 *   • 404 — common when batch-fetching auto-mapped AniList→TMDB IDs
 *     (some matches are stale / point to deleted entries). These are
 *     expected and should NOT pollute the console.
 *   • 4xx (other) — usually a bug in our code (bad endpoint). Should
 *     be logged but not retried.
 *   • 5xx — transient upstream failure. Should be retried once and
 *     logged if the retry also fails.
 */
export class TMDBError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(status: number, endpoint: string) {
    super(`TMDB request failed: ${status} (${endpoint})`);
    this.name = "TMDBError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

/**
 * Subclass of TMDBError for HTTP 429 (Too Many Requests).
 *
 * Thrown when TMDB's rate limit is hit. Callers can check
 * `err instanceof TMDBRateLimitError` to surface a user-visible
 * "slow down" message instead of a generic error. The `retryAfterMs`
 * field carries the Retry-After header value (in seconds) when the
 * server provides it.
 */
export class TMDBRateLimitError extends TMDBError {
  /** Retry-After value from the response header (seconds), if present. */
  readonly retryAfterSec: number | null;

  constructor(endpoint: string, retryAfterSec: number | null = null) {
    super(429, endpoint);
    this.name = "TMDBRateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

/**
 * Custom error for request timeouts.
 *
 * Thrown by fetchWithRetry when AbortController aborts the request.
 * Distinct from TMDBError (network/HTTP errors) so callers can
 * differentiate "the server is slow" from "the server returned an
 * error" or "the network is down".
 */
export class TMDBTimeoutError extends Error {
  readonly url: string;

  constructor(url: string) {
    super(`TMDB request timed out: ${url}`);
    this.name = "TMDBTimeoutError";
    this.url = url;
  }
}

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
 *   • 429            → NEVER retry. Throws TMDBRateLimitError immediately
 *                       so callers can surface a rate-limit message.
 *   • 401 / 403      → NEVER retry. Returns the response so the caller's
 *                       `if (!r.ok) throw` fires. Retrying auth errors
 *                       is pointless (the token won't magically appear).
 *   • 4xx (other)    → NEVER retry. 4xx is a client error (bad URL,
 *                       not-found); retrying can't fix it.
 *   • Network error  → retry once. (TypeError from fetch() when the
 *                       request can't reach the server — DNS failure,
 *                       connection refused, offline, etc.)
 *   • Timeout        → NEVER retry. Throws TMDBTimeoutError immediately.
 *                       AbortError means the server is slow; retrying
 *                       would just hang for another 10 seconds.
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

      // 429 — rate-limited. Throw immediately with the Retry-After
      // header value (if present) so callers can show a backoff message.
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const retryAfterSec =
          retryAfter !== null ? Number(retryAfter) || null : null;
        throw new TMDBRateLimitError(url, retryAfterSec);
      }

      // 401 / 403 — auth errors. Never retry. Return the response
      // so the caller's `if (!r.ok) throw TMDBError(...)` fires with
      // the correct status code.
      if (res.status === 401 || res.status === 403) return res;

      // Pass through 2xx/3xx/4xx immediately. Only 5xx retries.
      if (res.status < 500) return res;
      // 5xx — record and retry on the first attempt; on the second
      // attempt, return the response so the caller can throw a
      // descriptive error with the original status.
      lastError = new Error(`HTTP ${res.status}`);
      if (attempt === 1) return res;
    } catch (err: unknown) {
      // TMDBRateLimitError — re-throw immediately (never retry 429).
      if (err instanceof TMDBRateLimitError) throw err;

      // Timeout (AbortError) — never retry. Throw TMDBTimeoutError
      // so callers can distinguish timeout from network errors.
      if (
        err &&
        typeof err === "object" &&
        "name" in err &&
        (err as { name: string }).name === "AbortError"
      ) {
        throw new TMDBTimeoutError(url);
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
