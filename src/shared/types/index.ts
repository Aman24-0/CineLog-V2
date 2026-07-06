// src/shared/types/index.ts
export interface WatchProgress {
  currentTime: number;
  duration: number;
  server?: string | null;
  updatedAt?: string;
  season?: number;
  episode?: number;
}

/**
 * CachedSeasonInfo — per-season episode count, cached on the WatchlistItem
 * when the user opens the Details page or updates their episode tracker.
 *
 * This cache lets the shared progress engine compute SERIES-WIDE progress
 * (sum across all seasons) WITHOUT requiring every dashboard card to fetch
 * TMDB details. The Details modal writes this cache via `updateSeasons()`
 * whenever `props.details.seasons` is available.
 *
 * Only `season_number > 0` entries are stored (specials / season 0 excluded).
 */
export interface CachedSeasonInfo {
  number: number;   // season_number (1-indexed, excludes 0 = specials)
  count: number;    // episode_count for this season
}

export interface WatchlistItem {
  id: string;
  title?: string;
  name?: string;
  original_title?: string;     // original/native title (e.g. foreign-language films)
  original_name?: string;      // original series title
  media_type: "movie" | "tv";
  poster_path?: string | null;
  backdrop_path?: string | null;
  status: "Planned" | "Watching" | "Completed" | "Plan to Watch";
  rating?: number;
  watchDate?: string;
  notes?: string;
  region?: string;
  season?: number;
  episode?: number;
  totalEps?: number;           // legacy: per-season or per-series episode count (ambiguous — prefer `seasons`)
  /**
   * Cached season structure for TV series. Written by the Details modal
   * whenever TMDB details are fetched. Consumed by the shared progress
   * engine to compute series-wide completion percentage.
   *
   * Migration: items added before this field existed will not have it.
   * The progress engine falls back to `totalEps` (treated as season 1
   * count) when `seasons` is missing — see `getEpisodeProgress()`.
   */
  seasons?: CachedSeasonInfo[];
  runtime?: number;
  genresList?: string[];
  platformsList?: string[];
  castList?: string[];
  director?: string;          // e.g. "Christopher Nolan" (searchable)
  tag?: string;
  seasonDates?: Record<string, { start: string; end: string }>;
  franchises?: Record<string, number>;
  watchProgress?: WatchProgress;
  addedAt?: { seconds: number; nanoseconds: number } | string | Date;
  updatedAt?: string;
  imdbRating?: string;
  rtRating?: string;
  tmdbRating?: string;
  release_date?: string;
  first_air_date?: string;
  newSeasonAvailable?: boolean;
  directPlayUrl?: string;
}

export interface User {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

export interface VaultFilters {
  type: string;
  status: string;
  region: string;
  genre: string;
  platform: string;
  sort: string;
  tag: string;
  imdbMin: string;
  imdbMax: string;
  rtMin: string;
  rtMax: string;
  yearMin: string;
  yearMax: string;
  runtimeMin: string;
  runtimeMax: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: VaultFilters;
  createdAt?: any;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBSeason {
  id: number;
  season_number: number;
  episode_count: number;
  name: string;
}

export interface TMDBVideo {
  id: string;
  key: string;
  name: string;
  site: string; // "YouTube" | "Vimeo" | ...
  type: string; // "Trailer" | "Teaser" | "Clip" | ...
  official?: boolean;
  published_at?: string;
}

export interface TMDBProductionCompany {
  id: number;
  name: string;
  logo_path?: string | null;
  origin_country?: string;
}

export interface TMDBNetwork {
  id: number;
  name: string;
  logo_path?: string | null;
  origin_country?: string;
}

export interface TMDBSpokenLanguage {
  english_name: string;
  iso_639_1: string;
  name: string;
}

export interface TMDBDetails {
  id: number;
  title?: string;
  name?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  tagline?: string;
  homepage?: string;
  genres?: TMDBGenre[];
  seasons?: TMDBSeason[];
  media_type?: "movie" | "tv";
  status?: string;                    // "Released" | "Ended" | "Returning Series" | etc.
  // Movie-specific
  production_companies?: TMDBProductionCompany[];
  production_countries?: { iso_3166_1: string; name: string }[];
  spoken_languages?: TMDBSpokenLanguage[];
  imdb_id?: string;
  budget?: number;
  revenue?: number;
  // TV-specific
  number_of_seasons?: number;
  number_of_episodes?: number;
  networks?: TMDBNetwork[];
  origin_country?: string[];
  original_name?: string;
  original_title?: string;
  in_production?: boolean;
  last_air_date?: string;
  // Populated when fetchTmdbDetails requests append=response=videos
  videos?: {
    results?: TMDBVideo[];
  };
}

export interface OMDbRatings {
  imdb?: string;
  rt?: string;
  // Extra fields available from OMDb for richer metadata
  director?: string;
  actors?: string;
  writer?: string;
  plot?: string;
  rated?: string;
  year?: string;
  runtime?: string;
}
