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
 * null (title has no IMDb rating on MDBList). Once cached, the value
 * persists for the entire browser session — scrolling back to a
 * previously-viewed card is instant.
 */
const ratingCache = new Map<string, string | null>();

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
    // Already cached — set the signal synchronously.
    if (ratingCache.has(key)) {
      setRating(ratingCache.get(key) ?? null);
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
        ratingCache.set(key, normalized);
        inFlight.delete(key);
        // Notify all pending callbacks (including ours).
        const cbs = pendingCallbacks.get(key) ?? [];
        for (const cb of cbs) cb(normalized);
        pendingCallbacks.delete(key);
      })
      .catch(() => {
        // Network error — cache null so we don't retry every scroll.
        ratingCache.set(key, null);
        inFlight.delete(key);
        const cbs = pendingCallbacks.get(key) ?? [];
        for (const cb of cbs) cb(null);
        pendingCallbacks.delete(key);
      });
  };

  // Set up the IntersectionObserver on mount. The observer watches the
  // card's root element and fires the fetch when it first scrolls into
  // view. After the first intersection, the observer disconnects (we
  // don't need to re-fetch on every scroll — the cache handles repeats).
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    if (isServer) return;
    if (typeof IntersectionObserver === "undefined") {
      // IntersectionObserver not available (very old browser) — just
      // fire the fetch immediately as a fallback.
      const key = cacheKey();
      if (key) fetchRating(key);
      return;
    }

    // Check the cache synchronously on mount — if the score is already
    // cached (e.g. the user scrolled to this card before), set it
    // immediately without waiting for intersection.
    const key = cacheKey();
    if (key && ratingCache.has(key)) {
      setRating(ratingCache.get(key) ?? null);
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const k = cacheKey();
            if (k) fetchRating(k);
            observer?.disconnect();
            observer = undefined;
            break;
          }
        }
      },
      { rootMargin: "200px 0px", threshold: 0 }
    );

    // Observe the element. It might not be available yet (SolidJS sets
    // refs after the element is created). Use a microtask delay to
    // ensure the ref is populated.
    const el = elementRef();
    if (el) {
      observer.observe(el);
    } else {
      // Ref not ready — try again on the next microtask.
      queueMicrotask(() => {
        const el2 = elementRef();
        if (el2 && observer) observer.observe(el2);
      });
    }
  });

  onCleanup(() => {
    observer?.disconnect();
    observer = undefined;
  });

  return { rating, loading };
}
