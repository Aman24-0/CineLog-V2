// src/features/discover/components/DiscoverRail.tsx
//
// DiscoverRail — horizontal scroll-snap carousel of movie/TV posters.
//
// Premium Phase 4 upgrade:
//   Each card now shows a glass rating badge (top-right) when vote_average
//   is present, plus a subtle glass overlay gradient for depth. Hover/tap
//   animations are smoother and the typography is refined.
//
// Reuses the existing .search-rail CSS (same visual language as the
// Search page's trending rail). Each card shows:
//   - Poster (w185 → upgraded to w342 for premium sharpness on retina)
//   - Glass rating badge (top-right) when vote_average > 0
//   - Title (2-line clamp)
//   - Year + rating meta
//
// Performance:
//   - All images use loading="lazy" + decoding="async"
//   - No individual TMDB fetches — all data comes from the parent
//   - Scroll-snap-type: x proximity for natural mobile scrolling
//
// Empty states:
//   - When `titles` is empty AND `error` is provided, shows a Retry
//     button that calls `onRetry`.
//   - When `titles` is empty and no error, shows `emptyText` (or a
//     default "No titles available." message).
//

import { For, Show, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";
import DiscoverEmptyState from "./DiscoverEmptyState";

interface DiscoverRailProps {
  titles: TMDBTitle[];
  onSelect: (title: TMDBTitle) => void;
  /** Custom empty-state message. Defaults to "No titles available." */
  emptyText?: string;
  /** Optional empty-state icon (Material Symbols name). */
  emptyIcon?: string;
  /** Optional hint shown under the empty message. */
  emptyHint?: string;
  /** If provided AND titles is empty, renders a Retry button. */
  onRetry?: () => void;
}

const DiscoverRail: Component<DiscoverRailProps> = (props) => {
  return (
    <Show
      when={props.titles.length > 0}
      fallback={
        <DiscoverEmptyState
          icon={props.emptyIcon ?? "movie"}
          message={props.emptyText ?? "No titles available."}
          hint={props.emptyHint}
          onRetry={props.onRetry}
        />
      }
    >
      <div class="search-rail" role="list">
        <For each={props.titles.slice(0, 20)}>
          {(title) => {
            const year = () =>
              (title.release_date || title.first_air_date || "").split("-")[0] || "";
            const rating = () =>
              title.vote_average ? title.vote_average.toFixed(1) : null;
            const isVault = () => !!(title as TMDBTitle & { _inVault?: boolean })._inVault;

            return (
              <button
                type="button"
                class="search-rail-card focus-ring"
                onClick={() => props.onSelect(title)}
                role="listitem"
                aria-label={`${title.title || title.name || "Untitled"}${year() ? `, ${year()}` : ""}${rating() ? `, rated ${rating()}` : ""}`}
              >
                <div class="search-rail-poster">
                  <Show
                    when={title.poster_path}
                    fallback={
                      <div class="search-rail-poster-fallback">
                        <span class="material-symbols-outlined" style={{ "font-size": "28px", color: "var(--text-dim)" }} aria-hidden="true">
                          movie
                        </span>
                      </div>
                    }
                  >
                    <img
                      src={tmdbImage(title.poster_path, "w342")}
                      class="search-rail-poster-img"
                      loading="lazy"
                      decoding="async"
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  </Show>

                  {/* Premium glass rating badge — top-right corner */}
                  <Show when={rating()}>
                    <span class="search-rail-rating" aria-label={`Rated ${rating()}`}>
                      <span class="material-symbols-outlined" style={{ "font-size": "10px", "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }} aria-hidden="true">star</span>
                      {rating()}
                    </span>
                  </Show>

                  {/* Premium glass vault status badge — top-left corner */}
                  <Show when={isVault()}>
                    <span class="search-rail-status" aria-label="In your vault">
                      <span class="material-symbols-outlined" style={{ "font-size": "10px", "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }} aria-hidden="true">check_circle</span>
                      In Vault
                    </span>
                  </Show>
                </div>
                <p class="search-rail-title">{title.title || title.name || "Untitled"}</p>
                <p class="search-rail-meta">
                  <Show when={year()}>
                    <span>{year()}</span>
                  </Show>
                  <Show when={year() && title.media_type}>
                    <span style={{ color: "var(--text-dim)" }}>·</span>
                  </Show>
                  <Show when={title.media_type}>
                    <span>{title.media_type === "tv" ? "Series" : "Movie"}</span>
                  </Show>
                </p>
              </button>
            );
          }}
        </For>
      </div>
    </Show>
  );
};

export default DiscoverRail;
