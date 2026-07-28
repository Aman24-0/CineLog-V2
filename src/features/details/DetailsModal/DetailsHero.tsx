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
 *
 * v2.5 — passes through `hasTrailer` and `onPlayTrailer` so the hero
 * can render a Netflix-style "Watch Trailer" overlay CTA on the backdrop.
 * The orchestrator (DetailsModal) still owns the playing/closed state.
 */
export interface DetailsHeroProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
  trailerActive: Accessor<boolean>;
  trailerKey: Accessor<string | null>;
  hasTrailer: Accessor<boolean>;
  onPlayTrailer: () => void;
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
      hasTrailer={props.hasTrailer()}
      onPlayTrailer={props.onPlayTrailer}
      onCloseTrailer={props.onCloseTrailer}
    />
  );
}
