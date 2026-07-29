// src/features/stats/components/HighestRatedCarousel.tsx
//
// HighestRatedCarousel — a horizontally-scrollable list of the user's
// top-rated titles. Each card shows the poster, the title, the year,
// and a gold star rating badge. Clicking a card opens the title
// detail modal via the shared `openTitle` helper.
//
// The carousel is touch-friendly: native horizontal scroll on mobile
// (with momentum), and the scrollbar is hidden for a clean look.

import { For, Show, type Component, type Accessor } from "solid-js";
import { GlassCard } from "~/shared/ui/glass";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { openTitle } from "~/shared/hooks/useModalState";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import type { HighestRatedItem } from "~/lib/supabase/repositories/stats";

interface HighestRatedCarouselProps {
  items: Accessor<HighestRatedItem[]>;
}

const HighestRatedCarousel: Component<HighestRatedCarouselProps> = (props) => {
  const library = useUserLibrary();

  const handleOpen = (item: HighestRatedItem) => {
    openTitle(item.item, library.watchlist());
  };

  return (
    <div class="stats-rated-section">
      <div class="stats-rated-header">
        <div class="stats-rated-header-left">
          <div class="stats-chart-icon stats-rated-header-icon" aria-hidden="true">
            <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
              workspace_premium
            </span>
          </div>
          <div>
            <h3 class="stats-chart-title">Highest Rated</h3>
            <p class="stats-chart-subtitle">Your top-scored titles — tap to open</p>
          </div>
        </div>
      </div>
      <Show
        when={props.items().length > 0}
        fallback={
          <p class="stats-rated-empty">Rate some titles to see your favourites here.</p>
        }
      >
        <div class="stats-rated-scroller" role="list">
          <For each={props.items()}>
            {(item) => (
              <button
                type="button"
                class="stats-rated-card focus-ring"
                role="listitem"
                aria-label={`${item.title} — your rating ${item.userRating} out of 10`}
                onClick={() => handleOpen(item)}
              >
                <div class="stats-rated-poster">
                  <Show
                    when={item.poster}
                    fallback={
                      <div class="stats-rated-poster-fallback">
                        <span class="material-symbols-outlined" aria-hidden="true">movie</span>
                      </div>
                    }
                  >
                    <img
                      src={tmdbImage(item.poster, "w185")}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      class="stats-rated-poster-img"
                    />
                  </Show>
                  <div class="stats-rated-rating">
                    <span class="material-symbols-outlined" aria-hidden="true">star</span>
                    <span>{item.userRating}</span>
                  </div>
                </div>
                <div class="stats-rated-info">
                  <p class="stats-rated-title">{item.title}</p>
                  <Show when={item.year}>
                    <p class="stats-rated-year">{item.year}</p>
                  </Show>
                </div>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default HighestRatedCarousel;
