// src/features/watchlist/WatchlistView.tsx
import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useModalState } from "~/shared/hooks/useModalState";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "./useVault";
import { useVaultSections } from "./useVaultSections";
import { useVaultFiltering } from "./useVaultFiltering";
import WatchlistHeader from "./components/WatchlistHeader";
import WatchlistStats from "./components/WatchlistStats";
import WatchlistGrid from "./components/WatchlistGrid";
import WatchlistDialogs from "./components/WatchlistDialogs";
import EmptyState from "./components/EmptyState";
import LoadingSkeleton from "./components/LoadingSkeleton";

/**
 * WatchlistView — orchestration only.
 *
 * Owns top-level state (view mode, display limit, expanded shelves, filter
 * drawer visibility) and composes the section components:
 *   - WatchlistHeader (sticky header with search + filter tabs + chips)
 *   - WatchlistStats (result count context bar)
 *   - WatchlistGrid (grid or timeline view)
 *   - WatchlistDialogs (filter drawer)
 *
 * Filter logic lives in `useVaultFiltering`; section shelf logic lives in
 * `useVaultSections`. This component just wires them together.
 */
export default function WatchlistView() {
  const { openTitle } = useModalState();
  const { openAuthModal } = useAuthModal();
  const { watchlist, loading, isGuest, error } = useVault();

  const [showFilter, setShowFilter] = createSignal(false);
  const [displayLimit, setDisplayLimit] = createSignal(20);
  const [viewMode, setViewModeInternal] = createSignal<"grid" | "timeline">("grid");
  const [expandedShelves, setExpandedShelves] = createSignal<Set<string>>(new Set());

  // Deferred view-mode switch for INP optimization.
  //
  // When the user taps a view-toggle button, we want the button's
  // active state to paint IMMEDIATELY (so the user sees feedback) and
  // the heavy view swap (re-rendering 100+ cards) to happen on the
  // NEXT animation frame. This keeps the Interaction-to-Next-Paint
  // under 50ms instead of 100-280ms.
  //
  // How it works:
  //   1. User clicks the toggle button
  //   2. setViewMode() schedules the state change via requestAnimationFrame
  //   3. The browser paints the current frame (button shows pressed state)
  //   4. On the next frame, viewMode() updates and Solid re-renders the grid
  //
  // Without this, the click handler blocks for 100-280ms while Solid
  // synchronously destroys the old view and mounts the new one.
  const setViewMode = (mode: "grid" | "timeline") => {
    if (viewMode() === mode) return;
    requestAnimationFrame(() => setViewModeInternal(mode));
  };

  const filtering = useVaultFiltering({ watchlist, viewMode });
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
  } = filtering;

  // Infinite scroll — bump display limit when user nears the bottom.
  const handleScroll = () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      setDisplayLimit((prev) => prev + 20);
    }
  };

  onMount(() => {
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
    flatMode: isFlatMode,
  });

  const handleClearStatusTab = () => {
    setActiveStatusTab("all");
    setFilters({ ...filters(), status: "all" });
  };

  const handleSelectStatusTab = (status: string) => {
    setActiveStatusTab(status);
    if (status === "all") {
      setFilters({ ...filters(), status: "all" });
    } else {
      setFilters({ ...filters(), status });
    }
  };

  return (
    <PageContainer width="wide" paddingBottom="var(--sp-12)">
      <ScrollToTop />

      <WatchlistHeader
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
        filters={filters}
        setFilters={setFilters}
      />

      <WatchlistStats
        isFlatMode={isFlatMode}
        loading={loading}
        filteredCount={() => filtered().length}
        search={search}
        activeStatusTab={activeStatusTab}
        onClearStatusTab={handleClearStatusTab}
      />

      <Show
        when={!loading()}
        fallback={<LoadingSkeleton />}
      >
        <Show
          when={!error()}
          fallback={
            <EmptyState
              isGuest={false}
              onLogin={() => {}}
              title="Error Loading Watchlist"
              message={error() || "An unknown error occurred."}
              actionText="Reload Page"
              onAction={handleReload}
            />
          }
        >
          <WatchlistGrid
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
          />
        </Show>
      </Show>

      <WatchlistDialogs
        show={showFilter}
        filters={filters}
        setFilters={(v) => {
          setFilters(v);
          setDisplayLimit(20);
        }}
        uniqueGenres={uniqueGenres}
        uniquePlatforms={uniquePlatforms}
        uniqueTags={uniqueTags}
        onClose={() => setShowFilter(false)}
        onClear={() => {
          clearFilters();
          setDisplayLimit(20);
        }}
      />
    </PageContainer>
  );
}
