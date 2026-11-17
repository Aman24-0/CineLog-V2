// src/features/search/SearchResultCard.tsx
import { Show } from "solid-js";
import { A } from "@solidjs/router";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { titleDetailPath } from "~/shared/utils/titleRoutes";
import type { TMDBTitle } from "~/shared/types";
import { titleOf, yearOf, imdbOf } from "./searchConstants";

/**
 * SearchResultCard — one poster card in the Search page's CARD (grid) view.
 *
 * Mirrors SearchResultRow's contract so the page can switch layouts without
 * touching the data layer:
 *   • the whole poster + title block is a router <A> (tap → detail page)
 *   • the add-to-library "+" sits at the BOTTOM of the card, full width,
 *     so it is a big, obvious target instead of a small circle
 *   • an in-library title shows a "In library" strip instead of the "+"
 */
export interface SearchResultCardProps {
  title: TMDBTitle;
  inVault: boolean;
  /** Called on tap before the router navigates (search session bookkeeping). */
  onOpen: () => void;
  onAdd: () => void;
}

export default function SearchResultCard(props: SearchResultCardProps) {
  const year = () => yearOf(props.title);
  const rating = () => imdbOf(props.title);

  return (
    <div
      class={`search-card${props.inVault ? " search-card-vault" : ""}`}
      data-media-type={props.title.media_type}
    >
      <A
        href={titleDetailPath(props.title)}
        class="search-card-link focus-ring"
        onClick={() => props.onOpen()}
        aria-label={`${titleOf(props.title)}${
          year() ? `, ${year()}` : ""
        } — open details`}
      >
        <div class="search-card-poster">
          <Show
            when={props.title.poster_path || props.title.backdrop_path}
            fallback={
              <div class="search-card-poster-fallback" aria-hidden="true">
                <span class="material-symbols-outlined">movie</span>
                <span class="search-card-poster-fallback-label">No poster</span>
              </div>
            }
          >
            <img
              src={tmdbImage(
                props.title.poster_path || props.title.backdrop_path,
                "w342"
              )}
              alt=""
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </Show>
          <Show when={props.title.media_type === "tv"}>
            <span class="search-card-type" aria-hidden="true">
              Series
            </span>
          </Show>
        </div>

        <div class="search-card-info">
          <p class="search-card-title">{titleOf(props.title)}</p>
          <p class="search-card-meta">
            {year() ? `${year()} · ` : ""}
            <Show when={rating()}>
              <span style={{ color: "#f5c518" }}>★ {rating()}</span>
            </Show>
          </p>
        </div>
      </A>

      <Show
        when={!props.inVault}
        fallback={
          <span class="search-card-action search-card-action-vault">
            <span class="material-symbols-outlined" aria-hidden="true">
              check
            </span>
            In library
          </span>
        }
      >
        <button
          type="button"
          class="search-card-action focus-ring"
          onClick={() => props.onAdd()}
          aria-label={`Add ${titleOf(props.title)} to your library`}
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            add
          </span>
          Add
        </button>
      </Show>
    </div>
  );
}
