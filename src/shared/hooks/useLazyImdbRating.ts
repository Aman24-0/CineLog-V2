// src/shared/hooks/useLazyImdbRating.ts
//
// useLazyImdbRating — lazily fetches the MDBList IMDb score for a
// movie/TV title ONLY when the card scrolls into the viewport.
//
// PERFORMANCE ARCHITECTURE:
//   A Discover page can render 60-120 cards across 6 rows. If every
//   card fired a fetch to /api/media/ratings on mount, we'd spam the
//   MDBList API (which is rate-limited) and block the main thread.
//
//   This hook solves that with THREE layers of protection:
//
//   1. MODULE-LEVEL CACHE — a Map<string, string | null> keyed by
//      "${mediaType}/${tmdbId}". Once a title's IMDb score is fetched
//      (including null = unavailable), it's cached for the entire
//      session. Scrolling back to a previously-viewed card is instant
//      (zero network requests).
//
//   2. IN-FLIGHT DEDUP — a Set<string> of cache keys currently being
//      fetched. If two cards for the same title enter the viewport
//      simultaneously, only ONE fetch fires — both cards update when
//      it resolves.
//
//   3. INTERSECTION OBSERVER — the fetch doesn't fire until the card's
//      element scrolls into the viewport. Cards below the fold never
//      hit the API. The observer disconnects after the first intersection
//      (we don't need to re-fetch on every scroll).
//
//      PERFORMANCE (Phase 5 Task 1): A single SHARED IntersectionObserver
//      is used for ALL cards, backed by a WeakMap<element, callback>.
//      Previously each card instantiated its own IntersectionObserver on
//      mount — on a Discover page with 100+ cards that meant 100+ live
//      observers, each with its own internal callback queue + element
//      set. Browsers cap the per-page observer count and each observer
//      adds its own bookkeeping cost. The shared observer eliminates
//      that overhead entirely: one observer, one callback, O(1) per
//      card registration. The WeakMap ensures that when an element is
//      GC'd (card unmounts), its callback entry is collected too — no
//      manual unobserve bookkeeping needed beyond the explicit
//      `sharedObserver.unobserve(el)` in onCleanup (which removes the
//      element from the observer's internal watch set immediately so
//      the callback never fires for a detached element).
//
// FALLBACK BEHAVIOR:
//   While the score is loading (or if the API returns null/error), the
//   hook returns `null`. The caller falls back to TMDB's `vote_average`
//   so the badge is never blank — it just shows the TMDB score until the
//   MDBList score arrives, then swaps to the IMDb score.

import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";

// ─── Module-level cache (shared across ALL cards) ────────────────────

/**
 * Cache: "${mediaType}/${tmdbId}" → IMDb score string (e.g. "7.3") or
 * null (title has no IMDb rating on MDBList). Bounded to 500 entries
 * via LRU eviction (Performance Sprint 1, Task 2).
 */
const ratingCache = new Map<string, string | null>();

/**
 * LRU Cache with bounded size (Performance Sprint 1, Task 2).
 *
 * Replaces the unbounded Map with a 500-entry LRU. When the cache
 * is full, the least-recently-used entry is evicted. This prevents
 * memory growth on long sessions (user scrolls through 1000+ titles
 * across Discover, Search, Collections, etc.).
 *
 * The LRU is implemented as a Map (which maintains insertion order).
 * On every `get`, the entry is deleted and re-inserted at the end
 * (most-recently-used). On `set`, if the cache exceeds MAX_SIZE,
 * the first entry (least-recently-used) is deleted.
 *
 * Preserves all existing behavior: O(1) lookups, request deduplication,
 * null-caching for unavailable titles.
 */
const MAX_CACHE_SIZE = 500;

// Internal LRU operations — not exposed outside this module.
const lruGet = (key: string): string | null | undefined => {
  if (!ratingCache.has(key)) return undefined;
  // Move to end (most-recently-used) by delete + re-insert.
  const value = ratingCache.get(key)!;
  ratingCache.delete(key);
  ratingCache.set(key, value);
  return value;
};

const lruSet = (key: string, value: string | null): void => {
  // If key already exists, delete first so it moves to end.
  if (ratingCache.has(key)) ratingCache.delete(key);
  // Evict least-recently-used if at capacity.
  if (ratingCache.size >= MAX_CACHE_SIZE) {
    const oldest = ratingCache.keys().next().value;
    if (oldest !== undefined) ratingCache.delete(oldest);
  }
  ratingCache.set(key, value);
};

