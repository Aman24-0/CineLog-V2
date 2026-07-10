// src/features/details/DetailsModal/types.ts
import type { Accessor } from "solid-js";
import type {
  WatchlistItem,
  TMDBDetails,
  OMDbRatings,
} from "~/shared/types";

/**
 * Shared prop interfaces for the DetailsModal section components.
 *
 * The DetailsModal orchestrator owns all state and handlers; each section
 * component receives only the slices it needs via these grouped interfaces.
 * This eliminates prop duplication and keeps the ownership boundary
 * (baseItem = TMDB identity, vaultItem = user-owned state) explicit at
 * every section boundary.
 */

/** Sections that consume both TMDB identity and user-owned vault state. */
export interface OwnershipProps {
  baseItem: Accessor<WatchlistItem | null>;
  vaultItem: Accessor<WatchlistItem | null>;
}

/** Sections that consume TMDB + OMDb details (fetched on demand). */
export interface DetailsDataProps {
  details: Accessor<TMDBDetails | null>;
  omdb: Accessor<OMDbRatings | null>;
}

/** Full section — needs ownership + details. */
export interface SectionProps extends OwnershipProps, DetailsDataProps {}

/**
 * The mutable form state used by the inline edit form. The orchestrator
 * owns this signal and passes the accessor + setter down to the edit form.
 */
export interface DetailsFormState {
  status: string;
  rating: string;
  watchDate: string;
  notes: string;
}
