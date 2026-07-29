// src/features/profile/components/ActivityFeed.tsx
//
// ActivityFeed — chronological list of user actions (ratings, watchlist
// additions, completions, progress updates).
//
// Each item: small poster (40×60), title + year, action description,
// relative timestamp ("2h ago", "Just now").
//
// The feed is derived client-side from the watchlist via the
// useActivityFeed hook — no extra round-trip needed. Limited to 50
// items by default; a "Show more" button reveals the next 25 (just
// raises the visible count — the underlying memo already caps at 50).

import { Show, For, createSignal, type Component, type Accessor } from "solid-js";
import { GlassEmptyState, GlassSkeleton } from "~/shared/ui/glass";
import { tmdbImage } from "~/core/tmdb/tmdb";
import {
  useActivityFeed,
  formatRelativeTime,
} from "../hooks/useActivityFeed";
import type { WatchlistItem } from "~/shared/types";

export interface ActivityFeedProps {
  watchlist: Accessor<WatchlistItem[] | null | undefined>;
  /** Optional: open the title detail modal when an item is clicked. */
  onItemClick?: (item: WatchlistItem) => void;
}

const PAGE_SIZE = 25;

const ActivityFeed: Component<ActivityFeedProps> = (props) => {
  const { feed, loading, empty } = useActivityFeed(props.watchlist, { limit: 50 });
  const [visibleCount, setVisibleCount] = createSignal(PAGE_SIZE);

  const visibleItems = () => feed().slice(0, visibleCount());
  const hasMore = () => feed().length > visibleCount();

  return (
    <div class="profile-activity-feed-v3" role="feed" aria-label="Recent activity">
      <Show when={loading()}>
        <For each={Array.from({ length: 5 })}>
          {(_, i) => (
            <div class="profile-activity-feed-v3-skeleton">
              <GlassSkeleton class="profile-activity-feed-v3-skeleton-poster" />
              <div class="profile-activity-feed-v3-skeleton-text">
                <GlassSkeleton class="h-3 w-3/4 rounded" />
                <GlassSkeleton class="h-2 w-1/2 rounded mt-1" />
              </div>
            </div>
          )}
        </For>
      </Show>

      <Show when={!loading() && empty()}>
        <GlassEmptyState
          icon="timeline"
          title="No activity yet"
          message="Add titles to your watchlist, rate them, or update your progress — your activity will show up here."
          variant="compact"
        />
      </Show>

      <Show when={!loading() && !empty()}>
        <For each={visibleItems()}>
          {(entry) => (
            <button
              type="button"
              class="profile-activity-feed-v3-item focus-ring"
              onClick={() => props.onItemClick?.(entry.item)}
              aria-label={`${entry.actionLabel}: ${entry.item.title ?? entry.item.name ?? "Untitled"}`}
            >
              {/* Poster thumbnail — 40×60 */}
              <Show
                when={entry.item.poster_path}
                fallback={
                  <div class="profile-activity-feed-v3-poster-fallback" aria-hidden="true">
                    <span class="material-symbols-outlined" aria-hidden="true">movie</span>
                  </div>
                }
              >
                <img
                  src={tmdbImage(entry.item.poster_path!, "w92")}
                  class="profile-activity-feed-v3-poster"
                  loading="lazy"
                  decoding="async"
                  alt=""
                  aria-hidden="true"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </Show>

              <div class="profile-activity-feed-v3-main">
                <p class="profile-activity-feed-v3-title">
                  {entry.item.title ?? entry.item.name ?? "Untitled"}
                </p>
                <p class="profile-activity-feed-v3-action">
                  <span
                    class="material-symbols-outlined profile-activity-feed-v3-action-icon"
                    aria-hidden="true"
                  >
                    {entry.icon}
                  </span>
                  <span>{entry.actionLabel}</span>
                </p>
              </div>

              <p class="profile-activity-feed-v3-time">
                {formatRelativeTime(entry.timestamp)}
              </p>
            </button>
          )}
        </For>

        <Show when={hasMore()}>
          <button
            type="button"
            class="profile-activity-feed-v3-show-more focus-ring"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Show more
          </button>
        </Show>
      </Show>
    </div>
  );
};

export default ActivityFeed;
