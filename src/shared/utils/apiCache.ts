/**
 * CineLog V2 — API Cache (Memory + In-Flight Dedup)
 * ---------------------------------------------------------------------
 * Lightweight in-memory cache for TMDB and OMDb API responses.
 * Prevents duplicate network requests within the TTL window and
 * deduplicates concurrent in-flight requests (multiple components
 * requesting the same data share a single Promise).
 *
 * TTL:
 *   TMDB: 10 minutes (600,000 ms)
 *   OMDb: 24 hours (86,400,000 ms)
 *
 * No persistence — cache is per-session (cleared on page reload).
 * SSR-safe: the cache is module-level and only populated on the client.
 */

// ---------------------------------------------------------------------------
// Cache entry shape
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

// ---------------------------------------------------------------------------
// TTL constants
// ---------------------------------------------------------------------------

export const TMDB_TTL = 10 * 60 * 1000;   // 10 minutes
export const OMDb_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// Cache storage
// ---------------------------------------------------------------------------

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a cache key from the endpoint + parameters.
 * The key includes all parts that affect the response.
 */
export function buildCacheKey(
  endpoint: string,
  params?: Record<string, string | number | undefined>
): string {
  if (!params) return endpoint;
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k] ?? ""}`)
    .join("&");
  return `${endpoint}?${sorted}`;
}

/**
 * Get a cached value if it exists and hasn't expired.
 * Returns `undefined` if not cached or expired.
 */
export function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/**
 * Store a value in the cache with the given TTL.
 */
export function setCached<T>(key: string, value: T, ttl: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

/**
 * Check if a request is already in-flight for this key.
 * If so, return the existing Promise so callers share the result.
 */
export function getInFlight<T>(key: string): Promise<T> | undefined {
  return inFlight.get(key) as Promise<T> | undefined;
}

/**
 * Register an in-flight Promise for a key.
 */
export function setInFlight<T>(key: string, promise: Promise<T>): void {
  inFlight.set(key, promise);
  // Clean up after resolution/rejection
  promise.finally(() => inFlight.delete(key));
}

/**
 * Cached fetch wrapper for API calls.
 *
 * - If the result is cached and fresh, returns immediately (no network).
 * - If an identical request is already in-flight, shares the Promise.
 * - Otherwise, makes the network request, caches the result, and returns.
 *
 * @param key      Cache key (use buildCacheKey).
 * @param ttl      Time-to-live in milliseconds.
 * @param fetcher  Function that makes the actual network request.
 * @returns The cached or freshly-fetched result.
 */
export async function cachedFetch<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // 1. Check cache
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;

  // 2. Check in-flight
  const existing = getInFlight<T>(key);
  if (existing) return existing;

  // 3. Make the request
  const promise = fetcher();
  setInFlight(key, promise);

  // Don't cache errors — let the next call retry. The await re-throws
  // naturally if the promise rejects, so no try/catch wrapper needed.
  const result = await promise;
  setCached(key, result, ttl);
  return result;
}

/**
 * Clear all cached entries (useful for testing or manual refresh).
 */
export function clearCache(): void {
  cache.clear();
  inFlight.clear();
}
