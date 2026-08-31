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
import { usePublishedProviderCatalog } from "./hooks/usePublishedProviderCatalog";
import { readTagDefinitions } from "./tagStore";
import { languageDisplayName } from "~/shared/data/languageCodes";

/**
 * useVaultFiltering — owns the filter state + the filtered/sorted memo
 * for the Watchlist view.
 *
 * Responsibilities:
 *   - defaultFilters constant
 *   - search input (debounced 120ms)
 *   - advanced filter signal (type/language/genre/platform/sort/tag/imdb/rt/year/runtime)
 *   - activeStatusTab quick-filter
 *   - URL → status sync (?status=Watching)
 *   - view-mode effect (timeline forces Completed + watch_desc)
 *   - filtered() memo: search + status + advanced + sort
 *   - hasAdvancedFilters, isFlatMode, activeFilterCount, chips
 *   - clearFilter(key), clearFilters()
 *
 * Part 3 — `region` is replaced by `language` (ISO 639-1 code).
 * `uniqueLanguages` exposes the sorted list of original-language
 * codes actually present in the watchlist, with display-name
 * resolution handled by `languageDisplayName` in
 * `src/shared/data/languageCodes.ts`.
 *
 * Pure filtering/sorting logic lives in `vaultFilterUtils.ts`.
 */
export const defaultFilters: VaultFilters = {
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
  runtimeMax: ""
};

