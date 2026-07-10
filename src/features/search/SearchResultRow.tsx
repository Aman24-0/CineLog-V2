// src/features/search/SearchResultRow.tsx
import { Show } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";
import { titleOf, yearOf, imdbOf } from "./searchConstants";

/**
 * SearchResultRow — a single horizontal result row used by both the text
 * search results and the genre browse list. Renders poster + title + year
 * + type + IMDb rating, plus a vault-aware action button (add-to-vault
 * pill when in vault, + button when not).
 */
export interface SearchResultRowProps {
  title: TMDBTitle;
  inVault: boolean;
  onOpen: () => void;
  onAdd: () => void;
}

export default function SearchResultRow(props: SearchResultRowProps) {
  return (
    <div
      class={`search-result-row${props.inVault ? " search-result-row-vault" : ""}`}
    >
      <button
        type="button"
        class="search-result-main focus-ring"
        onClick={() => props.onOpen()}
        aria-label={`${titleOf(props.title)}${
          yearOf(props.title) ? `, ${yearOf(props.title)}` : ""
        } — open details`}
      >
        {/* Poster thumbnail */}
        <div class="search-result-poster">
          <Show
            when={props.title.poster_path || props.title.backdrop_path}
            fallback={
              <div class="search-result-poster-fallback" aria-hidden="true">
                <span
                  class="material-symbols-outlined"
                  style={{"font-size":"20px","color":"var(--text-dim)"}}
                  aria-hidden="true"
                >
                  movie
                </span>
              </div>
            }
          >
            <img
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              src={tmdbImage(
                props.title.poster_path || props.title.backdrop_path,
                "w185",
              )}
              class="search-result-poster-img"
              loading="lazy"
              decoding="async"
              alt=""
              aria-hidden="true"
            />
          </Show>
        </div>

        {/* Info */}
        <div class="search-result-info">
          <p class="search-result-title">{titleOf(props.title)}</p>
          <p class="search-result-meta">
            {yearOf(props.title) ? `${yearOf(props.title)} · ` : ""}
            {props.title.media_type === "tv" ? "Series" : "Movie"}
            <Show when={imdbOf(props.title)}>
              {" · "}
              <span style={{"color":"#f5c518"}}>★ {imdbOf(props.title)}</span>
            </Show>
          </p>
        </div>
      </button>

      {/* Action — vault-aware */}
      <Show
        when={!props.inVault}
        fallback={
          <span
            class="v2-pill v2-pill-accent search-result-pill"
            aria-label="In your watchlist"
          >
            <span
              class="material-symbols-outlined"
              style={{"font-size":"10px"}}
              aria-hidden="true"
            >
              check
            </span>
            In Watchlist
          </span>
        }
      >
        <button
          type="button"
          class="search-result-add focus-ring"
          onClick={() => props.onAdd()}
          aria-label={`Add ${titleOf(props.title)} to your watchlist`}
        >
          <span
            class="material-symbols-outlined"
            style={{"font-size":"16px"}}
            aria-hidden="true"
          >
            add
          </span>
        </button>
      </Show>
    </div>
  );
}
