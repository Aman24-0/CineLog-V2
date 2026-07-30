// src/features/details/DetailsModal/DetailsRecommendations.tsx
import { Show, Suspense, lazy } from "solid-js";
import type { Accessor } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

const SimilarTitles = lazy(
  () => import("~/features/details/components/SimilarTitles")
);

/**
 * DetailsRecommendations — lazy-loaded SimilarTitles rail.
 *
 * FranchiseInfo (TMDB franchise detection) was REMOVED because it
 * created a duplicate "Collection" panel alongside the user-only
 * UserCollectionInfo component. The DetailsModal now shows exactly
 * ONE collection section, and ONLY when the title belongs to a
 * user-created folder or subscribed universe in Supabase.
 */
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
