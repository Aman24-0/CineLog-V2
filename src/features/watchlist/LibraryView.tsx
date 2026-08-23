// src/features/watchlist/LibraryView.tsx
import {
  createSignal,
  onMount,
  onCleanup,
  Show,
  batch,
  createEffect
} from "solid-js";
import {
  readLibraryViewState,
  writeLibraryViewState
} from "./libraryViewState";
import { useModalState } from "~/shared/hooks/useModalState";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { useOnlineStatus } from "~/shared/hooks/useOnlineStatus";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { OfflineState, RefreshingIndicator } from "~/shared/ui/states";
import { useVault } from "./useVault";
import { useVaultSections } from "./useVaultSections";
import { useVaultFiltering } from "./useVaultFiltering";
import { resolveStatusToggle } from "./vaultFilterUtils";
import LibraryHeader from "./components/LibraryHeader";
import LibraryGrid from "./components/LibraryGrid";
import LibraryDialogs from "./components/LibraryDialogs";
import VaultFiltersContent from "./components/VaultFiltersContent";
import EmptyState from "./components/EmptyState";
import LoadingSkeleton from "./components/LoadingSkeleton";

/**
 * LibraryView — orchestration only.
 *
 * Library layout (v2):
 *   - Removed the redundant saved-title stats bar (the inline status chips
 *     already show live counts, making a separate stats bar redundant).
 *   - The sticky header combines search + view toggle + filter icon +
 *     status chips into a single compact control center.
 *   - Dynamic layout engine: "All" = dashboard sections (Continue
 *     Watching, Planned, Recently Completed, Dropped) with "See All"
 *     buttons that switch the status chip; a specific status = single
 *     flat grid.
 *
 * Owns top-level state (view mode, display limit, expanded shelves, filter
 * drawer visibility) and composes the section components.
 */
