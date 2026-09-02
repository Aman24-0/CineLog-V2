// src/core/tmdb/discover.ts
import type { TMDBTitle } from "~/shared/types";
import { cachedFetch, buildCacheKey, TMDB_TTL } from "~/shared/utils/apiCache";
import { GENRE_ID, genreIdFor } from "./genres";
import { normalizeList, type TMDBRawItem } from "./discoverNormalize";
import { fetchWithRetry } from "./fetchHelpers";

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
 *
 * Network resilience: every endpoint goes through `fetchWithRetry`
 * (10-second timeout + single retry on 5xx / network error) AND
 * `cachedFetch` (in-memory cache with 10-min TTL + in-flight dedup so
 * concurrent identical requests share a single Promise).
 */

// All TMDB API calls now go through the server-side proxy at /api/media/*
// which injects the API key from TMDB_API_KEY (server-only env var).
// This fixes ISP/DNS blocking in certain regions and keeps the key hidden.
const API = "/api/media";

/* ------------------------------------------------------------------
   Endpoint wrappers. Each returns TMDBTitle[] (already normalized).
   ------------------------------------------------------------------ */

/** discover/movie — the workhorse for "Because you watched", "Hidden gems", etc. */
export async function discoverMovies(opts: {
  withGenres?: number[]; // genre IDs
  withoutGenres?: number[];
  sortBy?: string; // e.g. "vote_average.desc", "popularity.asc"
  voteCountGte?: number;
  voteCountLte?: number; // upper bound on vote_count (e.g. for "hidden gems" / "weekend picks")
  voteAverageGte?: number;
  primaryReleaseDateGte?: string; // YYYY-MM-DD
  primaryReleaseDateLte?: string;
  page?: number;
  withRuntimeGte?: number;
  withRuntimeLte?: number;
  withKeywords?: number;
  /**
   * Region filter (ISO 3166-1 code, e.g. "US", "IN"). When set, TMDB
   * only returns movies that have a theatrical release date in that
   * region. Critical for the Upcoming page — without it, the global
   * release pool dilutes regionally-relevant titles.
   */
  region?: string;
}): Promise<TMDBTitle[]> {
  const params = new URLSearchParams({
    language: "en-US",
    sort_by: opts.sortBy || "popularity.desc",
    page: String(opts.page ?? 1),
    include_adult: "false"
  });
  // vote_count.gte — ONLY set if explicitly provided.
  // The historical default of 100 is correct for "popular" Discover
  // surfaces (where you want established titles), but it BREAKS the
  // Upcoming page because future releases have 0 votes. Upcoming callers
  // pass `voteCountGte: 0` (or omit it) to get every scheduled release.
  if (opts.voteCountGte != null) {
    params.set("vote_count.gte", String(opts.voteCountGte));
  }
  if (opts.withGenres?.length)
    params.set("with_genres", opts.withGenres.join(","));
  if (opts.withoutGenres?.length)
    params.set("without_genres", opts.withoutGenres.join(","));
  if (opts.voteAverageGte != null)
    params.set("vote_average.gte", String(opts.voteAverageGte));
  if (opts.voteCountLte != null)
    params.set("vote_count.lte", String(opts.voteCountLte));
  if (opts.primaryReleaseDateGte)
    params.set("primary_release_date.gte", opts.primaryReleaseDateGte);
  if (opts.primaryReleaseDateLte)
    params.set("primary_release_date.lte", opts.primaryReleaseDateLte);
  if (opts.withRuntimeGte != null)
    params.set("with_runtime.gte", String(opts.withRuntimeGte));
  if (opts.withRuntimeLte != null)
    params.set("with_runtime.lte", String(opts.withRuntimeLte));
  if (opts.withKeywords != null)
    params.set("with_keywords", String(opts.withKeywords));
  if (opts.region) params.set("region", opts.region);

  const res = await cachedFetch(
    buildCacheKey("tmdb:discover/movie", { q: params.toString() }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithRetry(`${API}/discover/movie?${params}`);
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
  firstAirDateLte?: string;
  page?: number;
  /**
   * Region filter (ISO 3166-1 code, e.g. "US", "IN"). TMDB /discover/tv
   * does not officially support a `region` param (only `with_origin_country`
   * and `with_watch_providers`+`watch_region`), but we accept the field
   * here for symmetry with discoverMovies and translate it to
   * `with_origin_country` when set. This gives the Upcoming page a
   * reasonable region-scoped TV result without requiring callers to know
   * the API quirk.
   */
  region?: string;
}): Promise<TMDBTitle[]> {
  const params = new URLSearchParams({
    language: "en-US",
    sort_by: opts.sortBy || "popularity.desc",
    page: String(opts.page ?? 1)
  });
  // vote_count.gte — only set if explicitly provided (same reasoning as
  // discoverMovies: upcoming series typically have 0 votes pre-air).
  if (opts.voteCountGte != null) {
    params.set("vote_count.gte", String(opts.voteCountGte));
  }
  if (opts.withGenres?.length)
    params.set("with_genres", opts.withGenres.join(","));
  if (opts.withoutGenres?.length)
    params.set("without_genres", opts.withoutGenres.join(","));
  if (opts.voteAverageGte != null)
    params.set("vote_average.gte", String(opts.voteAverageGte));
  if (opts.firstAirDateGte)
    params.set("first_air_date.gte", opts.firstAirDateGte);
  if (opts.firstAirDateLte)
    params.set("first_air_date.lte", opts.firstAirDateLte);
  if (opts.region) params.set("with_origin_country", opts.region);

  const res = await cachedFetch(
    buildCacheKey("tmdb:discover/tv", { q: params.toString() }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithRetry(`${API}/discover/tv?${params}`);
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
      const r = await fetchWithRetry(
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
      const r = await fetchWithRetry(
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
      const r = await fetchWithRetry(
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
      const r = await fetchWithRetry(`${API}/search/multi?${params}`);
      if (!r.ok) throw new Error(`searchMulti failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(
    (res.results || []).filter(
      (r: TMDBRawItem) => r.media_type === "movie" || r.media_type === "tv"
    )
  );
}

/**
 * searchPeople — Phase 6.2 Task 4b
 *
 * Calls TMDB /search/person to find people (actors, directors, etc.)
 * matching the query. Returns TMDBPerson[] with the fields needed by
 * the SearchResults People section: id, name, profile_path.
 *
 * This is a SEPARATE call from searchMulti (which filters people out)
 * so we don't change searchMulti's contract for the other 3 callers
 * (animeCarousels, TmdbSearchModal, collectionFetcher).
 *
 * The call is cached via cachedFetch with the same TMDB_TTL as
 * searchMulti so repeat searches are instant.
 *
 * @param query  The search string (min 2 chars to match useSearch's gate).
 * @param limit  Max results to return (default 8). TMDB returns 20 per
 *                page; we slice to keep the UI manageable.
 */
export async function searchPeople(
  query: string,
  limit = 8
): Promise<import("~/shared/types").TMDBPerson[]> {
  if (!query || query.trim().length < 2) return [];
  const params = new URLSearchParams({
    language: "en-US",
    query,
    page: "1",
    include_adult: "false"
  });
  const res = await cachedFetch(
    buildCacheKey("tmdb:search/person", { q: query }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithRetry(`${API}/search/person?${params}`);
      if (!r.ok) throw new Error(`searchPeople failed: ${r.status}`);
      return r.json();
    }
  );
  const results: Array<{
    id: number;
    name?: string;
    profile_path?: string | null;
    known_for_department?: string;
    gender?: number;
    popularity?: number;
  }> = (res.results || []).filter((r: { id?: number }) => typeof r.id === "number");
  return results.slice(0, limit).map((p) => ({
    id: p.id,
    name: p.name ?? "Unknown",
    profile_path: p.profile_path ?? null,
    known_for_department: p.known_for_department,
    gender: p.gender,
    // biography / birthday / etc. are NOT returned by /search/person —
    // they're fetched on-demand by PersonModal via fetchPersonDetails.
    // We leave them undefined so the type contract is honest.
  }));
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
  const res = await fetchWithRetry(
    `${API}/${mediaType}/${id}/credits?language=en-US`
  );
  if (!res.ok) return undefined;
  const json = await res.json();
  const crew: Array<{ job: string; name: string; department?: string }> =
    json.crew || [];
  // Movies: look for "Director". TV: look for "Creator" (sometimes "Executive Producer").
  if (mediaType === "movie") {
    const dir = crew.find((c) => c.job === "Director");
    return dir?.name;
  }
  const creator =
    crew.find((c) => c.job === "Creator") ||
    crew.find(
      (c) => c.job === "Executive Producer" && c.department === "Production"
    );
  return creator?.name;
}

// ---------------------------------------------------------------------------
// Discover V2 endpoints — now_playing, upcoming, watch providers, top TV
// ---------------------------------------------------------------------------

/**
 * getNowPlaying — movies currently in theatres.
 * Uses /movie/now_playing with region parameter for localization.
 * Returns only page 1 (first ~20 titles). For pagination, use
 * getNowPlayingPage instead.
 */
export async function getNowPlaying(region = "IN"): Promise<TMDBTitle[]> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:now_playing", { region }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithRetry(
        `${API}/movie/now_playing?language=en-US&region=${region}&page=1`
      );
      if (!r.ok) throw new Error(`getNowPlaying failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "movie");
}

/**
 * getNowPlayingPage — paginated now-playing movies for the full theatre
 * page. Returns page metadata (page, totalPages, totalResults) alongside
 * the titles so the caller can render "20 of 87 movies" and know when
 * to stop loading.
 *
 * Cache key includes BOTH region AND page so different pages are cached
 * independently: `tmdb:now_playing:{region}:{page}`.
 */
export async function getNowPlayingPage(
  region: string,
  page: number
): Promise<{
  titles: TMDBTitle[];
  page: number;
  totalPages: number;
  totalResults: number;
}> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:now_playing", { region, page }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithRetry(
        `${API}/movie/now_playing?language=en-US&region=${region}&page=${page}`
      );
      if (!r.ok) throw new Error(`getNowPlayingPage failed: ${r.status}`);
      return r.json();
    }
  );
  return {
    titles: normalizeList(res.results, "movie"),
    page: res.page ?? page,
    totalPages: res.total_pages ?? 1,
    totalResults: res.total_results ?? 0
  };
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
      const r = await fetchWithRetry(
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
      const r = await fetchWithRetry(
        `${API}/tv/top_rated?language=en-US&page=1`
      );
      if (!r.ok) throw new Error(`getTopRatedTv failed: ${r.status}`);
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
      const r = await fetchWithRetry(
        `${API}/tv/on_the_air?language=en-US&page=1`
      );
      if (!r.ok) throw new Error(`getOnTheAir failed: ${r.status}`);
      return r.json();
    }
  );
  return normalizeList(res.results, "tv");
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
export async function getWatchProviderList(
  region = "IN"
): Promise<
  Array<{
    providerId: number;
    providerName: string;
    logoPath: string | null;
    displayPriority: number;
  }>
> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:watch_providers_list", { region }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithRetry(
        `${API}/watch/providers/movie?language=en-US&watch_region=${region}`
      );
      if (!r.ok) throw new Error(`getWatchProviderList failed: ${r.status}`);
      return r.json();
    }
  );
  return (res.results || []).map(
    (p: {
      provider_id: number;
      provider_name: string;
      logo_path: string | null;
      display_priority?: number;
    }) => ({
      providerId: p.provider_id,
      providerName: p.provider_name,
      logoPath: p.logo_path,
      displayPriority: p.display_priority ?? 999
    })
  );
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
    watch_region: region
  });

  const res = await cachedFetch(
    buildCacheKey("tmdb:discover/movie_provider", {
      providerId,
      region,
      sort: opts.sortBy ?? "pop"
    }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithRetry(`${API}/discover/movie?${params}`);
      if (!r.ok)
        throw new Error(`discoverMoviesWithProvider failed: ${r.status}`);
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
    watch_region: region
  });

  const res = await cachedFetch(
    buildCacheKey("tmdb:discover/tv_provider", {
      providerId,
      region,
      sort: opts.sortBy ?? "pop"
    }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithRetry(`${API}/discover/tv?${params}`);
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
export async function getWatchProviderListTv(
  region = "IN"
): Promise<
  Array<{
    providerId: number;
    providerName: string;
    logoPath: string | null;
    displayPriority: number;
  }>
> {
  const res = await cachedFetch(
    buildCacheKey("tmdb:watch_providers_list_tv", { region }),
    TMDB_TTL,
    async () => {
      const r = await fetchWithRetry(
        `${API}/watch/providers/tv?language=en-US&watch_region=${region}`
      );
      if (!r.ok) throw new Error(`getWatchProviderListTv failed: ${r.status}`);
      return r.json();
    }
  );
  return (res.results || []).map(
    (p: {
      provider_id: number;
      provider_name: string;
      logo_path: string | null;
      display_priority?: number;
    }) => ({
      providerId: p.provider_id,
      providerName: p.provider_name,
      logoPath: p.logo_path,
      displayPriority: p.display_priority ?? 999
    })
  );
}
