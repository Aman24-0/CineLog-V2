// src/core/tmdb/discover.ts
import { TMDB_KEY } from "./tmdb";
import type { TMDBTitle } from "~/shared/types";
import { cachedFetch, buildCacheKey, TMDB_TTL } from "~/shared/utils/apiCache";
import { GENRE_ID, genreIdFor } from "./genres";
import { normalizeList, type TMDBRawItem } from "./discoverNormalize";

// Re-export genre helpers + raw type so existing consumers can keep
// importing from discover.ts.
export { GENRE_ID, genreIdFor };
export type { TMDBRawItem };

/**
 * Discover API — the read-only TMDB layer for Discover V2.
 *
 * Every function returns normalized `TMDBTitle[]`. Discover never mutates
 * Firestore; adding to vault goes through the existing useVault flow.
 *
 * All endpoints are server-safe (plain fetch, no client-only APIs).
 * Genre maps live in `./genres.ts`. Normalization lives in
 * `./discoverNormalize.ts`.
 */

const API = "https://api.themoviedb.org/3";

/* ------------------------------------------------------------------
   Endpoint wrappers. Each returns TMDBTitle[] (already normalized).
   ------------------------------------------------------------------ */

/** discover/movie — the workhorse for "Because you watched", "Hidden gems", etc. */
export async function discoverMovies(opts: {
  withGenres?: number[];          // genre IDs
  withoutGenres?: number[];
  sortBy?: string;                // e.g. "vote_average.desc", "popularity.asc"
  voteCountGte?: number;
  voteAverageGte?: number;
  primaryReleaseDateGte?: string; // YYYY-MM-DD
  primaryReleaseDateLte?: string;
  page?: number;
  withRuntimeGte?: number;
  withRuntimeLte?: number;
  withKeywords?: number;
}): Promise<TMDBTitle[]> {
  const params = new URLSearchParams({
    api_key: TMDB_KEY,
    language: "en-US",
    sort_by: opts.sortBy || "popularity.desc",
    "vote_count.gte": String(opts.voteCountGte ?? 100),
    page: String(opts.page ?? 1),
    include_adult: "false"
  });
  if (opts.withGenres?.length) params.set("with_genres", opts.withGenres.join(","));
  if (opts.withoutGenres?.length) params.set("without_genres", opts.withoutGenres.join(","));
  if (opts.voteAverageGte != null) params.set("vote_average.gte", String(opts.voteAverageGte));
  if (opts.primaryReleaseDateGte) params.set("primary_release_date.gte", opts.primaryReleaseDateGte);
  if (opts.primaryReleaseDateLte) params.set("primary_release_date.lte", opts.primaryReleaseDateLte);
  if (opts.withRuntimeGte != null) params.set("with_runtime.gte", String(opts.withRuntimeGte));
  if (opts.withRuntimeLte != null) params.set("with_runtime.lte", String(opts.withRuntimeLte));
  if (opts.withKeywords != null) params.set("with_keywords", String(opts.withKeywords));

  const res = await cachedFetch(
    buildCacheKey("tmdb:discover/movie", { q: params.toString() }),
    TMDB_TTL,
    async () => {
      const r = await fetch(`${API}/discover/movie?${params}`);
      if (!r.ok) throw new Error(`discoverMovies failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "movie");
}

/** discover/tv — same idea, for TV-based trajectories. */
export async function discoverTv(opts: {
  withGenres?: number[];
  withoutGenres?: number[];
  sortBy?: string;
  voteCountGte?: number;
  voteAverageGte?: number;
  firstAirDateGte?: string;
  page?: number;
}): Promise<TMDBTitle[]> {
  const params = new URLSearchParams({
    api_key: TMDB_KEY,
    language: "en-US",
    sort_by: opts.sortBy || "popularity.desc",
    "vote_count.gte": String(opts.voteCountGte ?? 50),
    page: String(opts.page ?? 1)
  });
  if (opts.withGenres?.length) params.set("with_genres", opts.withGenres.join(","));
  if (opts.withoutGenres?.length) params.set("without_genres", opts.withoutGenres.join(","));
  if (opts.voteAverageGte != null) params.set("vote_average.gte", String(opts.voteAverageGte));
  if (opts.firstAirDateGte) params.set("first_air_date.gte", opts.firstAirDateGte);

  const res = await cachedFetch(
    buildCacheKey("tmdb:discover/tv", { q: params.toString() }),
    TMDB_TTL,
    async () => {
      const r = await fetch(`${API}/discover/tv?${params}`);
      if (!r.ok) throw new Error(`discoverTv failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "tv");
}

/**
 * recommendations — "More like X". TMDB returns movie and tv recs from
 * different endpoints; this calls both based on mediaType.
 */
export async function getRecommendations(
  mediaType: "movie" | "tv",
  id: number | string
): Promise<TMDBTitle[]> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:recommendations", { type: mediaType, id: String(id) }),
    TMDB_TTL,
    async () => {
      const r = await fetch(
        `${API}/${mediaType}/${id}/recommendations?api_key=${TMDB_KEY}&language=en-US&page=1`
      );
      if (!r.ok) throw new Error(`getRecommendations failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, mediaType);
}

/**
 * trending — used by the Cosmos fold and the guest Spotlight fallback.
 * window="week" matches the user's mental model of "what's current".
 */
export async function getTrending(
  mediaType: "movie" | "tv" | "all" = "all",
  window: "day" | "week" = "week"
): Promise<TMDBTitle[]> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:trending", { type: mediaType, window }),
    TMDB_TTL,
    async () => {
      const r = await fetch(
        `${API}/trending/${mediaType}/${window}?api_key=${TMDB_KEY}&language=en-US`
      );
      if (!r.ok) throw new Error(`getTrending failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results);
}

/**
 * topRated — used for the guest Spotlight fallback pool and for one
 * Cosmos cluster ("Universally Acclaimed"). Page 1 of TMDB's
 * /movie/top_rated, language=en-US.
 */
export async function getTopRatedMovies(): Promise<TMDBTitle[]> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:top_rated"),
    TMDB_TTL,
    async () => {
      const r = await fetch(
        `${API}/movie/top_rated?api_key=${TMDB_KEY}&language=en-US&page=1`
      );
      if (!r.ok) throw new Error(`getTopRatedMovies failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "movie");
}

/**
 * searchMulti — fallback for franchise search when the keyword table
 * doesn't produce enough results. Returns mixed movie/tv.
 */
export async function searchMulti(query: string): Promise<TMDBTitle[]> {
  const params = new URLSearchParams({
    api_key: TMDB_KEY,
    language: "en-US",
    query,
    page: "1",
    include_adult: "false"
  });
  const res = await cachedFetch(
    buildCacheKey("tmdb:search/multi", { q: query }),
    TMDB_TTL,
    async () => {
      const r = await fetch(`${API}/search/multi?${params}`);
      if (!r.ok) throw new Error(`searchMulti failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(
    (res.results || []).filter((r: TMDBRawItem) => r.media_type === "movie" || r.media_type === "tv")
  );
}

/**
 * fetchTitleDetails — minimal details fetch for resolving a director
 * name on a Discover card. We only call this when we actually need
 * the director (e.g. for the "Directors you love" surface); the
 * standard discover flow doesn't need it.
 *
 * Returns the TMDBTitle plus a `director` field (first listed director
 * for movies, first creator for TV).
 */
export async function fetchTitleDirector(
  mediaType: "movie" | "tv",
  id: number | string
): Promise<string | undefined> {
  const res = await fetch(
    `${API}/${mediaType}/${id}/credits?api_key=${TMDB_KEY}&language=en-US`
  );
  if (!res.ok) return undefined;
  const json = await res.json();
  const crew: Array<{ job: string; name: string; department?: string }> = json.crew || [];
  // Movies: look for "Director". TV: look for "Creator" (sometimes "Executive Producer").
  if (mediaType === "movie") {
    const dir = crew.find((c) => c.job === "Director");
    return dir?.name;
  }
  const creator = crew.find((c) => c.job === "Creator") ||
    crew.find((c) => c.job === "Executive Producer" && c.department === "Production");
  return creator?.name;
}
