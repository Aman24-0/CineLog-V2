// src/features/details/useMdbListRatings.ts
import { createResource, createMemo, type Accessor } from "solid-js";

/**
 * useMdbListRatings — fetches IMDb / Rotten Tomatoes / Metacritic
 * ratings (with vote counts) from our own /api/media/ratings server
 * route, which proxies the MDBList API server-side.
 *
 * The server route handles:
 *   - API key security (MDBLIST_API_KEY is server-only)
 *   - Long-term CDN caching (24h browser + 7d stale-while-revalidate)
 *   - Normalizing MDBList's varied response shapes into a stable payload
 *
 * We re-fetch whenever `tmdbId` changes (the user opens a different
 * title in the Details modal). The fetch is non-blocking — the UI
 * shows a skeleton loader while `loading()` is true.
 *
 * If the fetch fails (network error, 500, etc.) we return `null` so
 * the UI can fall back to "NR" for all three services.
 */

/** A single service's normalized rating. */
export interface ServiceRating {
  /** Display score, e.g. "8.0", "85%", "77". "NR" if unavailable. */
  score: string;
  /** Compact vote count, e.g. "11K", "432". "0" if unavailable. */
  votes: string;
}

/** TheMDBList ratings payload returned by /api/media/ratings. */
export interface RatingsPayload {
  imdb: ServiceRating | null;
  rottenTomatoes: ServiceRating | null;
  metacritic: ServiceRating | null;
}

/**
 * @param tmdbId — accessor returning the TMDB id of the currently-open
 *   title, or null when no title is open. The fetch only fires when
 *   this returns a truthy value.
 */
export function useMdbListRatings(tmdbId: Accessor<string | number | null | undefined>) {
  // Wrap the id in a memo so createResource only refetches when the id
  // actually changes (not on every render of the parent).
  const source = createMemo(() => {
    const id = tmdbId();
    if (id == null || id === "") return null;
    return String(id);
  });

  const fetcher = async (id: string | null): Promise<RatingsPayload | null> => {
    if (!id) return null;
    try {
      const res = await fetch(`/api/media/ratings?tmdb=${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as RatingsPayload;
      return data;
    } catch (err) {
      console.warn("[useMdbListRatings] fetch failed:", err);
      return null;
    }
  };

  const [data] = createResource(source, fetcher);

  return {
    ratings: () => data() ?? null,
    loading: () => data.loading,
    error: () => data.error,
  };
}
