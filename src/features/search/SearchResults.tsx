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
 * Phase 5 — Anime Fallback:
 *   When the main TMDB search returns 0 results AND the query looks
 *   anime-related, the parent (useSearch) fires an AniList search and
 *   passes the results as `animeResults`. We render them as a separate
 *   "Anime Results" section so the user can distinguish them from TMDB.
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
  /** Phase 5 — AniList fallback results (TMDB-shaped). */
  animeResults?: Accessor<TMDBTitle[]>;
  /** Phase 5 — true while the AniList fallback is in flight. */
  animeLoading?: Accessor<boolean>;
}

export default function SearchResults(props: SearchResultsProps) {
  const hasAnimeResults = () =>
    (props.animeResults?.() ?? []).length > 0;
  const showAnimeLoading = () =>
    !!props.animeLoading?.() && !hasAnimeResults();
  const showEmptyState = () =>
    props.results().totalCount === 0 && !hasAnimeResults() && !showAnimeLoading();

  return (
    <Show
      when={!props.error()}
      fallback={<SearchEmptyState error={props.error()} />}
    >
      <Show when={!props.loading()} fallback={<SearchLoading count={4} />}>
        {/* TMDB results — Movies + Series */}
        <Show when={props.results().totalCount > 0}>
          {/* Movies */}
          <Show when={props.results().movies.length > 0}>
            <section class="search-section">
              <div class="search-section-label">
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "12px", color: "var(--p)" }}
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
                  style={{ "font-size": "12px", color: "var(--p)" }}
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

        {/* Anime fallback (Phase 5) — shown when TMDB returns 0 results
            but AniList found anime. Rendered as its own labeled section
            so the user can tell the results came from a different source. */}
        <Show when={hasAnimeResults()}>
          <section class="search-section">
            <div class="search-section-label">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "12px", color: "var(--p)" }}
                aria-hidden="true"
              >
                whatshot
              </span>
              Anime Results ({props.animeResults!().length})
            </div>
            <div class="search-results-list">
              <For each={props.animeResults!()}>
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

        {/* Anime fallback loading state — shown briefly while AniList
            is being queried, only when TMDB returned nothing. */}
        <Show when={showAnimeLoading()}>
          <section class="search-section">
            <div class="search-section-label">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "12px", color: "var(--p)" }}
                aria-hidden="true"
              >
                whatshot
              </span>
              Searching AniList…
            </div>
            <SearchLoading count={3} />
          </section>
        </Show>

        {/* Empty state — only when BOTH TMDB and AniList returned nothing. */}
        <Show when={showEmptyState()}>
          <SearchEmptyState query={props.query()} />
        </Show>
      </Show>
    </Show>
  );
}
