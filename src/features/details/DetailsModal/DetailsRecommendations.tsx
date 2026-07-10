// src/features/details/DetailsModal/DetailsRecommendations.tsx
import { Show, Suspense, lazy } from "solid-js";
import type { Accessor } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

const SimilarTitles = lazy(
  () => import("~/features/details/components/SimilarTitles"),
);
const FranchiseInfo = lazy(
  () => import("~/features/details/components/FranchiseInfo"),
);

/**
 * DetailsRecommendations — wraps the lazy-loaded FranchiseInfo +
 * SimilarTitles rails. Both consume the user's vault (to mark which
 * recommendations are already owned) and an onSelect callback that
 * re-opens Details for the tapped title.
 */
export interface DetailsRecommendationsProps {
  baseItem: Accessor<WatchlistItem | null>;
  watchlist: Accessor<WatchlistItem[]>;
  onSelect: (item: WatchlistItem) => void;
}

export default function DetailsRecommendations(props: DetailsRecommendationsProps) {
  return (
    <Show when={props.baseItem()}>
      <Suspense fallback={<div class="h-24 v2-card animate-pulse" />}>
        <FranchiseInfo
          currentItem={props.baseItem()!}
          watchlist={props.watchlist()}
          onSelect={props.onSelect}
        />
      </Suspense>
      <Suspense fallback={<div class="h-24 v2-card animate-pulse" />}>
        <SimilarTitles
          currentItem={props.baseItem()!}
          watchlist={props.watchlist()}
          onSelect={props.onSelect}
        />
      </Suspense>
    </Show>
  );
}
