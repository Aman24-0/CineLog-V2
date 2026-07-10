// src/features/search/SearchGrid.tsx
import { For, Show, type Accessor } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";
import { GENRE_PILLS, titleOf, yearOf } from "./searchConstants";

/**
 * SearchGrid — the cold-start state (no query, no genre browse).
 *
 * Three sections, all optional:
 *   1. Recent searches rail (last 8, from localStorage) — only when present
 *   2. Trending this week rail (TMDB trending, vault-aware) — only after load
 *   3. Browse by genre grid (8 genre pills → click to enter genre browse)
 */
export interface SearchGridProps {
  recentSearches: Accessor<string[]>;
  trending: Accessor<TMDBTitle[]>;
  trendingLoading: Accessor<boolean>;
  isInVault: (t: TMDBTitle) => boolean;
  onRecentClick: (q: string) => void;
  onRemoveRecent: (q: string) => void;
  onClearRecent: () => void;
  onOpenTitle: (t: TMDBTitle) => void;
  onBrowseGenre: (label: string) => void;
}

export default function SearchGrid(props: SearchGridProps) {
  return (
    <div class="search-cold-start">
      {/* Recent searches */}
      <Show when={props.recentSearches().length > 0}>
        <section class="search-section">
          <div class="search-section-label">
            <span
              class="material-symbols-outlined"
              style={{"font-size":"12px","color":"var(--p)"}}
              aria-hidden="true"
            >
              history
            </span>
            Recent Searches
            <button
              type="button"
              class="search-section-action"
              onClick={props.onClearRecent}
              aria-label="Clear all recent searches"
            >
              Clear
            </button>
          </div>
          <div class="search-recent-list">
            <For each={props.recentSearches()}>
              {(q) => (
                <button
                  type="button"
                  class="search-recent-chip"
                  onClick={() => props.onRecentClick(q)}
                  aria-label={`Search for: ${q}`}
                >
                  <span>{q}</span>
                  <span
                    class="material-symbols-outlined search-recent-remove"
                    style={{"font-size":"14px"}}
                    aria-hidden="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onRemoveRecent(q);
                    }}
                  >
                    close
                  </span>
                </button>
              )}
            </For>
          </div>
        </section>
      </Show>

      {/* Trending this week */}
      <Show when={!props.trendingLoading()}>
        <section class="search-section">
          <div class="search-section-label">
            <span
              class="material-symbols-outlined"
              style={{"font-size":"12px","color":"var(--p)"}}
              aria-hidden="true"
            >
              trending_up
            </span>
            Trending This Week
          </div>
          <div class="search-rail">
            <For each={props.trending()}>
              {(t) => (
                <button
                  type="button"
                  class="search-rail-card"
                  onClick={() => props.onOpenTitle(t)}
                  aria-label={`${titleOf(t)}${
                    yearOf(t) ? `, ${yearOf(t)}` : ""
                  } — open details`}
                >
                  <div
                    class={`search-rail-poster${
                      props.isInVault(t) ? " search-rail-poster-vault" : ""
                    }`}
                  >
                    <Show
                      when={t.poster_path || t.backdrop_path}
                      fallback={
                        <div class="search-rail-poster-fallback" aria-hidden="true">
                          <span
                            class="material-symbols-outlined"
                            style={{"font-size":"24px","color":"var(--text-dim)"}}
                            aria-hidden="true"
                          >
                            movie
                          </span>
                        </div>
                      }
                    >
                      <img
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                        src={tmdbImage(t.poster_path || t.backdrop_path, "w342")}
                        class="search-rail-poster-img"
                        loading="lazy"
                        decoding="async"
                        alt=""
                        aria-hidden="true"
                      />
                    </Show>
                    <Show when={props.isInVault(t)}>
                      <span class="search-rail-vault-dot" aria-label="In your watchlist" />
                    </Show>
                  </div>
                  <p class="search-rail-title">{titleOf(t)}</p>
                  <p class="search-rail-meta">
                    {yearOf(t) ? `${yearOf(t)} · ` : ""}
                    {t.media_type === "tv" ? "Series" : "Movie"}
                  </p>
                </button>
              )}
            </For>
          </div>
        </section>
      </Show>

      {/* Browse by genre */}
      <section class="search-section">
        <div class="search-section-label">
          <span
            class="material-symbols-outlined"
            style={{"font-size":"12px","color":"var(--p)"}}
            aria-hidden="true"
          >
            grid_view
          </span>
          Browse by Genre
        </div>
        <div class="search-genre-grid">
          <For each={GENRE_PILLS}>
            {(g) => (
              <button
                type="button"
                class="search-genre-pill"
                onClick={() => props.onBrowseGenre(g.label)}
                aria-label={`Browse ${g.label} titles`}
              >
                <span
                  class="material-symbols-outlined search-genre-icon"
                  aria-hidden="true"
                >
                  {g.icon}
                </span>
                {g.label}
              </button>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