/**
 * Set of cache keys currently in-flight. Prevents duplicate fetches
 * when multiple cards for the same title enter the viewport at the
 * same time (e.g. a title appears in two Discover rows).
 */
const inFlight = new Set<string>();

/**
 * Pending callbacks for an in-flight request. When a fetch resolves,
 * all registered callbacks for that key are invoked with the result.
 * This is how the in-flight dedup works — the second card registers
 * its callback and gets notified when the first card's fetch completes.
 */
const pendingCallbacks = new Map<
  string,
  Array<(score: string | null) => void>
>();

// ─── Shared IntersectionObserver pool (Phase 5 Task 1) ──────────────
//
// A SINGLE IntersectionObserver is shared across every card that uses
// useLazyImdbRating. Previously each card created its own observer on
// mount, which on a Discover page with 100+ cards meant 100+ live
// IntersectionObserver instances — each carrying its own internal
// element set + callback queue. Browsers cap the per-page observer
// count and each one adds bookkeeping cost.
//
// The shared observer is lazily constructed on first use (client only)
// and lives for the lifetime of the page. Each card registers its
// element + a per-card callback in a WeakMap; when the observer fires
// for any entry, we look up the matching callback and invoke it.
//
// The WeakMap is keyed by the element itself — when an element is
// detached + GC'd, its callback entry is collected automatically. We
// also explicitly `unobserve(el)` in onCleanup so the observer stops
// firing for that element immediately (the WeakMap GC is lazy and
// could fire one last callback for a detached element otherwise).
//
// The callback receives the element so the observer's main handler
// stays generic (no per-card closures captured in the observer itself).

type IntersectionCallback = (element: HTMLElement) => void;

let sharedObserver: IntersectionObserver | null = null;
const elementCallbacks = new WeakMap<HTMLElement, IntersectionCallback>();

/**
 * Lazily construct the shared IntersectionObserver. Returns null on
 * platforms without IntersectionObserver support (SSR, very old
 * browsers) — the caller falls back to an immediate fetch.
 */
function getSharedObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (sharedObserver) return sharedObserver;

  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const cb = elementCallbacks.get(el);
        if (cb) {
          // Invoke the per-card callback. The callback is responsible
          // for unobserving the element (so the observer stops watching
          // it after the first intersection) and clearing its WeakMap
          // entry — we don't do it here because the callback may want
          // to re-arm the observer for a different cache key.
          cb(el);
        }
      }
    },
    { rootMargin: "200px 0px", threshold: 0 }
  );

  return sharedObserver;
}

/**
 * Register `callback` to fire when `element` first scrolls into view.
 * Uses the shared IntersectionObserver pool — O(1) registration, no
 * per-card observer allocation. The callback fires AT MOST ONCE per
 * registration; the caller is responsible for re-registering if it
 * wants to observe subsequent intersections.
 */
function observeOnce(
  element: HTMLElement,
  callback: IntersectionCallback
): void {
  const observer = getSharedObserver();
  if (!observer) {
    // No IntersectionObserver support — fire immediately.
    callback(element);
    return;
  }
  elementCallbacks.set(element, callback);
  observer.observe(element);
}

/**
 * Unobserve an element and clear its callback entry. Safe to call
 * even if the element was never observed (no-op).
 */
function unobserveElement(element: HTMLElement): void {
  if (sharedObserver) sharedObserver.unobserve(element);
  elementCallbacks.delete(element);
}

// ─── Hook ────────────────────────────────────────────────────────────

export interface LazyImdbRating {
  /**
   * The IMDb score string (e.g. "7.3"), or null while loading / unavailable.
   * The caller should fall back to TMDB's vote_average when this is null.
   */
  rating: Accessor<string | null>;
  /** True while the fetch is in-flight. False once it resolves (or if cached). */
  loading: Accessor<boolean>;
}

/**
 * useLazyImdbRating — lazily fetch the MDBList IMDb score for a title.
 *
 * @param tmdbId     Accessor returning the TMDB id (number or string).
 * @param mediaType  Accessor returning "movie" or "tv".
 * @param elementRef Accessor returning the HTML element to observe for
 *                   intersection (the card's root element). The fetch
 *                   only fires when this element scrolls into view.
 * @returns { rating, loading } — see LazyImdbRating interface.
 */
