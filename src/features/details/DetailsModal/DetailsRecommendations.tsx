// src/features/details/DetailsModal/DetailsRecommendations.tsx
//
// DetailsRecommendations — lazy-loaded TMDB "You May Also Like" rail.
//
// For anime titles, this component renders nothing — the AniList
// "More Anime Like This" rail replaces it entirely. This avoids
// showing two separate recommendation sections (TMDB Similar + AniList
// Recommendations) for the same anime title.
//
// The anime-specific recommendations are rendered by AnimeRecommendations
// in the same slot in DetailsModal.
import { Show, Suspense, lazy } from "solid-js";
import type { Accessor } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

const SimilarTitles = lazy(
  () => import("~/features/details/components/SimilarTitles")
);

export interface DetailsRecommendationsProps {
  baseItem: Accessor<WatchlistItem | null>;
  watchlist: Accessor<WatchlistItem[]>;
  onSelect: (item: WatchlistItem) => void;
  /** When true, this component renders nothing (anime uses AniList Recommendations). */
  isAnime?: Accessor<boolean>;
}

export default function DetailsRecommendations(
  props: DetailsRecommendationsProps
) {
  // For anime, hide TMDB "You May Also Like" — AniList Recommendations replaces it.
  if (props.isAnime?.()) return null;

  return (
    <Show when={props.baseItem()}>
      <Suspense fallback={<div class="v2-card h-24 animate-pulse" />}>
        <SimilarTitles
          currentItem={props.baseItem()!}
          watchlist={props.watchlist()}
          onSelect={props.onSelect}
        />
      </Suspense>
    </Show>
  );
}
