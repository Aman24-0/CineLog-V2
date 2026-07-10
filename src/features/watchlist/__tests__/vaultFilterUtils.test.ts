// src/features/watchlist/__tests__/vaultFilterUtils.test.ts
import { describe, it, expect } from "vitest";
import {
  matchSearch,
  filterByStatus,
  filterByAdvanced,
  filterByRanges,
  sortItems,
  computeChips,
  countActiveFilters,
  hasAdvancedFiltersActive,
} from "../vaultFilterUtils";
import {
  makeMovie,
  makeTVSeries,
  makeVaultFilters,
} from "~/__test-fixtures__/factories";
import type { VaultFilters, WatchlistItem } from "~/shared/types";

describe("matchSearch", () => {
  it("matches by title (case-insensitive)", () => {
    const item = makeMovie({ title: "Inception" });
    expect(matchSearch(item, "incep")).toBe(true);
    expect(matchSearch(item, "INCEPTION")).toBe(true);
  });

  it("matches by name", () => {
    const item = makeTVSeries({ name: "Breaking Bad" });
    expect(matchSearch(item, "breaking")).toBe(true);
  });

  it("matches by tag", () => {
    const item = makeMovie({ title: "X", tag: "favorite" });
    expect(matchSearch(item, "favorite")).toBe(true);
  });

  it("matches by notes", () => {
    const item = makeMovie({ title: "X", notes: "best movie ever" });
    expect(matchSearch(item, "best")).toBe(true);
  });

  it("matches by director", () => {
    const item = makeMovie({ title: "X", director: "Nolan" });
    expect(matchSearch(item, "nolan")).toBe(true);
  });

  it("matches by year (release_date)", () => {
    const item = makeMovie({ title: "X", release_date: "2023-06-15" });
    expect(matchSearch(item, "2023")).toBe(true);
  });

  it("matches by cast list", () => {
    const item = makeMovie({ title: "X", castList: ["Leonardo DiCaprio"] });
    expect(matchSearch(item, "dicaprio")).toBe(true);
  });

  it("matches by genres list", () => {
    const item = makeMovie({ title: "X", genresList: ["Sci-Fi", "Action"] });
    expect(matchSearch(item, "sci-fi")).toBe(true);
  });

  it("matches by platforms list", () => {
    const item = makeMovie({ title: "X", platformsList: ["Netflix"] });
    expect(matchSearch(item, "netflix")).toBe(true);
  });

  it("returns false when no match", () => {
    const item = makeMovie({ title: "Inception" });
    expect(matchSearch(item, "matrix")).toBe(false);
  });

  it("handles empty query (matches everything)", () => {
    const item = makeMovie({ title: "Inception" });
    expect(matchSearch(item, "")).toBe(true);
  });

  it("trims whitespace in query", () => {
    const item = makeMovie({ title: "Inception" });
    expect(matchSearch(item, "  inception  ")).toBe(true);
  });
});

describe("filterByStatus", () => {
  const items = [
    makeMovie({ id: "1", status: "Watching" }),
    makeMovie({ id: "2", status: "Planned" }),
    makeMovie({ id: "3", status: "Completed" }),
    makeMovie({ id: "4", status: "Plan to Watch" }),
  ];

  it("returns all items for 'all'", () => {
    expect(filterByStatus(items, "all")).toHaveLength(4);
  });

  it("filters to Watching only for 'in-progress'", () => {
    const result = filterByStatus(items, "in-progress");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters to status === 'Watching'", () => {
    const result = filterByStatus(items, "Watching");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters to status === 'Planned' (includes 'Plan to Watch')", () => {
    const result = filterByStatus(items, "Planned");
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id).sort()).toEqual(["2", "4"]);
  });

  it("filters to status === 'Completed'", () => {
    const result = filterByStatus(items, "Completed");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });
});

