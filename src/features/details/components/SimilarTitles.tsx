// src/features/details/components/SimilarTitles.tsx
import { For, Show, createMemo } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

interface SimilarTitlesProps {
  currentItem: WatchlistItem;
  watchlist: WatchlistItem[];
  onSelect: (item: WatchlistItem) => void;
}

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
      <div class="mt-6 animate-fade-in">
        <h3 class="type-section-title mb-4">You may also like</h3>
        <div class="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
          <For each={similar()}>
            {(item) => (
              <div
                class="min-w-[100px] w-[100px] shrink-0 cursor-pointer group"
                onClick={() => props.onSelect(item)}
              >
                <div class="w-full h-[150px] rounded-xl overflow-hidden relative mb-2 border border-white/5 bg-[#141414]">
                  <Show when={item.poster_path} fallback={
                    <div class="w-full h-full flex items-center justify-center">
                      <span class="material-symbols-outlined text-gray-700">movie</span>
                    </div>
                  }>
                    <img
                      src={`https://image.tmdb.org/t/p/w200${item.poster_path}`}
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      decoding="async"
                      alt={item.title || item.name}
                    />
                  </Show>
                </div>
                <p class="type-caption text-gray-300 group-hover:text-white truncate transition-colors">
                  {item.title || item.name}
                </p>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
