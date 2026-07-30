// src/features/stats/components/HighestRatedCarousel.tsx
//
// HighestRatedCarousel — a horizontally-scrollable list of the user's
// top-rated titles. Each card shows the poster, the title, the year,
// and a gold star rating badge. Clicking a card opens the title
// detail modal via the shared `openTitle` helper.
//
// The carousel is touch-friendly: native horizontal scroll on mobile
// (with momentum), and the scrollbar is hidden for a clean look.
// A subtle right-edge fade gradient signals that more items are
// available beyond the visible viewport, and two chevron buttons
// let desktop users scroll left/right without dragging.
//
// Titles are truncated to one line via .truncate (CSS ellipsis) and
// a native title attribute exposes the full string on long hover.

import {
  For,
  Show,
  createSignal,
  onCleanup,
  type Component,
  type Accessor
} from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { openTitle } from "~/shared/hooks/useModalState";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import type { HighestRatedItem } from "~/lib/supabase/repositories/stats";

interface HighestRatedCarouselProps {
  items: Accessor<HighestRatedItem[]>;
}

const HighestRatedCarousel: Component<HighestRatedCarouselProps> = (props) => {
  const library = useUserLibrary();
  const [scroller, setScroller] = createSignal<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = createSignal(false);
  const [canScrollRight, setCanScrollRight] = createSignal(false);

  const handleOpen = (item: HighestRatedItem) => {
    // Defensive: openTitle needs the current watchlist so it can
    // find the matching item by id. We wrap in a try/catch and
    // validate library.watchlist is callable to avoid breaking the
    // carousel if the library context is mid-teardown.
    try {
      if (!library || typeof library.watchlist !== "function") return;
      openTitle(item.item, library.watchlist());
    } catch (err) {
      console.error("[HighestRatedCarousel] openTitle failed:", err);
    }
  };

  // Track scroll position to toggle chevron visibility + fade.
  const updateScrollState = () => {
    const el = scroller();
    if (!el) return;
    const maxLeft = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < maxLeft - 4);
  };

  const scrollBy = (delta: number) => {
    const el = scroller();
    if (!el) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  // Initialise scroll state once mounted + on item changes.
  // createEffect would fire too eagerly before the layout settles,
  // so we use requestAnimationFrame on mount and resize observers
  // to keep the chevron visibility in sync.
  let resizeObserver: ResizeObserver | null = null;
  const initObserver = (el: HTMLDivElement) => {
    setScroller(el);
    // Wait a frame so the layout has settled before measuring.
    requestAnimationFrame(updateScrollState);
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => updateScrollState());
      resizeObserver.observe(el);
    }
  };

  onCleanup(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  });

  return (
    <div class="stats-rated-section">
      <div class="stats-rated-header">
        <div class="stats-rated-header-left">
          <div
            class="stats-chart-icon stats-rated-header-icon"
            aria-hidden="true"
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "18px" }}
              aria-hidden="true"
            >
              workspace_premium
            </span>
          </div>
          <div>
            <h3 class="stats-chart-title">Highest Rated</h3>
            <p class="stats-chart-subtitle">
              Your top-scored titles — tap to open
            </p>
          </div>
        </div>
        <Show when={props.items().length > 2}>
          <div class="stats-rated-chevrons">
            <button
              type="button"
              class="stats-rated-chevron"
              aria-label="Scroll left"
              disabled={!canScrollLeft()}
              onClick={() => scrollBy(-260)}
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "18px" }}
                aria-hidden="true"
              >
                chevron_left
              </span>
            </button>
            <button
              type="button"
              class="stats-rated-chevron"
              aria-label="Scroll right"
              disabled={!canScrollRight()}
              onClick={() => scrollBy(260)}
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "18px" }}
                aria-hidden="true"
              >
                chevron_right
              </span>
            </button>
          </div>
        </Show>
      </div>
      <Show
        when={props.items().length > 0}
        fallback={
          <p class="stats-rated-empty">
            Rate some titles to see your favourites here.
          </p>
        }
      >
        <div class="stats-rated-scroller-wrap">
          <div
            class="stats-rated-scroller"
            role="list"
            ref={initObserver}
            onScroll={updateScrollState}
          >
            <For each={props.items()}>
              {(item) => (
                <button
                  type="button"
                  class="stats-rated-card focus-ring"
                  role="listitem"
                  aria-label={`${item.title} — your rating ${item.userRating} out of 10`}
                  title={item.title}
                  onClick={() => handleOpen(item)}
                >
                  <div class="stats-rated-poster">
                    <Show
                      when={item.poster}
                      fallback={
                        <div class="stats-rated-poster-fallback">
                          <span
                            class="material-symbols-outlined"
                            aria-hidden="true"
                          >
                            movie
                          </span>
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
                      <span
                        class="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        star
                      </span>
                      <span>{item.userRating}</span>
                    </div>
                  </div>
                  <div class="stats-rated-info">
                    <p class="stats-rated-title stats-rated-title-truncate">
                      {item.title}
                    </p>
                    <Show when={item.year}>
                      <p class="stats-rated-year">{item.year}</p>
                    </Show>
                  </div>
                </button>
              )}
            </For>
          </div>
          {/* Right-edge fade gradient — only visible when more items exist to the right */}
          <Show when={canScrollRight()}>
            <div class="stats-rated-fade-edge" aria-hidden="true" />
          </Show>
          {/* Left-edge fade gradient — only visible when scrolled in from the left */}
          <Show when={canScrollLeft()}>
            <div
              class="stats-rated-fade-edge stats-rated-fade-edge-left"
              aria-hidden="true"
            />
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default HighestRatedCarousel;