describe("filterByAdvanced", () => {
  const items = [
    makeMovie({ id: "1", media_type: "movie", region: "Indian", genresList: ["Drama"], platformsList: ["Netflix"], tag: "fav" }),
    makeTVSeries({ id: "2", media_type: "tv", region: "International", genresList: ["Sci-Fi"], platformsList: ["Prime"], tag: "watchlist" }),
  ];

  it("returns all when all filters are 'all'", () => {
    const result = filterByAdvanced(items, makeVaultFilters());
    expect(result).toHaveLength(2);
  });

  it("filters by type", () => {
    const result = filterByAdvanced(items, makeVaultFilters({ type: "movie" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters by region", () => {
    const result = filterByAdvanced(items, makeVaultFilters({ region: "Indian" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("defaults missing region to 'International'", () => {
    const items2 = [makeMovie({ id: "3", region: undefined })];
    const result = filterByAdvanced(items2, makeVaultFilters({ region: "International" }));
    expect(result).toHaveLength(1);
  });

  it("filters by genre", () => {
    const result = filterByAdvanced(items, makeVaultFilters({ genre: "Sci-Fi" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("filters by platform", () => {
    const result = filterByAdvanced(items, makeVaultFilters({ platform: "Netflix" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters by tag", () => {
    const result = filterByAdvanced(items, makeVaultFilters({ tag: "fav" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });
});

describe("filterByRanges", () => {
  const items = [
    makeMovie({ id: "1", imdbRating: "8.5", rtRating: "90%", release_date: "2023-06-15", runtime: 120 }),
    makeMovie({ id: "2", imdbRating: "6.0", rtRating: "40%", release_date: "2010-01-01", runtime: 90 }),
  ];

  it("returns all when no range filters set", () => {
    expect(filterByRanges(items, makeVaultFilters())).toHaveLength(2);
  });

  it("filters by imdbMin", () => {
    const result = filterByRanges(items, makeVaultFilters({ imdbMin: "7.0" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters by imdbMax", () => {
    const result = filterByRanges(items, makeVaultFilters({ imdbMax: "7.0" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("filters by rtMin (strips %)", () => {
    const result = filterByRanges(items, makeVaultFilters({ rtMin: "80" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters by yearMin", () => {
    const result = filterByRanges(items, makeVaultFilters({ yearMin: "2020" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters by yearMax", () => {
    const result = filterByRanges(items, makeVaultFilters({ yearMax: "2015" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("filters by runtimeMin", () => {
    const result = filterByRanges(items, makeVaultFilters({ runtimeMin: "100" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters by runtimeMax", () => {
    const result = filterByRanges(items, makeVaultFilters({ runtimeMax: "100" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("combines multiple range filters (AND logic)", () => {
    const result = filterByRanges(
      items,
      makeVaultFilters({ imdbMin: "7.0", yearMin: "2020" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });
});

describe("sortItems", () => {
  const items: WatchlistItem[] = [
    makeMovie({ id: "1", title: "Zebra", release_date: "2023-01-01", rating: 5, imdbRating: "6.0", runtime: 120, addedAt: "2024-01-01T00:00:00Z" }),
    makeMovie({ id: "2", title: "Alpha", release_date: "2020-01-01", rating: 9, imdbRating: "9.0", runtime: 90, addedAt: "2024-06-01T00:00:00Z" }),
    makeMovie({ id: "3", title: "Mike", release_date: "2021-01-01", rating: 7, imdbRating: "7.5", runtime: 60, addedAt: "2024-03-01T00:00:00Z" }),
  ];

  it("sorts by recent (addedAt desc) by default", () => {
    const result = sortItems([...items], "recent");
    expect(result.map((m) => m.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by year_desc", () => {
    const result = sortItems([...items], "year_desc");
    expect(result.map((m) => m.id)).toEqual(["1", "3", "2"]);
  });

  it("sorts by rating_desc", () => {
    const result = sortItems([...items], "rating_desc");
    expect(result.map((m) => m.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by imdb_desc", () => {
    const result = sortItems([...items], "imdb_desc");
    expect(result.map((m) => m.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by imdb_asc", () => {
    const result = sortItems([...items], "imdb_asc");
    expect(result.map((m) => m.id)).toEqual(["1", "3", "2"]);
  });

  it("sorts by runtime_asc", () => {
    const result = sortItems([...items], "runtime_asc");
    expect(result.map((m) => m.id)).toEqual(["3", "2", "1"]);
  });

  it("sorts by title_asc", () => {
    const result = sortItems([...items], "title_asc");
    expect(result.map((m) => m.id)).toEqual(["2", "3", "1"]); // Alpha, Mike, Zebra
  });

  it("sorts by updated (updatedAt desc)", () => {
    const items2 = [
      makeMovie({ id: "1", updatedAt: "2024-01-01T00:00:00Z" }),
      makeMovie({ id: "2", updatedAt: "2024-06-01T00:00:00Z" }),
    ];
    const result = sortItems(items2, "updated");
    expect(result.map((m) => m.id)).toEqual(["2", "1"]);
  });

  it("sorts by watch_desc (watchDate desc)", () => {
    const items2 = [
      makeMovie({ id: "1", watchDate: "2024-01-01" }),
      makeMovie({ id: "2", watchDate: "2024-06-01" }),
      makeMovie({ id: "3" }), // no date
    ];
    const result = sortItems(items2, "watch_desc");
    expect(result[0].id).toBe("2"); // most recent first
    expect(result[1].id).toBe("1");
    expect(result[2].id).toBe("3"); // no-date items go last
  });

  it("sorts by watch_asc (watchDate asc)", () => {
    const items2 = [
      makeMovie({ id: "1", watchDate: "2024-01-01" }),
      makeMovie({ id: "2", watchDate: "2024-06-01" }),
    ];
    const result = sortItems(items2, "watch_asc");
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
  });
});

describe("computeChips", () => {
  it("returns empty array when all filters are default", () => {
    expect(computeChips(makeVaultFilters())).toEqual([]);
  });

  it("includes type chip", () => {
    const chips = computeChips(makeVaultFilters({ type: "movie" }));
    expect(chips).toContainEqual({ label: "Movies", key: "type" });
  });

  it("includes type chip for tv as 'Series'", () => {
    const chips = computeChips(makeVaultFilters({ type: "tv" }));
    expect(chips).toContainEqual({ label: "Series", key: "type" });
  });

  it("includes region chip", () => {
    const chips = computeChips(makeVaultFilters({ region: "Indian" }));
    expect(chips).toContainEqual({ label: "Indian", key: "region" });
  });

  it("includes genre chip", () => {
    const chips = computeChips(makeVaultFilters({ genre: "Drama" }));
    expect(chips).toContainEqual({ label: "Drama", key: "genre" });
  });

  it("includes platform chip", () => {
    const chips = computeChips(makeVaultFilters({ platform: "Netflix" }));
    expect(chips).toContainEqual({ label: "Netflix", key: "platform" });
  });

  it("includes tag chip", () => {
    const chips = computeChips(makeVaultFilters({ tag: "fav" }));
    expect(chips).toContainEqual({ label: "fav", key: "tag" });
  });

  it("includes imdbMin chip", () => {
    const chips = computeChips(makeVaultFilters({ imdbMin: "7.0" }));
    expect(chips).toContainEqual({ label: "IMDb > 7.0", key: "imdbMin" });
  });

  it("includes imdbMax chip", () => {
    const chips = computeChips(makeVaultFilters({ imdbMax: "9.0" }));
    expect(chips).toContainEqual({ label: "IMDb < 9.0", key: "imdbMax" });
  });

  it("includes rtMin chip", () => {
    const chips = computeChips(makeVaultFilters({ rtMin: "80" }));
    expect(chips).toContainEqual({ label: "RT > 80", key: "rtMin" });
  });

  it("includes yearMin chip", () => {
    const chips = computeChips(makeVaultFilters({ yearMin: "2020" }));
    expect(chips).toContainEqual({ label: "Year > 2020", key: "yearMin" });
  });

  it("includes runtimeMin chip (with 'm' suffix)", () => {
    const chips = computeChips(makeVaultFilters({ runtimeMin: "90" }));
    expect(chips).toContainEqual({ label: "RT > 90m", key: "runtimeMin" });
  });
});

describe("countActiveFilters", () => {
  it("returns 0 when all default", () => {
    expect(countActiveFilters(makeVaultFilters())).toBe(0);
  });

  it("counts each active filter", () => {
    const filters = makeVaultFilters({
      type: "movie", // 1
      region: "Indian", // 2
      genre: "Drama", // 3
      sort: "year_desc", // 4 (sort !== recent)
    });
    expect(countActiveFilters(filters)).toBe(4);
  });

  it("counts imdbMin/imdbMax as one (combined with ||)", () => {
    const filters = makeVaultFilters({ imdbMin: "7.0", imdbMax: "9.0" });
    expect(countActiveFilters(filters)).toBe(1);
  });

  it("counts rtMin/rtMax as one (combined with ||)", () => {
    const filters = makeVaultFilters({ rtMin: "80", rtMax: "90" });
    expect(countActiveFilters(filters)).toBe(1);
  });

  it("counts yearMin/yearMax as one (combined with ||)", () => {
    const filters = makeVaultFilters({ yearMin: "2020", yearMax: "2024" });
    expect(countActiveFilters(filters)).toBe(1);
  });

  it("counts runtimeMin/runtimeMax as one (combined with ||)", () => {
    const filters = makeVaultFilters({ runtimeMin: "60", runtimeMax: "180" });
    expect(countActiveFilters(filters)).toBe(1);
  });
});

describe("hasAdvancedFiltersActive", () => {
  it("returns false when all default", () => {
    expect(hasAdvancedFiltersActive(makeVaultFilters())).toBe(false);
  });

  it("returns true when type is set", () => {
    expect(hasAdvancedFiltersActive(makeVaultFilters({ type: "movie" }))).toBe(true);
  });

  it("returns true when sort is not 'recent'", () => {
    expect(hasAdvancedFiltersActive(makeVaultFilters({ sort: "year_desc" }))).toBe(true);
  });

  it("returns true when any range filter is set", () => {
    expect(hasAdvancedFiltersActive(makeVaultFilters({ imdbMin: "7.0" }))).toBe(true);
    expect(hasAdvancedFiltersActive(makeVaultFilters({ yearMax: "2024" }))).toBe(true);
  });
});
