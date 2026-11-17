// src/features/search/SearchResultRow.tsx
import { Show } from "solid-js";
import { A } from "@solidjs/router";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { titleDetailPath } from "~/shared/utils/titleRoutes";
import type { TMDBTitle } from "~/shared/types";
import { titleOf, yearOf, imdbOf } from "./searchConstants";

/**
 * SearchResultRow — a single horizontal result row (list view).
 *
 * NAVIGATION FIX: the tappable area used to be a <button> whose onClick
 * called navigate() in JS. On mobile that tap was frequently swallowed
 * (the row sits inside a `backdrop-filter` glass surface, and nothing
 * navigates if the JS handler doesn't fire), which is why tapping a result
 * "did nothing". It is now a real router <A> with an href, so the row
 * navigates even if the click handler never runs — and the row is
 * middle-clickable / long-pressable like any normal link.
 */
export interface SearchResultRowProps {
  title: TMDBTitle;
  inVault: boolean;
  /** Called on tap before the router navigates (search session bookkeeping). */
  onOpen: () => void;
  onAdd: () => void;
}

export default function SearchResultRow(props: SearchResultRowProps) {
  return (
    <div
      class={`search-result-row${props.inVault ? " search-result-row-vault" : ""}`}
    >
      <A
        href={titleDetailPath(props.title)}
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
                  style={{ "font-size": "20px", color: "var(--text-dim)" }}
                  aria-hidden="true"
                >
                  movie
                </span>
              </div>
            }
          >
            <img
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              src={tmdbImage(
                props.title.poster_path || props.title.backdrop_path,
                "w185"
              )}
              class="search-result-poster-img"
              loading="lazy"
              decoding="async"
              alt={titleOf(props.title) || "Poster"}
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
              <span style={{ color: "#f5c518" }}>★ {imdbOf(props.title)}</span>
            </Show>
          </p>
        </div>
      </A>

      {/* Action — vault-aware */}
      <Show
        when={!props.inVault}
        fallback={
          <span
            class="v2-pill v2-pill-accent search-result-pill"
            aria-label="In your library"
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "10px" }}
              aria-hidden="true"
            >
              check
            </span>
            In Library
          </span>
        }
      >
        <button
          type="button"
          class="search-result-add focus-ring"
          onClick={() => props.onAdd()}
          aria-label={`Add ${titleOf(props.title)} to your library`}
        >
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "16px" }}
            aria-hidden="true"
          >
            add
          </span>
        </button>
      </Show>
    </div>
  );
}
