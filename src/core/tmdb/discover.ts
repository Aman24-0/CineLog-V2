// src/core/tmdb/discover.ts
import { TMDB_KEY } from "./tmdb";
import type { TMDBTitle } from "~/shared/types";

/**
 * Discover API — the read-only TMDB layer for Discover V2.
 *
 * Every function returns normalized `TMDBTitle[]`. Discover never mutates
 * Firestore; adding to vault goes through the existing useVault flow.
 *
 * All endpoints are server-safe (plain fetch, no client-only APIs).
 * The TMDB genre map is inlined so we don't need a separate fetch to
 * resolve `genre_ids` to names.
 */

const API = "https://api.themoviedb.org/3";

/* ------------------------------------------------------------------
   TMDB genre maps (movie + tv). Inlined so discover cards can render
   genre names without a second round-trip.
   ------------------------------------------------------------------ */
const MOVIE_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western"
};
const TV_GENRES: Record<number, string> = {
  10759: "Action & Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  10762: "Kids", 9648: "Mystery", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk",
  10768: "War & Politics", 37: "Western"
};

const resolveGenres = (ids: number[] | undefined, mediaType: "movie" | "tv"): string[] => {
  if (!ids || ids.length === 0) return [];
  const map = mediaType === "tv" ? TV_GENRES : MOVIE_GENRES;
  return ids.map((id) => map[id]).filter(Boolean);
};

/* ------------------------------------------------------------------
   Normalization — TMDB returns slightly different shapes for movie
   vs tv and for /discover vs /trending vs /recommendations. This
   single function unifies them into TMDBTitle.
   ------------------------------------------------------------------ */
interface TMDBRawItem {
  id: number;
  title?: string;
  name?: string;
  media_type?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
}

const normalize = (raw: TMDBRawItem, fallbackMediaType?: "movie" | "tv"): TMDBTitle | null => {
  if (!raw || !raw.id) return null;
  // trending endpoints return media_type on every item; /discover/movie doesn't
  const mediaType = (raw.media_type as "movie" | "tv") || fallbackMediaType || "movie";
  if (mediaType !== "movie" && mediaType !== "tv") return null;
  return {
    id: raw.id,
    title: raw.title,
    name: raw.name,
    media_type: mediaType,
    poster_path: raw.poster_path ?? null,
    backdrop_path: raw.backdrop_path ?? null,
    overview: raw.overview,
    release_date: raw.release_date,
    first_air_date: raw.first_air_date,
    vote_average: raw.vote_average,
    vote_count: raw.vote_count,
    genre_ids: raw.genre_ids,
    genres: resolveGenres(raw.genre_ids, mediaType)
  };
};

const normalizeList = (items: TMDBRawItem[] | undefined, fallbackMediaType?: "movie" | "tv"): TMDBTitle[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => normalize(i, fallbackMediaType))
    .filter((t): t is TMDBTitle => t !== null);
};

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

  const res = await fetch(`${API}/discover/movie?${params}`);
  if (!res.ok) throw new Error(`discoverMovies failed: ${res.status}`);
  const json = await res.json();
  return normalizeList(json.results, "movie");
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

  const res = await fetch(`${API}/discover/tv?${params}`);
  if (!res.ok) throw new Error(`discoverTv failed: ${res.status}`);
  const json = await res.json();
  return normalizeList(json.results, "tv");
}

/**
 * recommendations — "More like X". TMDB returns movie and tv recs from
 * different endpoints; this calls both based on mediaType.
 */
export async function getRecommendations(
  mediaType: "movie" | "tv",
  id: number | string
): Promise<TMDBTitle[]> {
  const res = await fetch(
    `${API}/${mediaType}/${id}/recommendations?api_key=${TMDB_KEY}&language=en-US&page=1`
  );
  if (!res.ok) throw new Error(`getRecommendations failed: ${res.status}`);
  const json = await res.json();
  return normalizeList(json.results, mediaType);
}

/**
 * trending — used by the Cosmos fold and the guest Spotlight fallback.
 * window="week" matches the user's mental model of "what's current".
 */
export async function getTrending(
  mediaType: "movie" | "tv" | "all" = "all",
  window: "day" | "week" = "week"
): Promise<TMDBTitle[]> {
  const res = await fetch(
    `${API}/trending/${mediaType}/${window}?api_key=${TMDB_KEY}&language=en-US`
  );
  if (!res.ok) throw new Error(`getTrending failed: ${res.status}`);
  const json = await res.json();
  return normalizeList(json.results);
}

/**
 * topRated — used for the guest Spotlight fallback pool and for one
 * Cosmos cluster ("Universally Acclaimed"). Page 1 of TMDB's
 * /movie/top_rated, language=en-US.
 */
export async function getTopRatedMovies(): Promise<TMDBTitle[]> {
  const res = await fetch(
    `${API}/movie/top_rated?api_key=${TMDB_KEY}&language=en-US&page=1`
  );
  if (!res.ok) throw new Error(`getTopRatedMovies failed: ${res.status}`);
  const json = await res.json();
  return normalizeList(json.results, "movie");
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
  const res = await fetch(`${API}/search/multi?${params}`);
  if (!res.ok) throw new Error(`searchMulti failed: ${res.status}`);
  const json = await res.json();
  // search/multi returns person results too — filter those out
  return normalizeList(
    (json.results || []).filter((r: TMDBRawItem) => r.media_type === "movie" || r.media_type === "tv")
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

/** Genre ID helpers — callers pass genre names, we resolve to IDs. */
export const GENRE_ID = {
  movie: MOVIE_GENRES,
  tv: TV_GENRES
} as const;

/** Reverse lookup: genre name → ID, for the user's preferred media type. */
export function genreIdFor(name: string, mediaType: "movie" | "tv"): number | undefined {
  const map = mediaType === "tv" ? TV_GENRES : MOVIE_GENRES;
  for (const [id, n] of Object.entries(map)) {
    if (n.toLowerCase() === name.toLowerCase()) return Number(id);
  }
  // Common-name fallbacks so "Sci-Fi" resolves even if the user stored "Science Fiction"
  const aliases: Record<string, string> = {
    "sci-fi": "Sci-Fi",
    "science fiction": "Sci-Fi",
    "scifi": "Sci-Fi",
    "action & adventure": "Action & Adventure"
  };
  const alias = aliases[name.toLowerCase()];
  if (alias) {
    for (const [id, n] of Object.entries(map)) {
      if (n === alias) return Number(id);
    }
  }
  return undefined;
}
