// src/features/discover/components/DiscoverRail.tsx
import { For, Show, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";

interface DiscoverRailProps {
  titles: TMDBTitle[];
  onSelect: (title: TMDBTitle) => void;
  emptyText?: string;
}

/**
 * DiscoverRail — a horizontal scroll-snap carousel of movie/TV posters.
 *
 * Reuses the existing .search-rail CSS (same visual language as the
 * Search page's trending rail). Each card shows:
 *   - Poster (w185)
 *   - Title (2-line clamp)
 *   - Year + rating meta
 *
 * Performance:
 *   - All images use loading="lazy" + decoding="async"
 *   - No individual TMDB fetches — all data comes from the parent
 *   - Scroll-snap-type: x proximity for natural mobile scrolling
 */
const DiscoverRail: Component<DiscoverRailProps> = (props) => {
  return (
    <Show
      when={props.titles.length > 0}
      fallback={
        <p class="type-body-soft" style={{ "text-align": "center", padding: "var(--sp-6)" }}>
          {props.emptyText ?? "No titles available."}
        </p>
      }
    >
      <div class="search-rail" role="list">
        <For each={props.titles.slice(0, 20)}>
          {(title) => (
            <button
              type="button"
              class="search-rail-card focus-ring"
              onClick={() => props.onSelect(title)}
              role="listitem"
              aria-label={`${title.title || title.name || "Untitled"}${title.release_date || title.first_air_date ? `, ${(title.release_date || title.first_air_date || "").split("-")[0]}` : ""}`}
            >
              <div class="search-rail-poster">
                <Show
                  when={title.poster_path}
                  fallback={
                    <div class="search-rail-poster-fallback">
                      <span class="material-symbols-outlined" style={{ "font-size": "24px", color: "var(--text-dim)" }} aria-hidden="true">
                        movie
                      </span>
                    </div>
                  }
                >
                  <img
                    src={tmdbImage(title.poster_path, "w185")}
                    class="search-rail-poster-img"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                </Show>
              </div>
              <p class="search-rail-title">{title.title || title.name || "Untitled"}</p>
              <p class="search-rail-meta">
                {(title.release_date || title.first_air_date || "").split("-")[0] || ""}
                {title.vote_average ? ` · ★ ${title.vote_average.toFixed(1)}` : ""}
              </p>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
};

export default DiscoverRail;
