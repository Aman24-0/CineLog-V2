// src/features/dashboard/components/RecentlyAdded.tsx
import { For, Show, createMemo, Component } from "solid-js";
import { SectionHeader } from "~/shared/ui/primitives";
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
      <SectionHeader
        title="Recently Added"
        icon="schedule"
        actionLabel="View All"
        onAction={() => props.onNavigate()}
      />

      <Show
        when={props.watchlist.length > 0}
        fallback={
          <div class="empty-premium" style={{ padding: "var(--sp-6)", "text-align": "center" }}>
            <p class="type-body-soft">Nothing added yet. Search for a title to get started.</p>
          </div>
        }
      >
        <div class="rail-premium hide-scrollbar stagger" role="list">
          <For each={recentItems()}>
            {(m) => (
              <div class="w-[100px] sm:w-[130px] shrink-0" role="listitem">
                <MovieCard movie={m} variant="compact" onClick={() => props.onOpenMovie(m.id)} />
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default RecentlyAdded;
