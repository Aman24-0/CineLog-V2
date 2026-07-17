// src/features/search/SearchResults.tsx
import { For, Show, type Accessor } from "solid-js";
import type { TMDBTitle } from "~/shared/types";
import SearchResultRow from "./SearchResultRow";
import SearchEmptyState from "./SearchEmptyState";
import SearchLoading from "./SearchLoading";

/**
 * SearchResults — active query results (text search, not genre browse).
 *
 * Renders loading skeletons while in flight, an empty state when no
 * results, or two grouped sections (Movies / Series) when results exist.
 *
 * Accessibility: The container has aria-live="polite" so screen readers
 * announce when search results update.
 */
export interface SearchResultsProps {
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  query: Accessor<string>;
  results: Accessor<{
    movies: TMDBTitle[];
    series: TMDBTitle[];
    totalCount: number;
  }>;
  isInVault: (t: TMDBTitle) => boolean;
  onOpenTitle: (t: TMDBTitle) => void;
  onAddToVault: (t: TMDBTitle) => void;
}

export default function SearchResults(props: SearchResultsProps) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      aria-busy={props.loading()}
      role="region"
      aria-label="Search results"
    >
      <Show
        when={!props.error()}
        fallback={<SearchEmptyState error={props.error()} />}
      >
        <Show when={!props.loading()} fallback={<SearchLoading count={4} />}>
          <Show
            when={props.results().totalCount > 0}
            fallback={<SearchEmptyState query={props.query()} />}
          >
            {/* Movies */}
            <Show when={props.results().movies.length > 0}>
              <section class="search-section">
                <div class="search-section-label">
                  <span
                    class="material-symbols-outlined"
                    style={{"font-size":"12px","color":"var(--p)"}}
                    aria-hidden="true"
                  >
                    movie
                  </span>
                  Movies ({props.results().movies.length})
                </div>
                <div class="search-results-list">
                  <For each={props.results().movies}>
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
              </section>
            </Show>

            {/* Series */}
            <Show when={props.results().series.length > 0}>
              <section class="search-section">
                <div class="search-section-label">
                  <span
                    class="material-symbols-outlined"
                    style={{"font-size":"12px","color":"var(--p)"}}
                    aria-hidden="true"
                  >
                    tv
                  </span>
                  Series ({props.results().series.length})
                </div>
                <div class="search-results-list">
                  <For each={props.results().series}>
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
              </section>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
