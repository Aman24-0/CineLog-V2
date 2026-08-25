// src/features/profile/components/FavoritesGrid.tsx
//
// FavoritesGrid preserves the existing Favorites collection data flow while
// rendering its poster cards inside the shared horizontal rail component.

import { Show, createMemo, type Component, type Accessor } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { useCollections } from "~/features/collections/hooks/useCollections";
import type { WatchlistItem, CollectionEntry } from "~/shared/types";
import HorizontalRail from "./HorizontalRail";

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

  const vaultMap = createMemo(() => {
    const map = new Map<string, WatchlistItem>();
    const list = props.watchlist() ?? [];
    for (const v of list) map.set(`${v.media_type}:${v.id}`, v);
    return map;
  });

  const yearOf = (entry: CollectionEntry): string => {
    const date = entry.release_date ?? entry.first_air_date;
    return date ? date.slice(0, 4) : "";
  };

  const ratingOf = (entry: CollectionEntry): number | null => {
    const item = vaultMap().get(`${entry.media_type}:${entry.id}`);
    return item?.rating && item.rating > 0 ? item.rating : null;
  };

  const favoriteCard = (entry: CollectionEntry) => (
    <button
      type="button"
      class="profile-favorites-rail-card focus-ring"
      onClick={() => {
        const item = vaultMap().get(`${entry.media_type}:${entry.id}`);
        if (item) props.onItemClick?.(item);
      }}
      aria-label={`${entry.title ?? entry.name ?? "Untitled"} (${yearOf(entry)})`}
      role="listitem"
    >
      <Show
        when={entry.poster_path}
        fallback={
          <div
            class="profile-favorites-rail-poster-fallback"
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
          class="profile-favorites-rail-poster"
          loading="lazy"
          decoding="async"
          alt=""
          aria-hidden="true"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      </Show>
      <div class="profile-favorites-rail-meta">
        <p class="profile-favorites-rail-title">
          {entry.title ?? entry.name ?? "Untitled"}
        </p>
        <div class="profile-favorites-rail-sub">
          <Show when={yearOf(entry)}>
            <span>{yearOf(entry)}</span>
          </Show>
          <Show when={ratingOf(entry) != null}>
            <span class="profile-favorites-rail-rating">
              <span class="material-symbols-outlined" aria-hidden="true">
                star
              </span>
              {ratingOf(entry)}
            </span>
          </Show>
        </div>
      </div>
    </button>
  );

  return (
    <div class="profile-favorites-section">
      <HorizontalRail
        title="Favorites"
        items={favoritesEntries}
        viewAllLink="/collections?filter=favorites"
        ariaLabel="Favorite titles"
        renderItem={favoriteCard}
        loading={collections.loading()}
        emptyIcon="favorite_border"
        emptyMessage={
          favoritesCollection() === null
            ? "Add titles to your Favorites collection to showcase them here."
            : "Open a title and tap the heart icon to add it to your Favorites."
        }
        emptyAction="Discover Content"
        emptyActionLink="/discover"
      />
    </div>
  );
};

export default FavoritesGrid;
