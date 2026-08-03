// src/features/details/DetailsModal/DetailsRecommendations.tsx
//
// DetailsRecommendations — lazy-loaded TMDB "You May Also Like" rail.
//
// Renders for ALL titles (movies, TV, anime). TMDB recommendations
// are used because they have better artwork, a larger recommendation
// pool, and more diverse results. AniList recommendations have been
// removed — AniList still provides: Relations, Characters, Voice Actors,
// Metadata, and Source Material.
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
}

export default function DetailsRecommendations(
  props: DetailsRecommendationsProps
) {
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
