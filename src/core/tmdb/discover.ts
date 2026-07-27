// src/core/tmdb/discover.ts
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

// All TMDB API calls now go through the server-side proxy at /api/media/*
// which injects the API key from TMDB_API_KEY (server-only env var).
// This fixes ISP/DNS blocking in certain regions and keeps the key hidden.
const API = "/api/media";

// ---------------------------------------------------------------------------
// Timeout helper — prevents fetch() from hanging forever
// ---------------------------------------------------------------------------

/** Default timeout for TMDB discover API calls (10 seconds). */
const TMDB_FETCH_TIMEOUT_MS = 10_000;

/**
 * fetch with AbortController timeout.
 * If the server is unreachable or slow, the request is aborted after
 * `timeoutMs` milliseconds instead of hanging indefinitely (which would
 * leave the Discover page stuck on a skeleton forever).
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = TMDB_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}


/* ------------------------------------------------------------------
   Endpoint wrappers. Each returns TMDBTitle[] (already normalized).
   ------------------------------------------------------------------ */

/** discover/movie — the workhorse for "Because you watched", "Hidden gems", etc. */
export async function discoverMovies(opts: {
  withGenres?: number[];          // genre IDs
  withoutGenres?: number[];
  sortBy?: string;                // e.g. "vote_average.desc", "popularity.asc"
  voteCountGte?: number;
  voteCountLte?: number;          // upper bound on vote_count (e.g. for "hidden gems" / "weekend picks")
  voteAverageGte?: number;
  primaryReleaseDateGte?: string; // YYYY-MM-DD
  primaryReleaseDateLte?: string;
  page?: number;
  withRuntimeGte?: number;
  withRuntimeLte?: number;
  withKeywords?: number;
}): Promise<TMDBTitle[]> {
  const params = new URLSearchParams({
    language: "en-US",
    sort_by: opts.sortBy || "popularity.desc",
    "vote_count.gte": String(opts.voteCountGte ?? 100),
    page: String(opts.page ?? 1),
    include_adult: "false"
  });
  if (opts.withGenres?.length) params.set("with_genres", opts.withGenres.join(","));
  if (opts.withoutGenres?.length) params.set("without_genres", opts.withoutGenres.join(","));
  if (opts.voteAverageGte != null) params.set("vote_average.gte", String(opts.voteAverageGte));
  if (opts.voteCountLte != null) params.set("vote_count.lte", String(opts.voteCountLte));
  if (opts.primaryReleaseDateGte) params.set("primary_release_date.gte", opts.primaryReleaseDateGte);
  if (opts.primaryReleaseDateLte) params.set("primary_release_date.lte", opts.primaryReleaseDateLte);
  if (opts.withRuntimeGte != null) params.set("with_runtime.gte", String(opts.withRuntimeGte));
  if (opts.withRuntimeLte != null) params.set("with_runtime.lte", String(opts.withRuntimeLte));
  if (opts.withKeywords != null) params.set("with_keywords", String(opts.withKeywords));

  const res = await cachedFetch(
    buildCacheKey("tmdb:discover/movie", { q: params.toString() }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(`${API}/discover/movie?${params}`);
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
      const r = await fetchWithTimeout(`${API}/discover/tv?${params}`);
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
      const r = await fetchWithTimeout(
        `${API}/${mediaType}/${id}/recommendations?language=en-US&page=1`
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
      const r = await fetchWithTimeout(
        `${API}/trending/${mediaType}/${window}?language=en-US`
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
      const r = await fetchWithTimeout(
        `${API}/movie/top_rated?language=en-US&page=1`
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
    language: "en-US",
    query,
    page: "1",
    include_adult: "false"
  });
  const res = await cachedFetch(
    buildCacheKey("tmdb:search/multi", { q: query }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(`${API}/search/multi?${params}`);
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
  const res = await fetchWithTimeout(
    `${API}/${mediaType}/${id}/credits?language=en-US`
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

// ---------------------------------------------------------------------------
// Discover V2 endpoints — now_playing, upcoming, watch providers, top TV
// ---------------------------------------------------------------------------

/**
 * getNowPlaying — movies currently in theatres.
 * Uses /movie/now_playing with region parameter for localization.
 */
export async function getNowPlaying(region = "IN"): Promise<TMDBTitle[]> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:now_playing", { region }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(
        `${API}/movie/now_playing?language=en-US&region=${region}&page=1`
      );
      if (!r.ok) throw new Error(`getNowPlaying failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "movie");
}

/**
 * getUpcoming — upcoming movies.
 * Uses /movie/upcoming with region parameter.
 */
export async function getUpcoming(region = "IN"): Promise<TMDBTitle[]> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:upcoming", { region }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(
        `${API}/movie/upcoming?language=en-US&region=${region}&page=1`
      );
      if (!r.ok) throw new Error(`getUpcoming failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "movie");
}

/**
 * getTopRatedTv — top-rated TV series.
 * Uses /tv/top_rated.
 */
export async function getTopRatedTv(): Promise<TMDBTitle[]> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:top_rated_tv"),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(
        `${API}/tv/top_rated?language=en-US&page=1`
      );
      if (!r.ok) throw new Error(`getTopRatedTv failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "tv");
}

/**
 * getAiringToday — TV series airing new episodes today.
 * Uses /tv/airing_today.
 */
export async function getAiringToday(): Promise<TMDBTitle[]> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:airing_today"),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(
        `${API}/tv/airing_today?language=en-US&page=1`
      );
      if (!r.ok) throw new Error(`getAiringToday failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "tv");
}

/**
 * getOnTheAir — TV series currently on air (returning shows).
 * Uses /tv/on_the_air.
 */
export async function getOnTheAir(): Promise<TMDBTitle[]> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:on_the_air"),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(
        `${API}/tv/on_the_air?language=en-US&page=1`
      );
      if (!r.ok) throw new Error(`getOnTheAir failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "tv");
}

/**
 * getPopular — popular movies or TV.
 * Uses /movie/popular or /tv/popular.
 */
export async function getPopular(mediaType: "movie" | "tv" = "movie"): Promise<TMDBTitle[]> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:popular", { type: mediaType }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(
        `${API}/${mediaType}/popular?language=en-US&page=1`
      );
      if (!r.ok) throw new Error(`getPopular failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, mediaType);
}

/**
 * getWatchProviders — available streaming providers for a region.
 * Returns provider names (e.g. "Netflix", "Amazon Prime Video").
 * Used to group "Latest on Streaming" by provider.
 *
 * Note: TMDB's /watch/providers/movie endpoint returns the list of
 * providers for a region, but doesn't directly map to "what's new
 * on Netflix". For the streaming section, we use /discover/movie with
 * with_watch_providers parameter — but that requires a specific
 * provider ID. This helper returns the provider list so the UI can
 * pick providers and then fetch titles for each.
 *
 * `displayPriority` mirrors TMDB's `display_priority` field — a 0-based
 * integer where lower = more popular in the region. Callers sort by
 * this to show Netflix/Prime at the top of the list.
 */
export async function getWatchProviderList(region = "IN"): Promise<Array<{ providerId: number; providerName: string; logoPath: string | null; displayPriority: number }>> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:watch_providers_list", { region }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(
        `${API}/watch/providers/movie?language=en-US&watch_region=${region}`
      );
      if (!r.ok) throw new Error(`getWatchProviderList failed: ${r.status}`);
      return r.json();
    }
  );
  return (res.results || []).map((p: { provider_id: number; provider_name: string; logo_path: string | null; display_priority?: number }) => ({
    providerId: p.provider_id,
    providerName: p.provider_name,
    logoPath: p.logo_path,
    displayPriority: p.display_priority ?? 999,
  }));
}

