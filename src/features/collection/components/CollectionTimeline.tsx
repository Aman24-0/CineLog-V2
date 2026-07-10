// src/features/collection/components/CollectionTimeline.tsx
import { For, Show, type Accessor } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";

/**
 * CollectionTimeline — release-order list of titles in the collection.
 *
 * Each row shows: number badge, poster (with status indicator), title,
 * year + type + IMDb rating, optional user rating, and a "+" missing badge
 * for titles not in the vault. Tapping a row calls onOpenTitle.
 */
export interface CollectionTimelineItem {
  title: TMDBTitle;
  inVault: boolean;
  status: string | null;
  rating: number | null;
  isTrigger: boolean;
}

export interface CollectionTimelineProps {
  items: Accessor<CollectionTimelineItem[]>;
  onOpenTitle: (t: TMDBTitle) => void;
}

const titleOf = (t: TMDBTitle) => t.title || t.name || "Untitled";
const yearOf = (t: TMDBTitle) => (t.release_date || t.first_air_date || "").split("-")[0] || "";
const imdbOf = (t: TMDBTitle) => (t.vote_average ? t.vote_average.toFixed(1) : null);

export default function CollectionTimeline(props: CollectionTimelineProps) {
  return (
    <div class="collection-timeline-section">
      <div class="collection-timeline-label">
        <span
          class="material-symbols-outlined"
          style={{"font-size":"12px","color":"var(--p)"}}
          aria-hidden="true"
        >
          timeline
        </span>
        Timeline
      </div>
      <div class="collection-timeline" role="list">
        <For each={props.items()}>
          {(item, i) => (
            <button
              type="button"
              class={`collection-timeline-item${
                item.isTrigger ? " collection-timeline-current" : ""
              }${!item.inVault ? " collection-timeline-missing" : ""}`}
              role="listitem"
              onClick={() => props.onOpenTitle(item.title)}
              aria-label={`${titleOf(item.title)}${
                yearOf(item.title) ? `, ${yearOf(item.title)}` : ""
              } — open details`}
            >
              {/* Number badge */}
              <div class="collection-timeline-number">{i() + 1}</div>
              {/* Poster */}
              <div class="collection-timeline-poster">
                <Show
                  when={item.title.poster_path || item.title.backdrop_path}
                  fallback={
                    <div class="collection-timeline-poster-fallback" aria-hidden="true">
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
                    src={tmdbImage(item.title.poster_path || item.title.backdrop_path, "w185")}
                    class="collection-timeline-poster-img"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                  />
                </Show>
                {/* Status indicator */}
                <Show when={item.status === "Completed"}>
                  <span
                    class="collection-timeline-status collection-timeline-status-completed"
                    aria-label="Completed"
                  >
                    <span
                      class="material-symbols-outlined"
                      style={{"font-size":"10px"}}
                      aria-hidden="true"
                    >
                      check
                    </span>
                  </span>
                </Show>
                <Show when={item.status === "Watching"}>
                  <span
                    class="collection-timeline-status collection-timeline-status-watching"
                    aria-label="Watching"
                  />
                </Show>
                <Show when={item.inVault && !item.status}>
                  <span
                    class="collection-timeline-status collection-timeline-status-planned"
                    aria-label="In watchlist"
                  />
                </Show>
              </div>
              {/* Info */}
              <div class="collection-timeline-info">
                <p class="collection-timeline-title">{titleOf(item.title)}</p>
                <p class="collection-timeline-meta">
                  {yearOf(item.title) ? `${yearOf(item.title)} · ` : ""}
                  {item.title.media_type === "tv" ? "Series" : "Movie"}
                  <Show when={imdbOf(item.title)}>
                    {" · "}
                    <span style={{"color":"#f5c518"}}>★ {imdbOf(item.title)}</span>
                  </Show>
                </p>
                <Show when={item.rating && item.rating > 0}>
                  <p class="collection-timeline-user-rating">
                    <span style={{"color":"var(--p)"}}>★ Your {item.rating}</span>
                  </p>
                </Show>
              </div>
              {/* Missing badge */}
              <Show when={!item.inVault}>
                <span class="collection-timeline-missing-badge">+</span>
              </Show>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
