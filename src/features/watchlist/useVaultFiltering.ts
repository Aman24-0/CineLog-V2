// src/features/watchlist/useVaultFiltering.ts
import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  type Accessor
} from "solid-js";
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
  hasAdvancedFiltersActive
} from "./vaultFilterUtils";
import { useWatchlistOttAvailability, type PlatformFilterOption } from "./hooks/useWatchlistOttAvailability";
import { readTagDefinitions } from "./tagStore";

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
  runtimeMax: ""
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
  /**
   * Platform filter options derived from actual JustWatch availability
   * of the watchlist items in the user's country. Each option carries
   * a stable `technicalName` (the filter value), a human-readable
   * `clearName`, an optional `icon` URL, and a `count` of how many
   * watchlist items carry this provider.
   *
   * Empty while the batch-availability fetch is in flight, on error,
   * or when no watchlist item has any JustWatch offer. The Platform
   * dropdown hides when this is empty (per Chunk 6 Task 6 spec).
   */
  uniquePlatforms: Accessor<PlatformFilterOption[]>;
  /**
   * True while the JustWatch batch-availability fetch is in flight.
   * Exposed so the Platform filter UI can show a loading state if
   * desired (the default is to simply hide the dropdown until data
   * arrives).
   */
  ottLoading: Accessor<boolean>;
  /**
   * CHUNK 6N Task 3 — TEMPORARY debug accessor. Returns the first 3
   * raw batch-response keys (as a JSON string) from the most recent
   * OTT fetch, for display in the Platform filter modal's debug line.
   * Empty string before the first fetch. Will be removed alongside
   * the other Chunk 6E-6M diagnostic logs.
   */
  debugRawKeys: Accessor<string>;
  uniqueTags: Accessor<string[]>;
  /**
   * Union of the user's tag vocabulary (saved in localStorage) and the
   * tags currently in use on vault items. This is what the Tags filter
   * dropdown renders. Phase 6.2 Task 1a.
   */
  uniqueTagsPlus: Accessor<string[]>;
  /** Bump this signal to force `uniqueTagsPlus` to re-read localStorage
   *  after the vocabulary changes. */
  refreshTagVocab: () => void;
}