/**
 * discoverMoviesWithProvider — discover movies available on a specific
 * streaming provider in the user's region.
 */
export async function discoverMoviesWithProvider(
  providerId: number,
  region = "IN",
  opts: { sortBy?: string; page?: number } = {}
): Promise<TMDBTitle[]> {
  const params = new URLSearchParams({
    language: "en-US",
    sort_by: opts.sortBy || "popularity.desc",
    "vote_count.gte": "50",
    page: String(opts.page ?? 1),
    include_adult: "false",
    with_watch_providers: String(providerId),
    watch_region: region,
  });

  const res = await cachedFetch(
    buildCacheKey("tmdb:discover/movie_provider", { providerId, region, sort: opts.sortBy ?? "pop" }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(`${API}/discover/movie?${params}`);
      if (!r.ok) throw new Error(`discoverMoviesWithProvider failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "movie");
}

/**
 * discoverTvWithProvider — discover TV series available on a specific
 * streaming provider in the user's region.
 *
 * Mirrors discoverMoviesWithProvider but hits /discover/tv. Used by the
 * OTT section to merge movie + TV results so providers like Prime Video
 * or Netflix never show an empty state when they have TV content but
 * the movie query happened to return nothing.
 */
export async function discoverTvWithProvider(
  providerId: number,
  region = "IN",
  opts: { sortBy?: string; page?: number } = {}
): Promise<TMDBTitle[]> {
  const params = new URLSearchParams({
    language: "en-US",
    sort_by: opts.sortBy || "popularity.desc",
    "vote_count.gte": "50",
    page: String(opts.page ?? 1),
    include_adult: "false",
    with_watch_providers: String(providerId),
    watch_region: region,
  });

  const res = await cachedFetch(
    buildCacheKey("tmdb:discover/tv_provider", { providerId, region, sort: opts.sortBy ?? "pop" }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(`${API}/discover/tv?${params}`);
      if (!r.ok) throw new Error(`discoverTvWithProvider failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "tv");
}

/**
 * getWatchProviderListTv — TV streaming providers for a region.
 *
 * Mirrors getWatchProviderList but hits /watch/providers/tv. The movie
 * and TV provider lists overlap heavily but are NOT identical — some
 * providers appear in only one list. The OTT section merges both lists
 * so a provider like "JioHotstar" that primarily streams TV/movies in
 * India shows up regardless of which TMDB list it appears in.
 *
 * `displayPriority` mirrors TMDB's `display_priority` field (same as
 * the movie endpoint).
 */
export async function getWatchProviderListTv(region = "IN"): Promise<Array<{ providerId: number; providerName: string; logoPath: string | null; displayPriority: number }>> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:watch_providers_list_tv", { region }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithTimeout(
        `${API}/watch/providers/tv?language=en-US&watch_region=${region}`
      );
      if (!r.ok) throw new Error(`getWatchProviderListTv failed: ${r.status}`);
      return r.json();
    }
  );
  return (res.results || []).map((p: { provider_id: number; provider_name: string; logo_path: string | null; display_priority?: number }) => ({
    providerId: p.provider_id,
    providerName: p.provider_name,
    logoPath: p.logo_path,
    displayPriority: p.display_priority ?? 999,
  }));
}