export interface UseVaultFilteringArgs {
  watchlist: Accessor<WatchlistItem[]>;
  viewMode: Accessor<"grid" | "timeline">;
  initialSearchInput?: string;
  initialFilters?: VaultFilters;
  initialStatusTab?: string;
  isRestoringViewState?: Accessor<boolean>;
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
   * Unique original-language codes present in the user's library,
   * paired with their display names. Drives the Library Language
   * dropdown (Part 3 redesign). The list is derived from
   * `WatchlistItem.originalLanguage` (TMDB `original_language`, ISO
   * 639-1) and sorted alphabetically by display name. Items with no
   * `originalLanguage` (older cache entries) don't appear here.
   */
  uniqueLanguages: Accessor<Array<{ code: string; label: string }>>;
  /**
   * Platform filter options from the published Supabase provider
   * catalogue for the user's profile country (Part 4 redesign).
   * Each option carries a stable `technicalName` (the filter value),
   * a human-readable `clearName`, and an optional `icon` URL.
   *
   * Empty while the catalogue fetch is in flight, on error, or when
   * no providers are published for the country. The Platform dropdown
   * renders in a disabled state in those cases (see VaultFiltersContent).
   */
  uniquePlatforms: Accessor<PlatformFilterOption[]>;
  /**
   * True WHILE the published Supabase provider catalog fetch is in
   * flight (the small Supabase read that powers the Platform dropdown
   * options). This is INDEPENDENT of `ottLoading` (title-level
   * JustWatch batch availability), so the Platform dropdown can
   * become interactive the moment the catalog lands — even if the
   * title-level enrichment is still running for 1000+ titles.
   *
   * Part 4 follow-up fix: VaultFiltersContent uses THIS accessor
   * (NOT `ottLoading`) to decide whether to show "Loading platforms…"
   * vs "No platforms available for your country". Before the fix,
   * `ottLoading` aggregated both loading states, so the dropdown
   * stayed in "Loading platforms…" until the 1000+ title availability
   * fetch completed — even though the catalog itself returned in
   * <100ms.
   */
  platformCatalogLoading: Accessor<boolean>;
  /**
   * True while the JustWatch batch-availability fetch is in flight
   * (title-level enrichment). This is the title-level "which of my
   * library titles are available on each platform" fetch — separate
   * from the published-catalog read above.
   *
   * Kept for backward-compat with any consumer that reads it. The
   * Platform dropdown should NOT use this — see
   * `platformCatalogLoading` above.
   */
  ottLoading: Accessor<boolean>;
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
  const initialSearch = args.initialSearchInput ?? "";
  const initialFilters = args.initialFilters ?? defaultFilters;
  const initialStatus = args.initialStatusTab ?? initialFilters.status ?? "all";
  const [searchInput, setSearchInput] = createSignal(initialSearch);
  const [search, setSearch] = createSignal(initialSearch);
  const [filters, setFilters] = createSignal<VaultFilters>(initialFilters);
  const [activeStatusTab, setActiveStatusTab] = createSignal(initialStatus);

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
        status === "Dropped" ||
        status === "Re-watched"
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
  // Seed the lifecycle tracker from the restored view mode. This prevents
  // the initial effect pass from treating a restored Timeline view as a user
  // toggle and resetting its saved filters/status.
  let prevViewMode = args.viewMode();
  createEffect(() => {
    const mode = args.viewMode();
    if (args.isRestoringViewState?.()) {
      prevViewMode = mode;
      return;
    }
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
  // `useWatchlistOttAvailability` enriches every watchlist item with
  // `justwatchProviders: string[]` (JustWatch `package.technicalName`
  // values) via a single batched POST /api/ott/batch-availability call
  // (split into 25-item chunks if the watchlist is larger). The
  // `matchesPlatform` predicate in vaultFilterUtils reads this per-
  // title enrichment.
  //
  // Part 4 redesign — the PROVIDER CATALOG (dropdown options) is now
  // sourced separately from the published Supabase catalogue via the
  // `usePublishedProviderCatalog` hook (instantiated below). The
  // watchlist-derived `providerCatalog` from
  // `useWatchlistOttAvailability` is now a stable `[]` (kept for
  // backward-compat with the destructure only — see the hook's docs).
  //
  // See `hooks/useWatchlistOttAvailability.ts` for the full contract.
  const ottAvailability = useWatchlistOttAvailability(args.watchlist);
  const {
    enrichedItems,
    loading: ottBatchLoading
  } = ottAvailability;

  // ── PUBLISHED SUPABASE PROVIDER CATALOG (Part 4 redesign) ────────
  // The Library Platform filter dropdown options come from Supabase
  // (the published `justwatch_provider_catalog` rows for the user's
  // profile country). This is a SEPARATE concern from the per-title
  // availability enrichment above:
  //   - PUBLISHED CATALOG (this hook): "which platforms exist in this
  //     country?" — sourced from Supabase, no JustWatch fallback.
  //   - TITLE AVAILABILITY (ottAvailability above): "which of my
  //     library titles are available on the selected platform?" —
  //     sourced from the existing JustWatch batch-availability route
  //     and the ott_availability_cache table (UNCHANGED).
  const publishedCatalog = usePublishedProviderCatalog();
  const {
    catalog: publishedCatalogItems,
    loading: catalogLoading
  } = publishedCatalog;

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

  // ── uniqueLanguages (Part 3) — derive unique original-language codes
  // from the user's library, paired with display names. Sorted
  // alphabetically by display name for a stable dropdown. Items with
  // no `originalLanguage` (older cache entries) are skipped — they
  // don't appear in the dropdown and only get filtered out when a
  // specific language is picked.
  const uniqueLanguages = createMemo<Array<{ code: string; label: string }>>(() => {
    const set = new Set<string>();
    const list = args.watchlist();
    for (let i = 0; i < list.length; i++) {
      const lang = list[i].originalLanguage;
      if (typeof lang === "string" && lang.length > 0) {
        set.add(lang.toLowerCase());
      }
    }
    // Map each unique code to its display name and sort by label.
    const entries: Array<{ code: string; label: string }> = [];
    set.forEach((code) => {
      entries.push({ code, label: languageDisplayName(code) || code });
    });
    entries.sort((a, b) => a.label.localeCompare(b.label));
    return entries;
  });

  // uniquePlatforms — Part 4 redesign. Now derived from the published
  // Supabase provider catalogue (not from the watchlist). The catalog
  // from `usePublishedProviderCatalog` is already deduped + sorted
  // (clear_name ascending) by the API route + cache layer.
  //
  // The returned `PlatformFilterOption[]` carries:
  //   - `technicalName` (the filter value stored in `filters.platform`)
  //   - `clearName`     (the label rendered in the dropdown)
  //   - `icon`          (optional JustWatch CDN URL for the logo)
  //   - `count`         (0 — count is no longer meaningful at the
  //                      catalog level; the spec decouples the dropdown
  //                      options from the user's watchlist contents)
  //
  // Empty array while loading, on error, or when no providers are
  // published for the country. The dropdown consumer renders a
  // DISABLED state when this is empty (Chunk 6F Task 1).
  const uniquePlatforms = createMemo<PlatformFilterOption[]>(() => {
    return publishedCatalogItems();
  });

  // ── Aggregate loading flag — kept for backward-compat with any
  // consumer that read the old `ottLoading` (which used to aggregate
  // both loading states). The Platform dropdown should NOT use this
  // — it should read `platformCatalogLoading` (below) instead, so
  // the dropdown becomes interactive the moment the small Supabase
  // catalog read lands, even if the title-level JustWatch batch
  // availability fetch is still running for 1000+ titles.
  //
  // Part 4 follow-up: the original `ottLoading = ottBatchLoading() ||
  // catalogLoading()` caused the Platform dropdown to show "Loading
  // platforms…" until the title-level fetch completed, which can take
  // minutes for a large library. The dropdown now uses the dedicated
  // `platformCatalogLoading` accessor (which is just `catalogLoading`).
  const platformCatalogLoading = createMemo(() => catalogLoading());
  const ottLoading = createMemo(() => ottBatchLoading() || catalogLoading());
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
  // chips — pass the published provider catalog so the Platform chip
  // can resolve the technicalName stored in `filters.platform` to a
  // human-readable `clearName` (e.g. "apple.tv.plus" → "Apple TV+").
  // When the catalog is empty (loading / error / no providers
  // published for the country), the chip falls back to showing the
  // raw technicalName (rare — the user can only pick a platform when
  // the catalog is non-empty).
  const chips = createMemo(() =>
    computeChips(filters(), uniquePlatforms())
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
    uniqueLanguages,
    uniquePlatforms,
    platformCatalogLoading,
    ottLoading,
    uniqueTags,
    uniqueTagsPlus,
    refreshTagVocab
  };
}