export function useVaultFiltering(
  args: UseVaultFilteringArgs
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

  // PHASE 18 BUG FIX — clear the debounce timer on unmount.
  // Without this, navigating away within the 120ms debounce window
  // leaves the timer pending; when it fires it calls setSearch() on
  // a stale signal from an unmounted component, contributing to the
  // "hidden errors accumulating per page navigation" symptom.
  onCleanup(() => {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
  });

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
      setFilters((prev) =>
        prev.status === next ? prev : { ...prev, status: next }
      );
      if (
        status === "Watching" ||
        status === "Planned" ||
        status === "Completed" ||
        status === "Dropped"
      ) {
        setActiveStatusTab(status);
      }
    }
  });

  // Phase 6.2 Task 3b — Read ?genre= from URL (set by Stats GenreChart).
  // When the user taps a genre bar in the Statistics page, they're
  // navigated to /watchlist?genre=<name>. This effect picks up that
  // param and applies it as the active Genre filter, so the user
  // lands on a ready-filtered list of their titles in that genre.
  //
  // We deliberately do NOT clear the param after reading — the URL
  // is the source of truth, and the user can share/bookmark it. If
  // the user manually clears the filter via the UI, the URL stays
  // as-is (we don't sync filter → URL, only URL → filter).
  createEffect(() => {
    const genre = searchParams.genre;
    if (typeof genre === "string" && genre) {
      setFilters((prev) =>
        prev.genre === genre ? prev : { ...prev, genre }
      );
    }
  });

  // View mode effect — timeline forces Completed + watch_date desc.
  // Grid mode resets to added_date desc (recently-added default).
  let prevViewMode = "grid";
  createEffect(() => {
    const mode = args.viewMode();
    if (mode === "timeline" && prevViewMode !== "timeline") {
      setFilters({
        ...defaultFilters,
        status: "Completed",
        sortField: "watch_date",
        sortDirection: "desc"
      });
      setActiveStatusTab("Completed");
    } else if (mode === "grid" && prevViewMode === "timeline") {
      setFilters({
        ...defaultFilters,
        status: "all",
        sortField: "added_date",
        sortDirection: "desc"
      });
      setActiveStatusTab("all");
    }
    prevViewMode = mode;
  });

  // ── JUSTWATCH OTT AVAILABILITY (Chunk 6) ───────────────────────────
  // Enriches every watchlist item with `justwatchProviders: string[]`
  // (JustWatch `package.technicalName` values) via a single batched
  // POST /api/ott/batch-availability call (split into 25-item chunks
  // if the watchlist is larger). The Platform filter dropdown options
  // and the `matchesPlatform` predicate both consume this enrichment.
  //
  // See `hooks/useWatchlistOttAvailability.ts` for the full contract.
  const ottAvailability = useWatchlistOttAvailability(args.watchlist);
  const { enrichedItems, providerCatalog, loading: ottLoading, debugRawKeys } = ottAvailability;

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
        else if (g && typeof g === "object" && "name" in g)
          set.add(String((g as { name: unknown }).name));
      }
    }
    return [...set].sort();
  });
  // uniquePlatforms — now derived from the JustWatch provider catalog
  // built by `useWatchlistOttAvailability`. The catalog is already
  // deduped + sorted (count desc, clearName asc) by the hook, so this
  // memo is a thin pass-through that exists to keep the public hook
  // API stable (`uniquePlatforms` was already part of the result
  // interface before Chunk 6).
  //
  // The returned `PlatformFilterOption[]` carries:
  //   - `technicalName` (the filter value stored in `filters.platform`)
  //   - `clearName`     (the label rendered in the dropdown)
  //   - `icon`          (optional JustWatch CDN URL for the logo)
  //   - `count`         (number of watchlist items with this provider)
  //
  // Empty array while loading, on error, or when no items have any
  // JustWatch offer. The dropdown consumer renders a DISABLED state
  // when this is empty (Chunk 6F Task 1 — previously it was hidden).
  const uniquePlatforms = createMemo<PlatformFilterOption[]>(() => {
    const catalog = providerCatalog();
    // Chunk 6F Task 4 — diagnostic log. Tracks the watchlist size,
    // the OTT loading state, the OTT error state (read indirectly
    // via the catalog being empty even when not loading), and the
    // unique provider count. Temporary; will be removed in a later
    // cleanup chunk alongside the OTT server logs from Chunk 6E.
    // Logs only counts (no PII / no titles).
    console.log(
      "[useVaultFiltering] uniquePlatforms memo" +
        " watchlistSize=" + args.watchlist().length +
        " ottLoading=" + ottLoading() +
        " providerCatalogSize=" + catalog.length
    );
    return catalog;
  });

  // Chunk 6G Task 2 — diagnostic effect. Logs the actual
  // `uniquePlatforms()` array (not just the count) so we can verify
  // each option carries `technicalName`, `clearName`, and `count`.
  // Watches `uniquePlatforms` reactively so it re-logs whenever the
  // catalog updates (initial empty → populated after OTT fetch).
  // Temporary; will be removed in a later cleanup chunk.
  createEffect(() => {
    console.log("[Watchlist OTT] uniquePlatforms", uniquePlatforms());
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

  // ── TAG VOCABULARY (Phase 6.2 Task 1a) ──────────────────────────────
  // The user's tag vocabulary is stored in localStorage (tagStore.ts) so
  // it persists across sessions without requiring a Supabase round-trip.
  // We keep a `tagVocabVersion` signal that callers can bump via
  // `refreshTagVocab()` after add/remove operations to force the
  // `uniqueTagsPlus` memo to re-read localStorage.
  const [tagVocabVersion, setTagVocabVersion] = createSignal(0);
  const refreshTagVocab = () => setTagVocabVersion((v) => v + 1);

  // Listen for the custom "cinelog:tags-updated" event so changes from
  // OTHER components (or other tabs via the storage event) are picked
  // up automatically without each consumer needing to call refresh.
  onMount(() => {
    const handler = () => refreshTagVocab();
    window.addEventListener("cinelog:tags-updated", handler);
    window.addEventListener("storage", handler);
    onCleanup(() => {
      window.removeEventListener("cinelog:tags-updated", handler);
      window.removeEventListener("storage", handler);
    });
  });

  // uniqueTagsPlus — union of (vocabulary from localStorage) ∪ (tags in use).
  // The `tagVocabVersion()` read inside the memo creates a reactive
  // dependency so the memo re-runs whenever the vocabulary changes.
  const uniqueTagsPlus = createMemo(() => {
    // Read tagVocabVersion to create the reactive dependency.
    tagVocabVersion();
    const vocab = readTagDefinitions();
    const set = new Set<string>(vocab);
    const list = args.watchlist();
    for (let i = 0; i < list.length; i++) {
      const t = list[i].tag;
      if (t) set.add(t);
    }
    return [...set].sort();
  });

  const filtered = createMemo(() => {
    // Use the JustWatch-enriched items so `matchesPlatform` can read
    // `m.justwatchProviders`. Until the OTT fetch completes, the
    // enriched list equals the raw watchlist (with `justwatchProviders`
    // undefined), so the Platform filter simply matches nothing while
    // loading — but every other filter (status, type, genre, tag, sort)
    // works normally. The user sees their watchlist immediately.
    let f = enrichedItems();
    if (search()) f = f.filter((m) => matchSearch(m, search()));

    const effectiveStatus =
      activeStatusTab() !== "all" ? activeStatusTab() : filters().status;
    f = filterByStatus(f, effectiveStatus);
    f = filterByAdvanced(f, filters());
    f = filterByRanges(f, filters());
    return sortItems(f, filters().sortField, filters().sortDirection);
  });

  const hasAdvancedFilters = createMemo(() =>
    hasAdvancedFiltersActive(filters())
  );
  const isFlatMode = createMemo(
    () =>
      search().length > 0 || hasAdvancedFilters() || activeStatusTab() !== "all"
  );
  const activeFilterCount = createMemo(() => countActiveFilters(filters()));
  // chips — pass the JustWatch provider catalog so the Platform chip
  // can resolve the technicalName stored in `filters.platform` to a
  // human-readable `clearName` (e.g. "apple.tv.plus" → "Apple TV+").
  // When the catalog is empty (loading / error / no offers), the chip
  // falls back to showing the raw technicalName (rare — the user can
  // only pick a platform when the catalog is non-empty).
  const chips = createMemo(() =>
    computeChips(filters(), providerCatalog())
  );

  const clearFilter = (key: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]:
        key.startsWith("imdb") ||
        key.startsWith("rt") ||
        key.startsWith("year") ||
        key.startsWith("runtime")
          ? ""
          : "all"
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
    ottLoading,
    // CHUNK 6N Task 3 — TEMPORARY debug accessor for the visible
    // debug line in VaultFiltersContent. Will be removed alongside
    // the other Chunk 6E-6M diagnostic logs.
    debugRawKeys,
    uniqueTags,
    uniqueTagsPlus,
    refreshTagVocab
  };
}
