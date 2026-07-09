// src/features/details/DetailsModal/DetailsHeader.tsx
import type { Accessor } from "solid-js";
import HeroContentCluster from "~/features/details/components/HeroContentCluster";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

/**
 * DetailsHeader — wraps HeroContentCluster (floating poster + title cluster).
 *
 * Renders the ownership-aware title block: poster, title, year, status pill.
 * The status pill only renders when vaultItem is present (ownership boundary).
 */
export interface DetailsHeaderProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
  vaultItem: Accessor<WatchlistItem | null>;
}

export default function DetailsHeader(props: DetailsHeaderProps) {
  return (
    <HeroContentCluster
      baseItem={props.baseItem()}
      details={props.details()}
      vaultItem={props.vaultItem()}
    />
  );
}