export function useLazyImdbRating(
  tmdbId: Accessor<string | number | null | undefined>,
  mediaType: Accessor<"movie" | "tv" | null | undefined>,
  elementRef: Accessor<HTMLElement | undefined>
): LazyImdbRating {
  const [rating, setRating] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  // Build the cache key from the current tmdbId + mediaType.
  const cacheKey = (): string | null => {
    const id = tmdbId();
    const mt = mediaType();
    if (id == null || id === "" || !mt) return null;
    return `${mt}/${id}`;
  };

  /**
   * Fire the fetch for the given cache key. Uses the module-level
   * in-flight set + pending-callbacks map so duplicate requests are
   * deduped. On resolve, updates the cache + invokes all pending
   * callbacks + updates the local signal.
   */
  const fetchRating = (key: string) => {
    // Already cached — set the signal synchronously (LRU get promotes).
    const cached = lruGet(key);
    if (cached !== undefined) {
      setRating(cached);
      setLoading(false);
      return;
    }

    // Already in-flight — register a callback, don't fire a new request.
    if (inFlight.has(key)) {
      setLoading(true);
      const callbacks = pendingCallbacks.get(key) ?? [];
      callbacks.push((score) => {
        setRating(score);
        setLoading(false);
      });
      pendingCallbacks.set(key, callbacks);
      return;
    }

    // Fire a new request.
    inFlight.add(key);
    setLoading(true);

    // Register our own callback so we get notified too.
    const callbacks = pendingCallbacks.get(key) ?? [];
    callbacks.push((score) => {
      setRating(score);
      setLoading(false);
    });
    pendingCallbacks.set(key, callbacks);

    // Parse the key back into mediaType + tmdbId for the fetch.
    const slashIdx = key.indexOf("/");
    const mt = key.slice(0, slashIdx);
    const id = key.slice(slashIdx + 1);

    fetch(
      `/api/media/ratings?tmdb=${encodeURIComponent(id)}&type=${encodeURIComponent(mt)}`
    )
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data: { imdb?: { score?: string } | null } | null) => {
        // Extract the IMDb score. "NR" means unavailable → cache null.
        const score = data?.imdb?.score;
        const normalized = score && score !== "NR" ? score : null;
        lruSet(key, normalized);
        inFlight.delete(key);
        // Notify all pending callbacks (including ours).
        const cbs = pendingCallbacks.get(key) ?? [];
        for (const cb of cbs) cb(normalized);
        pendingCallbacks.delete(key);
      })
      .catch(() => {
        // Network error — cache null so we don't retry every scroll.
        lruSet(key, null);
        inFlight.delete(key);
        const cbs = pendingCallbacks.get(key) ?? [];
        for (const cb of cbs) cb(null);
        pendingCallbacks.delete(key);
      });
  };

  // Set up the shared IntersectionObserver on mount. The observer
  // watches the card's root element and fires the fetch when it first
  // scrolls into view. After the first intersection, the element is
  // unobserved (we don't need to re-fetch on every scroll — the cache
  // handles repeats).
  //
  // Phase 5 Task 1: uses the shared observer pool instead of a
  // per-card observer. The `observedEl` ref lets onCleanup unobserve
  // the exact element that was registered (the ref may be populated
  // asynchronously via queueMicrotask).
  let observedEl: HTMLElement | undefined;

  onMount(() => {
    if (isServer) return;

    // Check the cache synchronously on mount — if the score is already
    // cached (e.g. the user scrolled to this card before), set it
    // immediately without waiting for intersection.
    const key = cacheKey();
    if (key) {
      const cached = lruGet(key);
      if (cached !== undefined) {
        setRating(cached);
        return;
      }
    }

    // Register with the shared observer. observeOnce handles the
    // "IntersectionObserver not available" fallback by invoking the
    // callback immediately, so we don't need a separate code path.
    const register = (el: HTMLElement) => {
      observedEl = el;
      observeOnce(el, (target) => {
        // Stop watching this element immediately so the callback
        // never fires again for the same registration.
        unobserveElement(target);
        observedEl = undefined;
        const k = cacheKey();
        if (k) fetchRating(k);
      });
    };

    const el = elementRef();
    if (el) {
      register(el);
    } else {
      // Ref not ready — try again on the next microtask. SolidJS
      // populates refs after the element is created, which happens
      // just after onMount fires.
      queueMicrotask(() => {
        const el2 = elementRef();
        if (el2) register(el2);
      });
    }
  });

  onCleanup(() => {
    // Unobserve the element we registered (if any). This is critical
    // for cards that unmount before their first intersection — without
    // it, the shared observer would keep the element in its internal
    // watch set forever (the WeakMap GC is lazy). The shared observer
    // itself is never disconnected — it lives for the page lifetime
    // and serves all cards.
    if (observedEl) {
      unobserveElement(observedEl);
      observedEl = undefined;
    }
  });

  return { rating, loading };
}
