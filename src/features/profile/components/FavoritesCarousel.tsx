// src/features/profile/components/FavoritesCarousel.tsx
//
// FavoritesCarousel — "Your Top Favourite" rail.
//
// Shows watchlist items as a continuous horizontal carousel.
// Movies AND series interleaved. Clicking a card opens the Details modal.
//
// Visual language:
//   • Section title "Your Top Favourite" with an icon
//   • Horizontal scroll rail with poster cards
//   • Each card: poster, title, year, rating, type chip
//   • Uses the search-rail-card pattern (proven, premium)
//   • Hides entirely when watchlist is empty
//
// Architecture:
//   ProfilePage → FavoritesCarousel → watchlist (useUserLibrary)
//                                       openTitle (useModalState)

import { Show, For, createMemo, type Component, type Accessor } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { openTitle } from "~/shared/hooks/useModalState";
import type { WatchlistItem } from "~/shared/types";

interface FavoritesCarouselProps {
  watchlist: Accessor<WatchlistItem[]>;
}

const FavoritesCarousel: Component<FavoritesCarouselProps> = (props) => {
  /**
   * Top favourites = watchlist items, prioritised by:
   *   1. User rating (descending) — what the user explicitly loved
   *   2. Completed status — finished titles the user committed to
   *   3. Recently updated
   *
   * This is "Top Favourite" — not "all watchlist". The user wants a
   * curated rail of the titles they care about most. We cap at 50 to
   * keep the carousel snappy but generous (continuous scroll).
   */
  const items = createMemo(() => {
    const list = props.watchlist();
    if (!list || list.length === 0) return [];

    const sorted = [...list].sort((a, b) => {
      // Rated items first, by rating desc
      const ra = a.rating ?? 0;
      const rb = b.rating ?? 0;
      if (rb !== ra) return rb - ra;

      // Then completed, then watching, then planned
      const sa = a.status === "Completed" ? 3 : a.status === "Watching" ? 2 : 1;
      const sb = b.status === "Completed" ? 3 : b.status === "Watching" ? 2 : 1;
      if (sb !== sa) return sb - sa;

      // Then by recency
      const ua = a.updatedAt ?? "";
      const ub = b.updatedAt ?? "";
      return ub.localeCompare(ua);
    });

    return sorted.slice(0, 50);
  });

  const handleClick = (item: WatchlistItem) => {
    openTitle(item, props.watchlist());
  };

  return (
    <Show when={items().length > 0}>
      <section class="profile-section profile-favorites" aria-label="Your top favourite">
        <div class="favorites-header">
          <h2 class="favorites-title">
            <span class="material-symbols-outlined favorites-title-icon" aria-hidden="true">
              favorite
            </span>
            Your Top Favourite
          </h2>
          <p class="favorites-subtitle">
            {items().length} {items().length === 1 ? "title" : "titles"} from your watchlist
          </p>
        </div>

        <div class="favorites-rail" role="list">
          <For each={items()}>
            {(item) => {
              const title = () => item.title || item.name || "Untitled";
              const year = () => {
                const d = item.release_date || item.first_air_date || "";
                return d.split("-")[0] || "";
              };
              const rating = () => item.rating ?? 0;
              const posterUrl = () => tmdbImage(item.poster_path, "w185");
              const isMovie = () => item.media_type === "movie";

              return (
                <button
                  type="button"
                  class="search-rail-card focus-ring favorites-card"
                  onClick={() => handleClick(item)}
                  role="listitem"
                  aria-label={`${title()}, ${year() || ""}${isMovie() ? ", Movie" : ", Series"}${rating() > 0 ? `, rated ${rating()}` : ""}`}
                >
                  <div class="search-rail-poster favorites-poster">
                    <Show
                      when={item.poster_path}
                      fallback={
                        <div class="search-rail-poster-fallback">
                          <span
                            class="material-symbols-outlined"
                            style={{ "font-size": "24px", color: "var(--text-dim)" }}
                            aria-hidden="true"
                          >
                            {isMovie() ? "movie" : "tv"}
                          </span>
                        </div>
                      }
                    >
                      <img
                        src={posterUrl()}
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
                    <Show when={rating() > 0}>
                      <div class="favorites-rating-chip" aria-label={`Rated ${rating()} out of 10`}>
                        <span class="material-symbols-outlined" style={{ "font-size": "9px" }} aria-hidden="true">
                          star
                        </span>
                        {rating().toFixed(1)}
                      </div>
                    </Show>
                  </div>
                  <p class="search-rail-title">{title()}</p>
                  <p class="search-rail-meta">
                    {year() && <span>{year()}</span>}
                    {year() && " · "}
                    <span>{isMovie() ? "Movie" : "Series"}</span>
                  </p>
                </button>
              );
            }}
          </For>
        </div>
      </section>
    </Show>
  );
};

export default FavoritesCarousel;
