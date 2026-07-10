// src/features/search/SearchFilters.tsx
import { For, Show, type Accessor } from "solid-js";
import type { TMDBTitle } from "~/shared/types";
import SearchResultRow from "./SearchResultRow";
import SearchLoading from "./SearchLoading";
import type { GenreBrowseState } from "./useSearch";

/**
 * SearchFilters — genre browse mode UI.
 *
 * Flat paginated list of titles in the selected genre. Uses TMDB discover
 * by genre ID (not text search), so "Horror" returns actual Horror films.
 * Infinite scroll via the load-more trigger at the bottom.
 */
export interface SearchFiltersProps {
  genreBrowse: Accessor<GenreBrowseState>;
  isInVault: (t: TMDBTitle) => boolean;
  onClearGenre: () => void;
  onLoadMore: () => void;
  onOpenTitle: (t: TMDBTitle) => void;
  onAddToVault: (t: TMDBTitle) => void;
}

export default function SearchFilters(props: SearchFiltersProps) {
  return (
    <section class="search-section">
      {/* Genre header with back button */}
      <div class="search-genre-header">
        <button
          type="button"
          class="search-genre-back"
          onClick={props.onClearGenre}
          aria-label="Back to search"
        >
          <span
            class="material-symbols-outlined"
            style={{"font-size":"18px"}}
            aria-hidden="true"
          >
            arrow_back
          </span>
        </button>
        <div class="search-genre-header-text">
          <p class="search-genre-eyebrow">Browsing</p>
          <h2 class="search-genre-title">{props.genreBrowse().genre}</h2>
        </div>
      </div>

      {/* Results — flat list (movies + series interleaved), vault-aware */}
      <Show
        when={!props.genreBrowse().loading || props.genreBrowse().items.length > 0}
        fallback={<SearchLoading count={6} />}
      >
        <div class="search-results-list">
          <For each={props.genreBrowse().items}>
            {(t) => (
              <SearchResultRow
                title={t}
                inVault={props.isInVault(t)}
                onOpen={() => props.onOpenTitle(t)}
                onAdd={() => props.onAddToVault(t)}
              />
            )}
          </For>
        </div>

        {/* Infinite scroll trigger + loading more indicator */}
        <Show when={props.genreBrowse().hasMore}>
          <div
            class="search-load-more"
            onClick={() => props.onLoadMore()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.onLoadMore();
              }
            }}
            role="button"
            tabindex={0}
            aria-label="Load more results"
          >
            <Show
              when={!props.genreBrowse().loading}
              fallback={
                <span class="search-load-more-loading">
                  <span
                    class="material-symbols-outlined animate-spin"
                    style={{"font-size":"16px"}}
                    aria-hidden="true"
                  >
                    progress_activity
                  </span>
                  Loading more…
                </span>
              }
            >
              <span class="search-load-more-text">Load more</span>
            </Show>
          </div>
        </Show>

        {/* End of results */}
        <Show
          when={!props.genreBrowse().hasMore && props.genreBrowse().items.length > 0}
        >
          <p class="search-end-of-results type-micro">
            You've reached the end of {props.genreBrowse().genre}
          </p>
        </Show>
      </Show>
    </section>
  );
}
