// src/features/watchlist/useVaultFiltering.ts
import { createSignal, createMemo, createEffect, type Accessor } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import type { VaultFilters, WatchlistItem } from "~/shared/types";
import {
  matchSearch,
  filterByStatus,
  filterByAdvanced,
  filterByRanges,
  sortItems,
  computeChips,
  countActiveFilters,
  hasAdvancedFiltersActive,
} from "./vaultFilterUtils";

/**
 * useVaultFiltering — owns the filter state + the filtered/sorted memo
 * for the Watchlist view.
 *
 * Responsibilities:
 *   - defaultFilters constant
 *   - search input (debounced 120ms)
 *   - advanced filter signal (type/region/genre/platform/sort/tag/imdb/rt/year/runtime)
 *   - activeStatusTab quick-filter
 *   - URL → status sync (?status=Watching)
 *   - view-mode effect (timeline forces Completed + watch_desc)
 *   - filtered() memo: search + status + advanced + sort
 *   - hasAdvancedFilters, isFlatMode, activeFilterCount, chips
 *   - clearFilter(key), clearFilters()
 *
 * Pure filtering/sorting logic lives in `vaultFilterUtils.ts`.
 */
export const defaultFilters: VaultFilters = {
  type: "all",
  status: "all",
  region: "all",
  genre: "all",
  platform: "all",
  sort: "recent",
  tag: "all",
  imdbMin: "",
  imdbMax: "",
  rtMin: "",
  rtMax: "",
  yearMin: "",
  yearMax: "",
  runtimeMin: "",
  runtimeMax: "",
};

export interface UseVaultFilteringArgs {
  watchlist: Accessor<WatchlistItem[]>;
  viewMode: Accessor<"grid" | "timeline">;
}

export interface UseVaultFilteringResult {
  searchInput: Accessor<string>;
  onSearchInput: (v: string) => void;
  clearSearch: () => void;
  search: Accessor<string>;
  filters: Accessor<VaultFilters>;
  setFilters: (v: VaultFilters) => void;
  activeStatusTab: Accessor<string>;
  setActiveStatusTab: (v: string) => void;
  filtered: Accessor<WatchlistItem[]>;
  hasAdvancedFilters: Accessor<boolean>;
  isFlatMode: Accessor<boolean>;
  activeFilterCount: Accessor<number>;
  chips: Accessor<{ label: string; key: string }[]>;
  clearFilter: (key: string) => void;
  clearFilters: () => void;
  uniqueGenres: Accessor<string[]>;
  uniquePlatforms: Accessor<string[]>;
  uniqueTags: Accessor<string[]>;
}

export function useVaultFiltering(
  args: UseVaultFilteringArgs,
): UseVaultFilteringResult {
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [filters, setFilters] = createSignal<VaultFilters>(defaultFilters);
  const [activeStatusTab, setActiveStatusTab] = createSignal("all");

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  const onSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      setSearch(v);
    }, 120);
  };

  const clearSearch = () => {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    setSearchInput("");
    setSearch("");
  };

  // Read ?status= from URL (set by Dashboard stat cards)
  createEffect(() => {
    const status = searchParams.status;
    if (typeof status === "string" && status) {
      const next = status === "all" ? "all" : status;
      setFilters((prev) => (prev.status === next ? prev : { ...prev, status: next }));
      if (status === "Watching" || status === "Planned" || status === "Completed") {
        setActiveStatusTab(status);
      }
    }
  });

  // View mode effect — timeline forces Completed + watch_desc
  let prevViewMode = "grid";
  createEffect(() => {
    const mode = args.viewMode();
    if (mode === "timeline" && prevViewMode !== "timeline") {
      setFilters({ ...defaultFilters, status: "Completed", sort: "watch_desc" });
      setActiveStatusTab("Completed");
    } else if (mode === "grid" && prevViewMode === "timeline") {
      setFilters({ ...defaultFilters, status: "all", sort: "recent" });
      setActiveStatusTab("all");
    }
    prevViewMode = mode;
  });

  const uniqueGenres = createMemo(() =>
    [...new Set(
      args.watchlist().flatMap((m) => {
        if (!m.genresList || !Array.isArray(m.genresList)) return [];
        return m.genresList.map((g) => {
          if (typeof g === "string") return g;
          if (typeof g === "object" && g !== null && "name" in g) return String((g as { name: unknown }).name);
          return String(g);
        });
      })
    )]
      .filter(Boolean)
      .sort(),
  );
  const uniquePlatforms = createMemo(() =>
    [...new Set(args.watchlist().flatMap((m) => m.platformsList || []))]
      .filter(Boolean)
      .sort(),
  );
  const uniqueTags = createMemo(() =>
    [...new Set(args.watchlist().map((m) => m.tag).filter((t): t is string => !!t))].sort(),
  );

  const filtered = createMemo(() => {
    let f = args.watchlist();
    if (search()) f = f.filter((m) => matchSearch(m, search()));

    const effectiveStatus =
      activeStatusTab() !== "all" ? activeStatusTab() : filters().status;
    f = filterByStatus(f, effectiveStatus);
    f = filterByAdvanced(f, filters());
    f = filterByRanges(f, filters());
    return sortItems(f, filters().sort);
  });

  const hasAdvancedFilters = createMemo(() => hasAdvancedFiltersActive(filters()));
  const isFlatMode = createMemo(
    () => search().length > 0 || hasAdvancedFilters() || activeStatusTab() !== "all",
  );
  const activeFilterCount = createMemo(() => countActiveFilters(filters()));
  const chips = createMemo(() => computeChips(filters()));

  const clearFilter = (key: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: key.startsWith("imdb") || key.startsWith("rt") || key.startsWith("year") || key.startsWith("runtime") ? "" : "all",
    }));
  };

  const clearFilters = () => {
    setFilters({ ...defaultFilters, status: "all" });
    setActiveStatusTab("all");
    clearSearch();
  };

  return {
    searchInput,
    onSearchInput,
    clearSearch,
    search,
    filters,
    setFilters,
    activeStatusTab,
    setActiveStatusTab,
    filtered,
    hasAdvancedFilters,
    isFlatMode,
    activeFilterCount,
    chips,
    clearFilter,
    clearFilters,
    uniqueGenres,
    uniquePlatforms,
    uniqueTags,
  };
}
