// src/features/details/DetailsModal/DetailsMetadata.tsx
//
// DetailsMetadata — wraps MetadataGrid inside a DetailSection.
//
// Renders only when TMDB details are present. The "Your Status" cell
// inside MetadataGrid is ownership-aware (vault only).
//
// For anime, passes AniList data to MetadataGrid so it can merge
// AniList-specific fields (Format, Season, Popularity, Favourites,
// Ranking, Studio from AniList) into the unified grid. This replaces
// the separate "AniList Stats" and "Studio" sections that previously
// appeared below the Details grid.
import { Show } from "solid-js";
import type { Accessor } from "solid-js";
import MetadataGrid from "~/features/details/components/MetadataGrid";
import DetailSection from "~/features/details/components/DetailSection";
import type { WatchlistItem, TMDBDetails, OMDbRatings } from "~/shared/types";
import type { AniListMedia } from "~/lib/anilist";

export interface DetailsMetadataProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
  omdb: Accessor<OMDbRatings | null>;
  vaultItem: Accessor<WatchlistItem | null>;
  /** AniList data — null for non-anime titles. */
  anilist?: Accessor<AniListMedia | null>;
  /** Whether this title is anime. */
  isAnime?: Accessor<boolean>;
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
          anilist={props.anilist?.()}
          isAnime={props.isAnime?.() ?? false}
        />
      </DetailSection>
    </Show>
  );
}
