// src/features/details/components/SimilarTitles.tsx
import { For, Show, createMemo } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import DetailSection from "./DetailSection";
import type { WatchlistItem } from "~/shared/types";

interface SimilarTitlesProps {
  currentItem: WatchlistItem;
  watchlist: WatchlistItem[];
  onSelect: (item: WatchlistItem) => void;
}

/**
 * Similar Titles — "You may also like" rail.
 *
 * Shows titles from the user's vault that share genres or platforms with
 * the current item. Uses the DetailSection wrapper for consistent spacing.
 */
export default function SimilarTitles(props: SimilarTitlesProps) {
  const similar = createMemo(() => {
    return props.watchlist
      .filter((m) => {
        if (m.id === props.currentItem.id) return false;
        if (m.media_type !== props.currentItem.media_type) return false;

        const currentGenres = props.currentItem.genresList || [];
        const itemGenres = m.genresList || [];
        const commonGenres = itemGenres.filter((g) => currentGenres.includes(g));

        const currentPlatforms = props.currentItem.platformsList || [];
        const itemPlatforms = m.platformsList || [];
        const commonPlatforms = itemPlatforms.filter((p) => currentPlatforms.includes(p));

        return commonGenres.length > 0 || commonPlatforms.length > 0;
      })
      .slice(0, 6);
  });

  return (
    <Show when={similar().length > 0}>
      <DetailSection label="You May Also Like" icon="recommend">
        <div class="flex gap-3 overflow-x-auto hide-scrollbar pb-2 -mx-1 px-1">
          <For each={similar()}>
            {(item) => (
              <div
                class="min-w-[100px] w-[100px] shrink-0 cursor-pointer group"
                onClick={() => props.onSelect(item)}
              >
                <div
                  class="w-full h-[150px] rounded-xl overflow-hidden relative mb-2 v2-card"
                  style={{ "border-radius": "var(--radius-card)" }}
                >
                  <Show
                    when={item.poster_path}
                    fallback={
                      <div class="w-full h-full flex items-center justify-center" style={{ background: "var(--tier-3)" }}>
                        <span
                          class="material-symbols-outlined"
                          style={{ color: "var(--text-dim)", "font-size": "32px" }}
                          aria-hidden="true"
                        >
                          movie
                        </span>
                      </div>
                    }
                  >
                    <img
                      src={tmdbImage(item.poster_path, "w185")}
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      decoding="async"
                      alt={item.title || item.name}
                    />
                  </Show>
                </div>
                <p
                  class="type-micro truncate transition-colors"
                  style={{ color: "var(--text-soft)" }}
                >
                  {item.title || item.name}
                </p>
              </div>
            )}
          </For>
        </div>
      </DetailSection>
    </Show>
  );
}
