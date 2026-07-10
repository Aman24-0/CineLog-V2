// src/features/details/DetailsModal/DetailsMetadata.tsx
import { Show } from "solid-js";
import type { Accessor } from "solid-js";
import MetadataGrid from "~/features/details/components/MetadataGrid";
import DetailSection from "~/features/details/components/DetailSection";
import type { WatchlistItem, TMDBDetails, OMDbRatings } from "~/shared/types";

/**
 * DetailsMetadata — wraps MetadataGrid inside a DetailSection.
 *
 * Renders only when TMDB details are present. The "Your Status" cell
 * inside MetadataGrid is ownership-aware (vault only).
 */
export interface DetailsMetadataProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
  omdb: Accessor<OMDbRatings | null>;
  vaultItem: Accessor<WatchlistItem | null>;
}

export default function DetailsMetadata(props: DetailsMetadataProps) {
  return (
    <Show when={props.details()}>
      <DetailSection label="Details" icon="info">
        <MetadataGrid
          baseItem={props.baseItem()}
          details={props.details()}
          omdb={props.omdb()}
          vaultItem={props.vaultItem()}
        />
      </DetailSection>
    </Show>
  );
}
