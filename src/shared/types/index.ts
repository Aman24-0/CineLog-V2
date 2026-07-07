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

/**
 * TMDBEpisode — a single episode's metadata from the /tv/{id}/season/{n}
 * endpoint. This is the richest per-episode data TMDB exposes.
 *
 * Used by the SeasonNavigator in the Details modal to render episode
 * cards with stills, titles, runtimes, air dates, overviews, and
 * vote averages. Episode data is TMDB-sourced (not user-owned) —
 * the user-owned state is which episode the user is currently on,
 * which lives on WatchlistItem.season/episode.
 */
export interface TMDBEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  vote_average: number;
  vote_count: number;
}

/**
 * TMDBSeasonDetails — the response from /tv/{id}/season/{n}.
 * Includes the episode list for that season.
 */
export interface TMDBSeasonDetails {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  episodes: TMDBEpisode[];
  poster_path: string | null;
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

/* ============================================================
   DISCOVER V2 — Phase 2.x
   Lightweight TMDB title type + taste-graph types.
   Discover never mutates Firestore; it only reads TMDB and
   compares against the user's vault. Adding to vault goes
   through the existing useVault flow.
   ============================================================ */

/**
 * TMDBTitle — a normalized, read-only view of a TMDB movie/TV entry
 * used by every Discover surface. It is NOT a WatchlistItem and never
 * gets persisted to Firestore.
 *
 * The shape is intentionally smaller than TMDBDetails (no seasons,
 * no videos, no production_companies) because Discover cards only need
 * poster + backdrop + meta + ratings — full details are fetched on
 * demand by the Details modal when the user opens a title.
 */
export interface TMDBTitle {
  id: number;
  title?: string;
  name?: string;
  media_type: "movie" | "tv";
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  /** Resolved genre names — populated by the discover API layer */
  genres?: string[];
  /** Director or creator — populated for "Because you watched X" surfaces */
  director?: string;
  /** Originating franchise name, when surfaced via the franchise trajectory */
  franchise?: string;
}

/**
 * SpotlightPick — the single title the Spotlight fold features.
 *
 * `reason` is the human-readable "Because you…" sentence shown in the
 * eyebrow. Today it is template-generated by useSpotlight; in the future
 * it can be generated by an LLM without changing this contract.
 */
export interface SpotlightPick {
  title: TMDBTitle;
  reason: string;
  /** Which trajectory strategy produced this pick — for re-roll rotation */
  strategy: SpotlightStrategy;
}

export type SpotlightStrategy =
  | "because-you-watched"
  | "hidden-gems"
  | "continue-franchise"
  | "directors-you-love"
  | "genre-deep-dive"
  | "acclaimed-fallback";

/**
 * Trajectory — an intent-based cluster in Fold 1.
 *
 * Each Trajectory has one `intent` sentence (the human hook) plus a
 * `hero` title and 3 `supporting` titles. Tapping the card expands it
 * inline to reveal up to 6 more `expanded` picks.
 *
 * The `archetype` field is the discriminator for the 4 initial
 * trajectories (Tonight's Pick, Because You Watched, Hidden Gems,
 * Continue the Franchise). Future archetypes can be added to the union
 * without changing the component contract.
 */
export type TrajectoryArchetype =
  | "tonights-pick"
  | "because-you-watched"
  | "hidden-gems"
  | "continue-franchise";

export interface Trajectory {
  archetype: TrajectoryArchetype;
  intent: string;
  /** Short subtitle shown under the intent — e.g. "3 hidden picks" */
  subtitle: string;
  /** Material Symbols icon name for the trajectory */
  icon: string;
  hero: TMDBTitle;
  supporting: TMDBTitle[];
  /** Lazily populated when the user expands the trajectory */
  expanded?: TMDBTitle[];
}

/**
 * TasteSurface — a vault-derived shelf in Fold 2.
 *
 * Each surface is framed as "Because you…" — never as a category.
 * Empty surfaces are filtered out by the hook before they reach the UI.
 */
export type TasteSurfaceKind =
  | "because-you-loved"
  | "continue-franchise"
  | "directors-you-love";

export interface TasteSurface {
  kind: TasteSurfaceKind;
  intent: string;
  subtitle: string;
  icon: string;
  items: TMDBTitle[];
}

/**
 * CosmosCluster — an ambient browse node in Fold 3.
 *
 * The Cosmos is intentionally experimental and reframes TMDB categories
 * as "the wider universe around your taste". Each cluster has a theme
 * and a set of nodes; tapping a node expands it into a focused rail.
 *
 * The `theme` field is free-form so future versions can swap in
 * LLM-generated themes without changing the contract.
 */
export interface CosmosCluster {
  id: string;
  theme: string;
  /** Material Symbols icon name */
  icon: string;
  /** Short narrative hook — e.g. "Quiet sci-fi that lingers" */
  hook: string;
  items: TMDBTitle[];
}

/**
 * TasteProfile — the architectural seam for future AI recommendations.
 *
 * Today this is derived locally from the vault by useDiscoverTaste.
 * Tomorrow it can be sourced from a server ML model or an LLM — the UI
 * does not care, because every Discover hook consumes this shape rather
 * than the vault directly. This is the single most important contract
 * in the Discover feature.
 */
export interface TasteProfile {
  topGenres: string[];
  topDirectors: { name: string; count: number; avgRating: number }[];
  activeFranchises: { name: string; owned: number; missing: number }[];
  avgImdb: number;
  /** Most recent 9+ rated completed title — the "More like X" anchor */
  seedTitle: WatchlistItem | null;
  /** True when the user has no vault signal at all (guest or empty) */
  isColdStart: boolean;
}
