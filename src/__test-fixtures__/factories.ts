// src/__test-fixtures__/factories.ts
//
// Factory functions for creating test fixtures.
// Centralized so every test file uses the same base shapes — only the
// fields relevant to the test need to be overridden.

import type {
  WatchlistItem,
  TMDBTitle,
  CollectionEntry,
  Collection,
  VaultFilters,
  FilterPreset,
  CachedSeasonInfo
} from "~/shared/types";

export function makeWatchlistItem(
  overrides: Partial<WatchlistItem> = {}
): WatchlistItem {
  return {
    id: "1",
    title: "Test Movie",
    media_type: "movie",
    status: "Planned",
    ...overrides
  };
}

export function makeMovie(
  overrides: Partial<WatchlistItem> = {}
): WatchlistItem {
  return makeWatchlistItem({
    media_type: "movie",
    title: "Test Movie",
    release_date: "2023-01-15",
    runtime: 120,
    ...overrides
  });
}

export function makeTVSeries(
  overrides: Partial<WatchlistItem> = {}
): WatchlistItem {
  return makeWatchlistItem({
    media_type: "tv",
    name: "Test Series",
    first_air_date: "2023-01-15",
    status: "Watching",
    season: 1,
    episode: 1,
    ...overrides
  });
}

export function makeTMDBTitle(overrides: Partial<TMDBTitle> = {}): TMDBTitle {
  return {
    id: 1,
    title: "Test Movie",
    media_type: "movie",
    poster_path: "/abc.jpg",
    backdrop_path: "/def.jpg",
    release_date: "2023-01-15",
    vote_average: 8.0,
    vote_count: 1000,
    genre_ids: [28, 35],
    genres: ["Action", "Comedy"],
    ...overrides
  };
}

export function makeCollectionEntry(
  overrides: Partial<CollectionEntry> = {}
): CollectionEntry {
  return {
    id: "1",
    media_type: "movie",
    title: "Test Entry",
    release_date: "2023-01-15",
    order: 0,
    ...overrides
  };
}

export function makeCollection(
  overrides: Partial<Collection> = {}
): Collection {
  return {
    id: "test-collection",
    name: "Test Collection",
    type: "user",
    entries: [],
    ...overrides
  };
}

export function makeVaultFilters(
  overrides: Partial<VaultFilters> = {}
): VaultFilters {
  return {
    type: "all",
    status: "all",
    language: "all",
    genre: "all",
    platform: "all",
    // v2.6 — sort was split into sortField + sortDirection.
    // Defaults match the previous `sort: "recent"` behavior:
    // recently-added (added_date) descending (newest first).
    sortField: "added_date",
    sortDirection: "desc",
    tag: "all",
    imdbMin: "",
    imdbMax: "",
    rtMin: "",
    rtMax: "",
    yearMin: "",
    yearMax: "",
    runtimeMin: "",
    runtimeMax: "",
    ...overrides
  };
}

export function makeFilterPreset(
  overrides: Partial<FilterPreset> = {}
): FilterPreset {
  return {
    id: "preset-1",
    name: "Test Preset",
    filters: makeVaultFilters(),
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides
  };
}

export function makeSeasons(
  seasons: Array<{ number: number; count: number }>
): CachedSeasonInfo[] {
  return seasons.map((s) => ({ ...s }));
}
