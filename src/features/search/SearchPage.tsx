import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  type Component
} from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { useGlobalSearch } from "~/shared/contexts/SearchContext";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useDiscoverActions } from "~/features/discover/useDiscoverActions";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import SearchResults, { type SearchTab } from "./SearchResults";
import SearchResultRow from "./SearchResultRow";
import {
  loadViewMode,
  saveViewMode,
  type SearchViewMode
} from "./searchViewMode";

/** How many results the active tab reveals per scroll batch. */
const PAGE_SIZE = 10;

/**
 * SearchPage — the full-page search destination.
 *
 * Layout (v3):
 *   • search bar + a list/card view toggle on the same row
 *   • three tabs directly under the bar — Movies / Series / People — so the
 *     user sees exactly the kind of result they want instead of one long
 *     stacked page
 *   • results page in 10 at a time as the user scrolls (TMDB pages are
 *     fetched on demand, so a query is never capped at "page 1 only")
 *
 * It reuses the app-level SearchContext so there is ONE query engine and ONE
 * recent-search history. The contextual SearchOverlay keeps the old stacked
 * layout (it passes no `activeTab`).
 */
const SearchPage: Component = () => {
  const search = useGlobalSearch();
  const [searchParams, setSearchParams] = useSearchParams();
  const { watchlist, isGuest } = useUserLibrary();
  const { handleOpenTitle, addToVault } = useDiscoverActions({
    watchlist,
    isGuest
  });

  // ── View + tab + window state ──────────────────────────────────────
  const [viewMode, setViewMode] = createSignal<SearchViewMode>(loadViewMode());
  const [activeTab, setActiveTab] = createSignal<SearchTab>("movie");
  const [visibleCount, setVisibleCount] = createSignal(PAGE_SIZE);
  const [autoLoadGuard, setAutoLoadGuard] = createSignal(0);

  const toggleViewMode = () => {
    const next: SearchViewMode = viewMode() === "list" ? "card" : "list";
    setViewMode(next);
    saveViewMode(next);
  };

  const counts = createMemo(() => {
    const r = search.results();
    return {
      movie: r.movies.length,
      tv: r.series.length,
      person: r.people.length
    };
  });

  const tabItems = createMemo(() => counts()[activeTab()]);

  let hydratedFromUrl = false;
  let skipUrlSyncOnce = false;

  createEffect(() => {
    if (hydratedFromUrl) return;

    const urlQuery =
      typeof searchParams.q === "string" ? searchParams.q.trim() : "";
    hydratedFromUrl = true;

    if (search.consumeInvalidatedSearchSession()) {
      skipUrlSyncOnce = true;
      if (urlQuery) {
        void setSearchParams({ q: undefined }, { replace: true });
      }
      return;
    }

    if (urlQuery && search.query().trim() !== urlQuery) {
      search.runSearchNow(urlQuery);
    } else if (!urlQuery && search.query()) {
      search.clearQuery();
    }
  });

  createEffect(() => {
    if (search.searchSessionInvalidated()) return;
    if (!hydratedFromUrl) return;
    if (skipUrlSyncOnce) {
      skipUrlSyncOnce = false;
      return;
    }

    const query = search.query().trim();
    const currentUrlQuery =
      typeof searchParams.q === "string" ? searchParams.q : "";

    if (query === currentUrlQuery) return;

    void setSearchParams(query ? { q: query } : { q: undefined }, {
      replace: true
    });
  });

  // A new query (or a new tab) always restarts the window at 10 results.
  createEffect(() => {
    search.debouncedQuery();
    activeTab();
    setVisibleCount(PAGE_SIZE);
  });

  // If the selected tab has nothing, jump to the first tab that does — so a
  // series-only query never lands on an empty "Movies" tab.
  createEffect(() => {
    if (!search.hasQuery()) return;
    if (search.loading()) return;
    const c = counts();
    if (c[activeTab()] > 0) return;
    if (c.movie > 0) setActiveTab("movie");
    else if (c.tv > 0) setActiveTab("tv");
    else if (c.person > 0) setActiveTab("person");
  });

  // ── Infinite scroll ────────────────────────────────────────────────
  // A sentinel below the results reveals the next 10 already-fetched items;
  // when the fetched buffer runs out it pulls the next TMDB page first.
  const requestMore = async () => {
    if (!search.hasQuery() || search.isGenreBrowse()) return;
    const items = tabItems();
    if (items === 0) return; // empty tab — nothing to extend
    if (visibleCount() < items) {
      setVisibleCount((value) => value + PAGE_SIZE);
      return;
    }
    if (!search.hasMore() || search.loadingMore() || search.loading()) return;
    // Guard against a runaway chain when the sentinel stays on screen.
    if (autoLoadGuard() >= 6) return;
    setAutoLoadGuard((value) => value + 1);
    await search.loadMore();
    setVisibleCount((value) => value + PAGE_SIZE);
  };

  // The sentinel element lives in a signal so the observer can be attached
  // and torn down inside a reactive owner (a ref callback has no owner, so
  // onCleanup there would never run and observers would leak on re-render).
  const [sentinelEl, setSentinelEl] = createSignal<HTMLDivElement | null>(null);

  createEffect(() => {
    const el = sentinelEl();
    if (!el) return;
    // SSR + jsdom have no IntersectionObserver — degrade to a no-op rather
    // than throwing while the page mounts.
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void requestMore();
        }
      },
      // Start fetching slightly before the user hits the very bottom.
      { rootMargin: "300px 0px" }
    );
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  // Reset the auto-load guard whenever the query or tab changes.
  createEffect(() => {
    search.debouncedQuery();
    activeTab();
    setAutoLoadGuard(0);
  });

  const submitQuery = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    search.runSearchNow(trimmed);
    search.commitSearch(trimmed);
  };

  const openTitle = (title: Parameters<typeof handleOpenTitle>[0]) => {
    search.beginDetailNavigation();
    handleOpenTitle(title);
  };

  const tabs: Array<{ id: SearchTab; label: string; icon: string }> = [
    { id: "movie", label: "Movies", icon: "movie" },
    { id: "tv", label: "Series", icon: "tv" },
    { id: "person", label: "People", icon: "person" }
  ];

  return (
    <PageContainer
      width="wide"
      paddingTop="var(--sp-5)"
      paddingBottom="var(--sp-12)"
    >
      <div class="search-page-shell">
        <header class="search-page-header">
          <h1 class="type-display search-page-title">Search</h1>
        </header>

        {/* Dedicated /search route sticky search bar.
            .search-page-sticky-bar is the SINGLE authoritative positioning
            rule for this bar — it owns position: sticky and the translucent
            glass background. The form inside is a transparent wrapper. */}
        <div class="search-page-sticky-bar">
          <div class="search-bar-row">
            <form
              class="search-bar-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitQuery(search.query());
              }}
            >
              <div class="search-bar">
                <span
                  class="material-symbols-outlined search-bar-icon"
                  aria-hidden="true"
                >
                  search
                </span>
                <input
                  type="search"
                  class="search-bar-input"
                  value={search.query()}
                  onInput={(event) =>
                    search.setQuery(event.currentTarget.value)
                  }
                  placeholder="Search movies, series, people, or anime…"
                  autocomplete="off"
                  spellcheck={false}
                  autofocus
                  aria-label="Search movies, series, people, or anime"
                />
                <Show when={search.query().length > 0}>
                  <button
                    type="button"
                    class="search-bar-clear focus-ring"
                    onClick={() => search.clearQuery()}
                    aria-label="Clear search"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">
                      close
                    </span>
                  </button>
                </Show>
              </div>
            </form>

            {/* List / card layout toggle — sits right beside the search bar. */}
            <button
              type="button"
              class="search-view-toggle focus-ring"
              onClick={toggleViewMode}
              aria-label={
                viewMode() === "list"
                  ? "Switch to card view"
                  : "Switch to list view"
              }
              aria-pressed={viewMode() === "card"}
              title={viewMode() === "list" ? "Card view" : "List view"}
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                {viewMode() === "list" ? "grid_view" : "view_list"}
              </span>
            </button>
          </div>

          {/* Tabs — only meaningful once there is a query. */}
          <Show when={search.hasQuery() && !search.isGenreBrowse()}>
            <div class="search-tabs" role="tablist" aria-label="Result type">
              <For each={tabs}>
                {(tab) => (
                  <button
                    type="button"
                    role="tab"
                    class={`search-tab focus-ring${
                      activeTab() === tab.id ? " search-tab-active" : ""
                    }`}
                    aria-selected={activeTab() === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span
                      class="material-symbols-outlined"
                      aria-hidden="true"
                    >
                      {tab.icon}
                    </span>
                    {tab.label}
                    <span class="search-tab-count">{counts()[tab.id]}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        <Show
          when={search.hasQuery()}
          fallback={
            <div class="search-page-cold-start">
              <Show when={search.recentSearches().length > 0}>
                <section
                  class="search-section"
                  aria-labelledby="recent-searches-title"
                >
                  <div id="recent-searches-title" class="search-section-label">
                    <span class="material-symbols-outlined" aria-hidden="true">
                      history
                    </span>
                    Recent searches
                  </div>
                  <div class="search-page-recent-list">
                    <For each={search.recentSearches()}>
                      {(recent) => (
                        <button
                          type="button"
                          class="search-page-recent-chip focus-ring"
                          onClick={() => submitQuery(recent)}
                        >
                          <span
                            class="material-symbols-outlined"
                            aria-hidden="true"
                          >
                            history
                          </span>
                          {recent}
                        </button>
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              <section class="search-section" aria-labelledby="trending-title">
                <div id="trending-title" class="search-section-label">
                  <span class="material-symbols-outlined" aria-hidden="true">
                    trending_up
                  </span>
                  Trending this week
                </div>
                <Show
                  when={!search.trendingLoading()}
                  fallback={
                    <div class="search-page-empty">
                      Loading trending titles…
                    </div>
                  }
                >
                  <div class="search-results-list">
                    <For each={search.trending().slice(0, 16)}>
                      {(title) => (
                        <SearchResultRow
                          title={title}
                          inVault={search.isInVault(title)}
                          onOpen={() => openTitle(title)}
                          onAdd={() => addToVault(title)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </section>
            </div>
          }
        >
          <Show when={!search.isGenreBrowse()}>
            <SearchResults
              loading={search.loading}
              error={search.error}
              query={search.query}
              results={search.results}
              isInVault={search.isInVault}
              onOpenTitle={openTitle}
              onAddToVault={addToVault}
              onRetry={search.retrySearch}
              animeResults={search.animeResults}
              animeLoading={search.animeLoading}
              activeTab={activeTab}
              viewMode={viewMode}
              limit={visibleCount}
            />

            {/* Infinite-scroll sentinel + status line. */}
            <Show when={!search.loading() && !search.error()}>
              <div
                ref={setSentinelEl}
                class="search-scroll-sentinel"
                aria-hidden="true"
              />
              <Show when={search.loadingMore()}>
                <div class="search-load-more" role="status">
                  <span class="search-load-more-spinner" aria-hidden="true" />
                  Loading more…
                </div>
              </Show>
              <Show
                when={
                  !search.loadingMore() &&
                  !search.hasMore() &&
                  tabItems() > 0 &&
                  visibleCount() >= tabItems()
                }
              >
                <div class="search-end-of-results">That's everything</div>
              </Show>
            </Show>
          </Show>
        </Show>
      </div>

      {/* Scroll-to-top FAB — appears after the user scrolls down. */}
      <ScrollToTop />
    </PageContainer>
  );
};

export default SearchPage;
