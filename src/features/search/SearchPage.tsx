import { createEffect, For, Show, type Component } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { useGlobalSearch } from "~/shared/contexts/SearchContext";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useDiscoverActions } from "~/features/discover/useDiscoverActions";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import SearchResults from "./SearchResults";
import SearchResultRow from "./SearchResultRow";

/**
 * SearchPage — the full-page search destination.
 *
 * It intentionally reuses the app-level SearchContext and the existing
 * SearchResults renderer. This keeps one query engine, one recent-search
 * history, and one vault-membership check for both the Discover search affordance
 * and the dedicated Search route.
 */
const SearchPage: Component = () => {
  const search = useGlobalSearch();
  const [searchParams, setSearchParams] = useSearchParams();
  const { watchlist, isGuest } = useUserLibrary();
  const { handleOpenTitle, addToVault } = useDiscoverActions({
    watchlist,
    isGuest
  });

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

  return (
    <PageContainer
      width="wide"
      paddingTop="var(--sp-5)"
      paddingBottom="var(--sp-12)"
    >
      {/* Search title — scrolls away naturally */}
      <div class="search-page-shell">
        <header class="search-page-header">
          <h1 class="type-display search-page-title">Search</h1>
        </header>
      </div>

      {/* Sticky search bar — a DIRECT child of PageContainer (not
          inside .search-page-shell) so position:sticky works correctly.
          The PageContainer provides the horizontal padding; the sticky
          bar extends to the full width of the scroll container. The
          glass background ensures content doesn't bleed through. */}
      <div class="search-sticky-bar">
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
              onInput={(event) => search.setQuery(event.currentTarget.value)}
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
      </div>

      {/* Content — the .search-page-shell constrains the max-width */}
      <div class="search-page-shell">

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
          />
        </Show>
      </div>

      {/* Scroll-to-top FAB — appears after the user scrolls down.
          Reuses the existing ScrollToTop component (IntersectionObserver-
          based, respects reduced-motion, safe-area-aware). Placed
          OUTSIDE the .search-page-shell so the sentinel + FAB
          position correctly relative to the page scroll container. */}
      <ScrollToTop />
    </PageContainer>
  );
};

export default SearchPage;
