// src/features/details/DetailsModal/DetailsRatings.tsx
import { Show } from "solid-js";
import type { Accessor } from "solid-js";
import RatingCluster from "~/features/details/components/RatingCluster";
import DetailSection from "~/features/details/components/DetailSection";
import type { WatchlistItem, TMDBDetails, OMDbRatings } from "~/shared/types";

/**
 * DetailsRatings — wraps RatingCluster inside a DetailSection.
 *
 * Renders only when at least one rating source (TMDB or OMDb) is available.
 * The user-rating slot inside RatingCluster is ownership-aware (vault only).
 */
export interface DetailsRatingsProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
  omdb: Accessor<OMDbRatings | null>;
  vaultItem: Accessor<WatchlistItem | null>;
}

export default function DetailsRatings(props: DetailsRatingsProps) {
  return (
    <Show when={props.details() || props.omdb()}>
      <DetailSection style={{ "margin-top": "1.5rem" }}>
        <RatingCluster
          details={props.details()}
          omdb={props.omdb()}
          baseItem={props.baseItem()}
          vaultItem={props.vaultItem()}
        />
      </DetailSection>
    </Show>
  );
}
