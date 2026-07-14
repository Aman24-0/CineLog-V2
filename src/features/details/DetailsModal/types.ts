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
 *
 * `rewatchCount` is stored as a string for form-input compatibility
 * (the stepper writes string values). It is parsed to a number on save.
 *
 * `rewatchDates` holds every viewing date in order: index 0 = first
 * watch, indices 1..N = the N re-watches. Length should always equal
 * rewatchCount + 1, but the form is tolerant of misalignment (empty
 * strings are treated as "no date set for that viewing").
 *
 * SERIES per-season rewatch (v2.3):
 *   - `seasonRewatchCount` (string) controls how many re-watch passes
 *     the user has done through the series.
 *   - `seasonRewatchDates` is an array of per-season {start,end} maps,
 *     one entry per re-watch pass. Length = seasonRewatchCount.
 *   - `seasonDates` (the original-watch per-season start/end map) is
 *     also part of the form state for series.
 */
export interface DetailsFormState {
  status: string;
  rating: string;
  watchDate: string;
  notes: string;
  rewatchCount: string;
  rewatchDates: string[];
  /** SERIES: per-season start/end for the original watch. Keyed by season number string. */
  seasonDates: Record<string, { start: string; end: string }>;
  /** SERIES: number of re-watch passes (string for form-input compat). */
  seasonRewatchCount: string;
  /** SERIES: per-re-watch per-season start/end. Array index = re-watch number (0 = 1st rewatch). */
  seasonRewatchDates: Record<string, { start: string; end: string }>[];
}
