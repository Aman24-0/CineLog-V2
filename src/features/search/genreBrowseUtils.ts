// src/features/search/genreBrowseUtils.ts
import { discoverMovies, discoverTv } from "~/core/tmdb/discover";
import type { TMDBTitle } from "~/shared/types";

/**
 * genreBrowseUtils — pure helpers for the genre-browse mode of useSearch.
 *
 * Extracted to keep useSearch.ts under the 250-line limit. Contains:
 *   - GenreBrowseState interface + emptyGenreBrowse factory
 *   - fetchGenrePage: fetches one page of genre results from both movie
 *     and TV discover endpoints, merges, deduplicates, and returns 20
 *     interleaved items (10 movies + 10 TV, alternating).
 */

export interface GenreBrowseState {
  /** The genre name being browsed (e.g. "Horror") — null when not browsing */
  genre: string | null;
  /** The TMDB genre IDs for movies + TV (resolved via genreIdFor) */
  movieGenreId: number | undefined;
  tvGenreId: number | undefined;
  /** Accumulated results (movies + series merged, deduped) */
  items: TMDBTitle[];
  /** Whether a fetch is in flight */
  loading: boolean;
  /** Current page (1-indexed) — for infinite scroll */
  page: number;
  /** Whether more pages are available */
  hasMore: boolean;
}

export const emptyGenreBrowse = (): GenreBrowseState => ({
  genre: null,
  movieGenreId: undefined,
  tvGenreId: undefined,
  items: [],
  loading: false,
  page: 1,
  hasMore: true,
});

/**
 * fetchGenrePage — fetch one page of genre results.
 *
 * Fetches from both movie and TV discover endpoints in parallel, then
 * interleaves the results (movie, tv, movie, tv...) for variety. Returns
 * ~20 items per page (10 movies + 10 TV). Deduplicates by composite
 * "{media_type}/{id}" key in case the same title appears in both.
 */
export async function fetchGenrePage(
  _genreName: string,
  movieGenreId: number | undefined,
  tvGenreId: number | undefined,
  page: number,
): Promise<TMDBTitle[]> {
  const promises: Promise<TMDBTitle[]>[] = [];
  if (movieGenreId !== undefined) {
    promises.push(
      discoverMovies({
        withGenres: [movieGenreId],
        sortBy: "popularity.desc",
        voteCountGte: 100,
        page,
      }),
    );
  }
  if (tvGenreId !== undefined) {
    promises.push(
      discoverTv({
        withGenres: [tvGenreId],
        sortBy: "popularity.desc",
        voteCountGte: 50,
        page,
      }),
    );
  }
  const results = await Promise.all(promises);
  // Destructure safely — if only one endpoint was called (e.g. the genre
  // only exists for movies, not TV), the other array is empty.
  const movies: TMDBTitle[] = results[0] ?? [];
  const series: TMDBTitle[] = results[1] ?? [];
  // Interleave: alternate movie, tv, movie, tv... for variety
  const merged: TMDBTitle[] = [];
  const maxLen = Math.max(movies.length, series.length);
  for (let i = 0; i < maxLen; i++) {
    if (movies[i]) merged.push(movies[i]);
    if (series[i]) merged.push(series[i]);
  }
  // Deduplicate by composite key (in case the same title appears in both)
  const seen = new Set<string>();
  return merged.filter((t) => {
    const key = `${t.media_type}/${t.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
