// src/features/profile/components/FavoritesGrid.tsx
//
// FavoritesGrid — fetches the user's "Favorites" collection folder
// and renders up to 10 titles in a responsive grid.
//
// Per spec: "Fetch entries from the 'Favorites' collection (where
// collection name = 'Favorites' — or use a dedicated is_favorites
// flag — but currently it's a pre-created folder). Use useCollections
// to get the collection and its entries."
//
// The Collection type has `isFavorites?: boolean` which is set on
// the auto-created Favorites folder. We find that folder, take its
// entries (limited to 10), and render each as a poster card with
// title + year + user rating.
//
// Click on a card opens the title detail modal (handled by parent
// via onItemClick). Empty state prompts the user to add titles to
// their Favorites collection.

import { Show, For, createMemo, type Component, type Accessor } from "solid-js";
import { GlassEmptyState, GlassSkeleton } from "~/shared/ui/glass";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { useCollections } from "~/features/collections/hooks/useCollections";
import type { WatchlistItem, CollectionEntry } from "~/shared/types";

export interface FavoritesGridProps {
  /** The user's vault — used to look up per-title ratings. */
  watchlist: Accessor<WatchlistItem[] | null | undefined>;
  /** Open the title detail modal. */
  onItemClick?: (item: WatchlistItem) => void;
}

const FavoritesGrid: Component<FavoritesGridProps> = (props) => {
  const collections = useCollections();

  const favoritesCollection = createMemo(() => {
    const all = collections.userCollections();
    return all.find((c) => c.isFavorites) ?? null;
  });

  const favoritesEntries = createMemo<CollectionEntry[]>(() => {
    const col = favoritesCollection();
    if (!col) return [];
    return (col.entries ?? []).slice(0, 10);
  });

  // Build a vault lookup map so we can show the user's rating per
  // favorite title without an O(n*m) scan.
  const vaultMap = createMemo(() => {
    const map = new Map<string, WatchlistItem>();
    const list = props.watchlist() ?? [];
    for (const v of list) {
      map.set(`${v.media_type}:${v.id}`, v);
    }
    return map;
  });

  const yearOf = (entry: CollectionEntry): string => {
    const d = entry.release_date ?? entry.first_air_date;
    if (!d) return "";
    return d.slice(0, 4);
  };

  const ratingOf = (entry: CollectionEntry): number | null => {
    const v = vaultMap().get(`${entry.media_type}:${entry.id}`);
    if (!v || !v.rating || v.rating <= 0) return null;
    return v.rating;
  };

  return (
    <div class="profile-favorites-grid-v3" aria-label="Favorite titles">
      <Show when={favoritesCollection() === null && !collections.loading()}>
        <GlassEmptyState
          icon="favorite"
          title="No favorites yet"
          message="Add titles to your Favorites collection to showcase them here."
          variant="compact"
        />
      </Show>

      <Show when={collections.loading() && favoritesCollection() === null}>
        <div class="profile-favorites-grid-v3-skeleton">
          <For each={Array.from({ length: 4 })}>
            {() => (
              <GlassSkeleton class="profile-favorites-grid-v3-skeleton-card" />
            )}
          </For>
        </div>
      </Show>

      <Show
        when={favoritesEntries().length === 0 && favoritesCollection() !== null}
      >
        <GlassEmptyState
          icon="favorite_border"
          title="Your Favorites collection is empty"
          message="Open a title and tap the heart icon to add it to your Favorites."
          variant="compact"
        />
      </Show>

      <Show when={favoritesEntries().length > 0}>
        <For each={favoritesEntries()}>
          {(entry) => (
            <button
              type="button"
              class="profile-favorites-grid-v3-card focus-ring"
              onClick={() => {
                const v = vaultMap().get(`${entry.media_type}:${entry.id}`);
                if (v && props.onItemClick) {
                  props.onItemClick(v);
                }
              }}
              aria-label={`${entry.title ?? entry.name ?? "Untitled"} (${yearOf(entry)})`}
            >
              <Show
                when={entry.poster_path}
                fallback={
                  <div
                    class="profile-favorites-grid-v3-poster-fallback"
                    aria-hidden="true"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">
                      movie
                    </span>
                  </div>
                }
              >
                <img
                  src={tmdbImage(entry.poster_path!, "w185")}
                  class="profile-favorites-grid-v3-poster"
                  loading="lazy"
                  decoding="async"
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </Show>
              <div class="profile-favorites-grid-v3-meta">
                <p class="profile-favorites-grid-v3-title">
                  {entry.title ?? entry.name ?? "Untitled"}
                </p>
                <div class="profile-favorites-grid-v3-sub">
                  <Show when={yearOf(entry)}>
                    <span class="profile-favorites-grid-v3-year">
                      {yearOf(entry)}
                    </span>
                  </Show>
                  <Show when={ratingOf(entry) != null}>
                    <span class="profile-favorites-grid-v3-rating">
                      <span
                        class="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        star
                      </span>
                      {ratingOf(entry)}
                    </span>
                  </Show>
                </div>
              </div>
            </button>
          )}
        </For>
      </Show>
    </div>
  );
};

export default FavoritesGrid;
