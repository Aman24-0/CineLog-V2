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
 *   - Mapping frontend `media_type` ("movie"|"tv") to MDBList's path
 *     segment ("movie"|"show") via the `type` query param
 *
 * We re-fetch whenever `tmdbId` OR `mediaType` changes (the user opens
 * a different title in the Details modal). The fetch is non-blocking —
 * the UI shows a skeleton loader while `loading()` is true.
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

/** The media-type values the frontend sends (matches TMDB's convention). */
export type FrontendMediaType = "movie" | "tv";

/**
 * Build a stable cache key for createResource. Returns null when either
 * field is missing (so the fetch only fires when we have a complete
 * identity). The string is `"${mediaType}/${tmdbId}"` so changing
 * either value triggers a refetch.
 */
function buildSourceKey(
  tmdbId: string | number | null | undefined,
  mediaType: FrontendMediaType | null | undefined
): string | null {
  if (tmdbId == null || tmdbId === "") return null;
  if (!mediaType) return null;
  return `${mediaType}/${tmdbId}`;
}

/**
 * @param tmdbId — accessor returning the TMDB id of the currently-open
 *   title, or null when no title is open.
 * @param mediaType — accessor returning "movie" or "tv" for the
 *   currently-open title. MDBList's v2 Title Lookup endpoint requires
 *   this as a path segment (mapped to "movie"|"show" server-side).
 */
export function useMdbListRatings(
  tmdbId: Accessor<string | number | null | undefined>,
  mediaType: Accessor<FrontendMediaType | null | undefined>
) {
  // Combine the two accessors into a single memo. createResource only
  // refetches when the memo's return value changes (by reference for
  // objects, by value for primitives — we return a string so it's
  // compared by value).
  const source = createMemo(() => buildSourceKey(tmdbId(), mediaType()));

  const fetcher = async (
    sourceKey: string | null
  ): Promise<RatingsPayload | null> => {
    if (!sourceKey) return null;
    // sourceKey is "${mediaType}/${tmdbId}" — split it back out so we
    // can send them as separate query params to the server route.
    const slashIdx = sourceKey.indexOf("/");
    if (slashIdx < 0) return null;
    const mt = sourceKey.slice(0, slashIdx);
    const id = sourceKey.slice(slashIdx + 1);
    if (!mt || !id) return null;

    try {
      const res = await fetch(
        `/api/media/ratings?tmdb=${encodeURIComponent(id)}&type=${encodeURIComponent(mt)}`
      );
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
    error: () => data.error
  };
}
