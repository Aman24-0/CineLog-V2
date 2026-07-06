// src/shared/types/index.ts
export interface WatchProgress {
  currentTime: number;
  duration: number;
  server?: string | null;
  updatedAt?: string;
  season?: number;
  episode?: number;
}

export interface WatchlistItem {
  id: string;
  title?: string;
  name?: string;
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
  totalEps?: number;
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
