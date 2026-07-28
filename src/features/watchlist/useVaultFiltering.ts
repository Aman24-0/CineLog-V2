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
import { resolvePlatformDisplayName } from "./platformDisplayNames";

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
      if (status === "Watching" || status === "Planned" || status === "Completed" || status === "Dropped") {
        setActiveStatusTab(status);
      }
    }
  });

  // View mode effect — timeline forces Completed + watch_date desc.
  // Grid mode resets to added_date desc (recently-added default).
  let prevViewMode = "grid";
  createEffect(() => {
    const mode = args.viewMode();
    if (mode === "timeline" && prevViewMode !== "timeline") {
      setFilters({ ...defaultFilters, status: "Completed", sortField: "watch_date", sortDirection: "desc" });
      setActiveStatusTab("Completed");
    } else if (mode === "grid" && prevViewMode === "timeline") {
      setFilters({ ...defaultFilters, status: "all", sortField: "added_date", sortDirection: "desc" });
      setActiveStatusTab("all");
    }
    prevViewMode = mode;
  });

  // ── UNIQUE VALUES — single-pass Set accumulation (no intermediate arrays) ──
  // Previously: flatMap + map + new Set + spread + filter + sort created
  // 5 intermediate arrays per memo run. Now we use Set.add() in a single
  // pass, then sort once. For a 1029-item vault with ~3 genres each,
  // this avoids ~3000 intermediate array elements.
  const uniqueGenres = createMemo(() => {
    const set = new Set<string>();
    const list = args.watchlist();
    for (let i = 0; i < list.length; i++) {
      const gl = list[i].genresList;
      if (!gl || !Array.isArray(gl)) continue;
      for (let j = 0; j < gl.length; j++) {
        const g = gl[j];
        if (typeof g === "string") set.add(g);
        else if (g && typeof g === "object" && "name" in g) set.add(String((g as { name: unknown }).name));
      }
    }
    return [...set].sort();
  });
  const uniquePlatforms = createMemo(() => {
    // Single-pass Set accumulation across ALL possible platform sources.
    // Previously this only checked `platformsList`, which left the Platform
    // dropdown empty for users whose items store the platform under
    // `watchProgress.server` or `providers` (TMDB watch-provider field).
    // Now we check every known field per item, filter out null/empty/
    // whitespace, trim, and dedupe via the Set.
    //
    // DISPLAY NAME RESOLUTION (v3):
    //   Raw strings from `providers` (TMDB numeric IDs as strings like "8")
    //   and `watchProgress.server` (lowercase slugs like "netflix") are
    //   passed through `resolvePlatformDisplayName()` so the dropdown
    //   renders "Netflix", "Prime Video", etc. instead of "8" or "netflix".
    //   This keeps the dropdown options human-readable AND ensures the
    //   filter predicate (matchesPlatform) compares against the same
    //   canonical name.
    const set = new Set<string>();
    const list = args.watchlist();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];

      // Source 1: platformsList (legacy array of provider names — usually
      // already human-readable, but we normalize for consistency).
      const pl = item.platformsList;
      if (pl && Array.isArray(pl)) {
        for (let j = 0; j < pl.length; j++) {
          const p = pl[j];
          if (p && typeof p === "string" && p.trim()) {
            const resolved = resolvePlatformDisplayName(p);
            if (resolved) set.add(resolved);
          }
        }
      }

      // Source 2: providers (TMDB watch-provider field — may contain
      // numeric IDs as strings, e.g. "8" for Netflix).
      const prov = item.providers;
      if (prov && Array.isArray(prov)) {
        for (let j = 0; j < prov.length; j++) {
          const p = prov[j];
          if (p && typeof p === "string" && p.trim()) {
            const resolved = resolvePlatformDisplayName(p);
            if (resolved) set.add(resolved);
          }
        }
      }

      // Source 3: watchProgress.server (some items store the streaming
      // platform here — may be a raw ID, a lowercase slug, or a name).
      const server = item.watchProgress?.server;
      if (server && typeof server === "string" && server.trim()) {
        const resolved = resolvePlatformDisplayName(server);
        if (resolved) set.add(resolved);
      }
    }
    return [...set].sort();
  });
  const uniqueTags = createMemo(() => {
    const set = new Set<string>();
    const list = args.watchlist();
    for (let i = 0; i < list.length; i++) {
      const t = list[i].tag;
      if (t) set.add(t);
    }
    return [...set].sort();
  });

  const filtered = createMemo(() => {
    let f = args.watchlist();
    if (search()) f = f.filter((m) => matchSearch(m, search()));

    const effectiveStatus =
      activeStatusTab() !== "all" ? activeStatusTab() : filters().status;
    f = filterByStatus(f, effectiveStatus);
    f = filterByAdvanced(f, filters());
    f = filterByRanges(f, filters());
    return sortItems(f, filters().sortField, filters().sortDirection);
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