export default function LibraryView() {
  const { openTitle } = useModalState();
  const { openAuthModal } = useAuthModal();
  const { isOffline } = useOnlineStatus();
  const {
    watchlist,
    loading,
    isGuest,
    error,
    presets,
    savePreset,
    deletePreset
  } = useVault();

  // Track whether the vault has completed its initial load at least once.
  // Once true, any subsequent loading=true means a background refresh,
  // not the first fetch. Used to show RefreshingIndicator instead of
  // the full LoadingSkeleton during refreshes.
  const [hasLoadedOnce, setHasLoadedOnce] = createSignal(false);
  createEffect(() => {
    if (!loading()) setHasLoadedOnce(true);
  });

  const [showFilter, setShowFilter] = createSignal(false);
  const [filterCollapsed, setFilterCollapsed] = createSignal(false);
  const [displayLimit, setDisplayLimit] = createSignal(20);
  const [viewMode, setViewModeInternal] = createSignal<"grid" | "timeline">(
    "grid"
  );
  const [expandedShelves, setExpandedShelves] = createSignal<Set<string>>(
    new Set()
  );
  const [hasRestoredViewState, setHasRestoredViewState] = createSignal(false);

  // Deferred view-mode switch for INP optimization.
  const setViewMode = (mode: "grid" | "timeline") => {
    if (viewMode() === mode) return;
    requestAnimationFrame(() => setViewModeInternal(mode));
  };

  const filtering = useVaultFiltering({
    watchlist,
    viewMode,
    isRestoringViewState: () => !hasRestoredViewState()
  });
  const {
    searchInput,
    onSearchInput,
    search,
    filters,
    setFilters,
    activeStatusTab,
    setActiveStatusTab,
    filtered,
    isFlatMode,
    activeFilterCount,
    chips,
    clearFilter,
    clearFilters,
    uniqueGenres,
    uniquePlatforms,
    uniqueTags,
    uniqueTagsPlus,
    refreshTagVocab,
    // CHUNK 6N Task 3 — TEMPORARY debug accessors for the visible
    // debug line in the Platform filter modal.
    ottLoading,
    debugRawKeys,
    // CHUNK 6O Task 1 — TEMPORARY debug accessors for the visible
    // debug line in the Platform filter modal.
    fetchState,
    fetchError,
    // CHUNK 6P Task 1 — TEMPORARY debug accessors for the visible
    // debug line in the Platform filter modal.
    effectRunId,
    chunkProgress,
    // CHUNK 6R Task 5 — TEMPORARY debug accessor for the visible
    // debug line in the Platform filter modal.
    cacheSource
  } = filtering;

  // Persist ephemeral presentation state only. The UserLibrary provider and
  // vault adapters remain the sole owners of watched history and other data.
  createEffect(() => {
    if (!hasRestoredViewState()) return;
    writeLibraryViewState({
      searchInput: searchInput(),
      filters: filters(),
      activeStatusTab: activeStatusTab(),
      viewMode: viewMode(),
      displayLimit: displayLimit(),
      expandedShelves: [...expandedShelves()],
      filterCollapsed: filterCollapsed()
    });
  });

  // Infinite scroll — bump display limit when user nears the bottom.
  const handleScroll = () => {
    if (
      window.innerHeight + window.scrollY >=
      document.body.offsetHeight - 500
    ) {
      setDisplayLimit((prev) => prev + 20);
    }
  };

  onMount(() => {
    const savedViewState = readLibraryViewState();
    batch(() => {
      onSearchInput(savedViewState.searchInput);
      setFilters(savedViewState.filters);
      setActiveStatusTab(savedViewState.activeStatusTab);
      setFilterCollapsed(savedViewState.filterCollapsed);
      setDisplayLimit(savedViewState.displayLimit);
      setViewModeInternal(savedViewState.viewMode);
      setExpandedShelves(new Set(savedViewState.expandedShelves));
      setHasRestoredViewState(true);
    });

    window.addEventListener("scroll", handleScroll, { passive: true });
    onCleanup(() => window.removeEventListener("scroll", handleScroll));
  });

  const openMovie = (id: string) => {
    const item = watchlist().find((m) => m.id === id);
    if (item) openTitle(item, watchlist());
  };

  const handleLogin = () => {
    openAuthModal();
  };

  const handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  const toggleShelfExpand = (shelfId: string) => {
    setExpandedShelves((prev) => {
      const next = new Set(prev);
      if (next.has(shelfId)) next.delete(shelfId);
      else next.add(shelfId);
      return next;
    });
  };

  // Sections hook — adaptive shelves with deduplication
  const { sections } = useVaultSections({
    watchlist: filtered,
    flatMode: isFlatMode
  });

  const handleSelectStatusTab = (status: string) => {
    // Status controls are mutually exclusive toggles. Clicking the active
    // status again returns to the base Library state, represented internally
    // by the existing `all` filter value; no visible All control is needed.
    const nextStatus = resolveStatusToggle(activeStatusTab(), status);
    batch(() => {
      setActiveStatusTab(nextStatus);
      setFilters({ ...filters(), status: nextStatus });
      setDisplayLimit(20);
    });
  };

  return (
    <PageContainer width="wide" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <Show when={isOffline()}>
        <OfflineState variant="banner" hasCachedData />
      </Show>

      <div class="vault-desktop-layout">
        {/* Phase 10 Chunk 2 — Desktop-only advanced-filters sidebar.
            Renders VaultFiltersContent inline (always visible) on
            desktop (≥1024px). Hidden on mobile/tablet, where the
            existing bottom-sheet VaultFilters (via LibraryDialogs)
            handles filter UX. */}
        <Show when={!isGuest()}>
          <aside
            class={`vault-filters-sidebar${filterCollapsed() ? " vault-filter-sidebar--collapsed" : ""}`}
            aria-label="Advanced filters"
          >
            <div class="vault-filters-sidebar-header">
              <Show when={!filterCollapsed()}>
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "18px", color: "var(--p)" }}
                  aria-hidden="true"
                >
                  tune
                </span>
                <h3 class="type-headline vault-filters-sidebar-title">
                  Filters
                </h3>
              </Show>
              <button
                type="button"
                class="vault-filter-sidebar__toggle"
                onClick={() => setFilterCollapsed(!filterCollapsed())}
                aria-label={
                  filterCollapsed() ? "Expand filters" : "Collapse filters"
                }
                title={
                  filterCollapsed() ? "Expand filters" : "Collapse filters"
                }
              >
                <span
                  class="material-symbols-outlined"
                  style={{
                    "font-size": "18px",
                    transform: filterCollapsed()
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                    transition: "transform var(--dur-base) var(--ease-out)"
                  }}
                  aria-hidden="true"
                >
                  chevron_left
                </span>
              </button>
            </div>
            <Show when={!filterCollapsed()}>
              <VaultFiltersContent
                filters={filters()}
                setFilters={(v) => {
                  setFilters(v);
                  setDisplayLimit(20);
                }}
                uniqueGenres={uniqueGenres()}
                uniquePlatforms={uniquePlatforms()}
                uniqueTags={uniqueTags()}
                uniqueTagsPlus={uniqueTagsPlus()}
                refreshTagVocab={refreshTagVocab}
                ottLoading={ottLoading()}
                debugRawKeys={debugRawKeys()}
                watchlistSize={watchlist().length}
                fetchState={fetchState()}
                fetchError={fetchError()}
                effectRunId={effectRunId()}
                chunkProgress={chunkProgress()}
                cacheSource={cacheSource()}
                presets={presets}
                onSavePreset={(name) => savePreset(name, filters())}
                onDeletePreset={(id) => deletePreset(id)}
              />
              <div class="vault-filters-sidebar-actions">
                <button
                  type="button"
                  class="btn-ghost"
                  onClick={() => {
                    clearFilters();
                    setDisplayLimit(20);
                  }}
                >
                  Clear All
                </button>
              </div>
            </Show>
          </aside>
        </Show>

        <div class="vault-desktop-main">
          <LibraryHeader
            viewMode={viewMode}
            setViewMode={setViewMode}
            activeFilterCount={activeFilterCount}
            onFilterClick={() => setShowFilter(true)}
            searchInput={searchInput}
            onSearchInput={onSearchInput}
            onClearAll={clearFilters}
            activeStatusTab={activeStatusTab}
            onSelectStatusTab={handleSelectStatusTab}
            watchlist={watchlist}
            chips={chips}
            onClearFilter={clearFilter}
          />

          {/* Saved-title stats removed — the inline status chips in the header
              already show live counts, making a separate stats bar redundant.
              The filtered count is still visible via the section subtitles
              (in dashboard mode) or the grid's natural rendering (in flat mode). */}

          {/* Refreshing indicator — shows a subtle bar when the vault
              is re-fetching after the initial load. NEVER replaces the
              content with a full-page skeleton during refresh. */}
          <Show when={loading() && hasLoadedOnce()}>
            <RefreshingIndicator
              placement="top"
              message="Refreshing library…"
            />
          </Show>

          <Show when={!loading()} fallback={<LoadingSkeleton />}>
            <Show
              when={!error()}
              fallback={
                <EmptyState
                  variant="error"
                  isGuest={false}
                  onLogin={() => {}}
                  title="Error Loading Library"
                  message={error() || "An unknown error occurred."}
                  actionText="Reload Page"
                  onAction={handleReload}
                />
              }
            >
              <LibraryGrid
                viewMode={viewMode}
                loading={loading}
                error={error}
                isGuest={isGuest}
                filtered={filtered}
                sections={sections}
                search={search}
                isFlatMode={isFlatMode}
                displayLimit={displayLimit}
                expandedShelves={expandedShelves}
                onToggleShelf={toggleShelfExpand}
                onOpenMovie={openMovie}
                onLogin={handleLogin}
                onClearFilters={clearFilters}
                onReload={handleReload}
                activeStatusTab={activeStatusTab}
                onSelectStatusTab={handleSelectStatusTab}
                totalLibrarySize={() => watchlist().length}
              />
            </Show>
          </Show>
        </div>
      </div>

      <LibraryDialogs
        show={showFilter}
        filters={filters}
        setFilters={(v) => {
          setFilters(v);
          setDisplayLimit(20);
        }}
        uniqueGenres={uniqueGenres}
        uniquePlatforms={uniquePlatforms}
        uniqueTags={uniqueTags}
        uniqueTagsPlus={uniqueTagsPlus}
        refreshTagVocab={refreshTagVocab}
        ottLoading={ottLoading}
        debugRawKeys={debugRawKeys}
        watchlistSize={() => watchlist().length}
        fetchState={fetchState}
        fetchError={fetchError}
        effectRunId={effectRunId}
        chunkProgress={chunkProgress}
        cacheSource={cacheSource}
        onClose={() => setShowFilter(false)}
        onClear={() => {
          clearFilters();
          setDisplayLimit(20);
        }}
      />
    </PageContainer>
  );
}
