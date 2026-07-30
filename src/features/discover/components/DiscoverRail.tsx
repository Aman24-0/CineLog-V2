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

import { For, Show, createSignal, type Component, type JSX } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { useLazyImdbRating } from "~/shared/hooks/useLazyImdbRating";
import type { TMDBTitle } from "~/shared/types";
import DiscoverEmptyState from "./DiscoverEmptyState";

// ─── Module-level style constants ────────────────────────────────────
// DiscoverRail renders up to ~10–40 cards per rail × ~6 rails per
// Discover page, so every avoided per-card allocation compounds.
const RATING_STAR_ICON_STYLE: JSX.CSSProperties = {
  "font-size": "10px",
  "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20"
};
const POSTER_FALLBACK_ICON_STYLE: JSX.CSSProperties = {
  "font-size": "28px",
  color: "var(--text-dim)"
};
const META_DOT_STYLE: JSX.CSSProperties = { color: "var(--text-dim)" };

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
  /**
   * Optional Set of TMDB tv ids (as strings) that should render a
   * "NEW SEASON OUT" badge. Used by the personalized Discover page to
   * flag TV shows the user has in their vault but where TMDB reports
   * an unviewed active season.
   *
   * When provided, every title whose `media_type === "tv"` AND whose
   * `id` is in the set gets the badge rendered on its card.
   */
  newSeasonBadgeIds?: Set<string>;
  /**
   * Number of titles to show initially before the "Show More" card.
   * When the rail has more titles than this, a "Show More" card is
   * appended at the end of the visible rail. Clicking it reveals the
   * rest. Defaults to 10. Set to 0 or Infinity to disable expansion.
   */
  initialLimit?: number;
}

const DiscoverRail: Component<DiscoverRailProps> = (props) => {
  // Expansion state — false = show `initialLimit` items, true = show all.
  const [expanded, setExpanded] = createSignal(false);
  const limit = () => props.initialLimit ?? 10;

  // The visible slice — `limit` items when collapsed, all when expanded.
  const visibleTitles = () => {
    const all = props.titles;
    if (limit() <= 0 || expanded()) return all;
    return all.slice(0, limit());
  };

  // Whether the "Show More" card should appear.
  const hasMore = () =>
    limit() > 0 && !expanded() && props.titles.length > limit();

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
        <For each={visibleTitles()}>
          {(title) => {
            const year = () =>
              (title.release_date || title.first_air_date || "").split(
                "-"
              )[0] || "";
            // TMDB fallback rating — used while the MDBList IMDb score
            // is loading or if MDBList returns null.
            const tmdbRating = () =>
              title.vote_average ? title.vote_average.toFixed(1) : null;
            const isVault = () =>
              !!(title as TMDBTitle & { _inVault?: boolean })._inVault;
            // NEW SEASON OUT badge — shown when the parent passes a set
            // of TV ids that have an unviewed active season.
            const showNewSeasonBadge = () =>
              title.media_type === "tv" &&
              !!props.newSeasonBadgeIds &&
              props.newSeasonBadgeIds.has(String(title.id));

            // LAZY IMDb RATING — uses IntersectionObserver so the fetch
            // only fires when this card scrolls into view. Falls back to
            // TMDB's vote_average while loading or if MDBList is null.
            let cardRef: HTMLButtonElement | undefined;
            const { rating: imdbRating } = useLazyImdbRating(
              () => title.id,
              () => title.media_type,
              () => cardRef
            );
            // The effective rating shown on the badge: IMDb score when
            // available, TMDB vote_average as fallback.
            const rating = () => imdbRating() ?? tmdbRating();

            return (
              <button
                ref={cardRef}
                type="button"
                class="search-rail-card focus-ring"
                onClick={() => props.onSelect(title)}
                role="listitem"
                aria-label={`${title.title || title.name || "Untitled"}${year() ? `, ${year()}` : ""}${rating() ? `, rated ${rating()}` : ""}${showNewSeasonBadge() ? ", new season out" : ""}`}
              >
                <div class="search-rail-poster">
                  <Show
                    when={title.poster_path}
                    fallback={
                      <div class="search-rail-poster-fallback">
                        <span
                          class="material-symbols-outlined"
                          style={POSTER_FALLBACK_ICON_STYLE}
                          aria-hidden="true"
                        >
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
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </Show>

                  {/* NEW SEASON OUT badge — rendered ABOVE the rating
                      badge so it's never occluded. Only for TV titles
                      the user has in their vault with an unviewed
                      active season. */}
                  <Show when={showNewSeasonBadge()}>
                    <span
                      class="new-season-out-badge"
                      aria-label="New season out"
                    >
                      NEW SEASON
                    </span>
                  </Show>

                  {/* Premium glass rating badge — top-right corner */}
                  <Show when={rating()}>
                    <span
                      class="search-rail-rating"
                      aria-label={`Rated ${rating()}`}
                    >
                      <span
                        class="material-symbols-outlined"
                        style={RATING_STAR_ICON_STYLE}
                        aria-hidden="true"
                      >
                        star
                      </span>
                      {rating()}
                    </span>
                  </Show>

                  {/* Premium glass vault status badge — top-left corner */}
                  <Show when={isVault()}>
                    <span class="search-rail-status" aria-label="In your vault">
                      <span
                        class="material-symbols-outlined"
                        style={RATING_STAR_ICON_STYLE}
                        aria-hidden="true"
                      >
                        check_circle
                      </span>
                      In Vault
                    </span>
                  </Show>
                </div>
                <p class="search-rail-title">
                  {title.title || title.name || "Untitled"}
                </p>
                <p class="search-rail-meta">
                  <Show when={year()}>
                    <span>{year()}</span>
                  </Show>
                  <Show when={year() && title.media_type}>
                    <span style={META_DOT_STYLE}>·</span>
                  </Show>
                  <Show when={title.media_type}>
                    <span>
                      {title.media_type === "tv" ? "Series" : "Movie"}
                    </span>
                  </Show>
                </p>
              </button>
            );
          }}
        </For>

        {/* "Show More" card — appended at the end of the visible rail.
            Clicking it expands the rail to show all titles. The card
            shows how many more titles are available. */}
        <Show when={hasMore()}>
          <button
            type="button"
            class="search-rail-card search-rail-show-more focus-ring"
            onClick={() => setExpanded(true)}
            aria-label={`Show ${props.titles.length - limit()} more titles`}
            role="listitem"
          >
            <div class="search-rail-show-more-inner">
              <span class="material-symbols-outlined" aria-hidden="true">
                expand_more
              </span>
              <span class="search-rail-show-more-count">
                +{props.titles.length - limit()}
              </span>
              <span class="search-rail-show-more-label">Show More</span>
            </div>
          </button>
        </Show>
      </div>
    </Show>
  );
};

export default DiscoverRail;
