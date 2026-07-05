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
  tag?: string;
  seasonDates?: Record<string, { start: string; end: string }>;
  franchises?: Record<string, number>;
  watchProgress?: WatchProgress;
  addedAt?: { seconds: number; nanoseconds: number } | string | Date;
  imdbRating?: string;
  rtRating?: string;
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
