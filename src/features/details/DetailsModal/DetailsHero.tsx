// src/features/details/DetailsModal/DetailsHero.tsx
import type { Accessor } from "solid-js";
import CinematicHero from "~/features/details/components/CinematicHero";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

/**
 * DetailsHero — wraps the CinematicHero building block.
 *
 * The hero is the emotional centerpiece: full-bleed backdrop with parallax,
 * and (when active) the YouTube trailer iframe. The trailer-active state
 * is owned by the orchestrator so the ESC key handler can close it.
 */
export interface DetailsHeroProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
  trailerActive: Accessor<boolean>;
  trailerKey: Accessor<string | null>;
  onClose: () => void;
  onCloseTrailer: () => void;
}

export default function DetailsHero(props: DetailsHeroProps) {
  return (
    <CinematicHero
      baseItem={props.baseItem()}
      details={props.details()}
      onClose={props.onClose}
      trailerActive={props.trailerActive()}
      trailerKey={props.trailerKey()}
      onCloseTrailer={props.onCloseTrailer}
    />
  );
}
