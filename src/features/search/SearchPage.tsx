import { For, Show, type Component } from "solid-js";
import { useGlobalSearch } from "~/shared/contexts/SearchContext";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useDiscoverActions } from "~/features/discover/useDiscoverActions";
import PageContainer from "~/shared/ui/PageContainer";
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
  const { watchlist, isGuest } = useUserLibrary();
  const { handleOpenTitle, addToVault } = useDiscoverActions({
    watchlist,
    isGuest
  });

  const submitQuery = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    search.runSearchNow(trimmed);
    search.commitSearch(trimmed);
  };

  const openTitle = (title: Parameters<typeof handleOpenTitle>[0]) => {
    handleOpenTitle(title);
  };

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

        <form
          class="search-bar-form search-page-form"
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
                    <For each={search.trending().slice(0, 8)}>
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
    </PageContainer>
  );
};

export default SearchPage;
