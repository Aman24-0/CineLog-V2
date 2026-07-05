// src/features/dashboard/components/RecentlyAdded.tsx
import { For, Show, createMemo, Component } from "solid-js";
import Icon from "~/shared/ui/Icon";
import MovieCard from "~/shared/ui/MovieCard";
import type { WatchlistItem } from "~/shared/types";

interface RecentlyAddedProps {
  watchlist: WatchlistItem[];
  onOpenMovie: (id: string) => void;
  onNavigate: () => void;
}

const RecentlyAdded: Component<RecentlyAddedProps> = (props) => {
  const recentItems = createMemo(() => props.watchlist.slice(0, 10));

  return (
    <div class="animate-fade-up" role="region" aria-label="Recently added titles">
      <div class="flex justify-between items-center mb-4 mt-8 px-1">
        <p class="type-section-title m-0">Recently Added</p>
        <button
          onClick={() => props.onNavigate()}
          class="type-caption flex items-center gap-1 hover:text-white active:scale-95"
          style="color: var(--p); transition: color 150ms ease-out; padding: 4px 8px; margin: -4px -8px"
          aria-label="View all titles in vault"
        >
          View All <Icon name="arrow_forward" class="text-xs" aria-hidden="true" />
        </button>
      </div>

      <Show
        when={props.watchlist.length > 0}
        fallback={
          <div class="empty-state py-8">
            <p class="type-metadata text-gray-500">Nothing added yet. Search for a title to get started.</p>
          </div>
        }
      >
        <div class="flex gap-3 overflow-x-auto hide-scrollbar pb-4 stagger" role="list">
          <For each={recentItems()}>
            {(m) => (
              <div class="w-[100px] sm:w-[130px] shrink-0" role="listitem">
                <MovieCard movie={m} onClick={() => props.onOpenMovie(m.id)} />
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default RecentlyAdded;
