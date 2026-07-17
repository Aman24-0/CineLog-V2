/**
 * CineLog V2 — Request Deduplication & Offline Handling
 * ---------------------------------------------------------------------
 * Prevents duplicate in-flight requests and provides offline detection.
 *
 * Problem: Multiple components may request the same data simultaneously
 * (e.g., multiple vault cards loading on mount). Without dedup, each
 * component fires its own Supabase query — wasting bandwidth and
 * potentially hitting rate limits.
 *
 * Solution: `dedupRequest` takes a key and a fetcher function. If a
 * request with the same key is already in flight, subsequent callers
 * receive the same Promise instead of firing a new request.
 *
 * Offline handling: `isOffline()` returns a reactive signal. When the
 * browser goes offline, pending requests fail fast with a descriptive
 * error instead of waiting for a timeout.
 */

import { createSignal, onCleanup } from "solid-js";

// ---------------------------------------------------------------------------
// Request deduplication
// ---------------------------------------------------------------------------

const inflight = new Map<string, Promise<unknown>>();

/**
 * Deduplicate an async request by key.
 *
 * If a request with the same key is already in flight, returns the
 * existing Promise. Otherwise, executes the fetcher and caches the
 * result until it resolves.
 *
 * @param key     Unique identifier for this request (e.g., "vault:user123").
 * @param fetcher The async function to execute if no duplicate is in flight.
 * @returns The result of the fetcher (shared with any concurrent callers).
 */
export async function dedupRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

/**
 * Cancel all in-flight requests. Useful on sign-out to prevent
 * stale data from updating the UI after the session ends.
 */
export function cancelAllRequests(): void {
  inflight.clear();
}

// ---------------------------------------------------------------------------
// Offline detection
// ---------------------------------------------------------------------------

const [isOffline, setIsOffline] = createSignal(
  typeof navigator !== "undefined" ? !navigator.onLine : false
);

if (typeof window !== "undefined") {
  const handleOnline = () => setIsOffline(false);
  const handleOffline = () => setIsOffline(true);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  onCleanup(() => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  });
}

/**
 * Reactive signal indicating whether the browser is offline.
 * Returns true when `navigator.onLine` is false.
 */
export { isOffline };

/**
 * Guard that throws a descriptive error if the browser is offline.
 * Call this before making Supabase or TMDB requests to fail fast
 * instead of waiting for a network timeout.
 *
 * @throws Error with a user-friendly message when offline.
 */
export function requireOnline(): void {
  if (isOffline()) {
    throw new Error(
      "You appear to be offline. Please check your internet connection and try again."
    );
  }
}
