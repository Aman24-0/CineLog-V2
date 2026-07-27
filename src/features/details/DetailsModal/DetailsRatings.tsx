// src/features/details/DetailsModal/DetailsRatings.tsx
import { Show, createMemo, type Accessor } from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import RatingPanel from "~/features/details/components/RatingPanel";
import { useMdbListRatings } from "~/features/details/useMdbListRatings";
import type { WatchlistItem, TMDBDetails, OMDbRatings } from "~/shared/types";

/**
 * DetailsRatings — the 3-column MDBList rating panel (IMDb / RT / MC).
 *
 * Fetches ratings + vote counts from our /api/media/ratings server
 * route (which proxies MDBList). The panel replaces the old
 * RatingCluster (which used OMDb data without vote counts).
 *
 * OWNERSHIP BOUNDARY:
 *   This component ONLY renders third-party aggregator ratings. It
 *   does NOT touch user-owned data (the user's personal rating lives
 *   in YourActivityCard, which is untouched by this change).
 *
 * FALLBACK:
 *   If the MDBList fetch fails or returns no ratings, the panel still
 *   renders with "NR" placeholders — this is intentional so the
 *   section layout stays consistent. The old OMDb ratings are NOT used
 *   as a fallback (MDBList is the single source of truth now).
 *
 * RENDERING:
 *   The panel is always rendered when details() is truthy (the modal
 *   is open). While loading, skeleton cells appear. Once loaded, the
 *   three brand-colored logo boxes + scores + vote counts fill in.
 */
export interface DetailsRatingsProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
  /**
   * OMDb ratings — kept in the props interface for backwards compat
   * with the parent (DetailsModal) which still fetches OMDb for
   * director/actors metadata. NOT used to render ratings anymore;
   * MDBList is the sole rating source.
   */
  omdb: Accessor<OMDbRatings | null>;
  /** User-owned vault item — NOT used here (kept for prop compat). */
  vaultItem: Accessor<WatchlistItem | null>;
}

export default function DetailsRatings(props: DetailsRatingsProps) {
  // Derive the TMDB id for the MDBList fetch. We read from baseItem
  // (always present) rather than details() because details() loads
  // asynchronously — baseItem is available immediately when the modal
  // opens, so the rating fetch can fire in parallel with the TMDB
  // details fetch.
  const tmdbId = createMemo(() => {
    const id = props.baseItem()?.id;
    if (id == null || id === "") return null;
    return id;
  });

  const { ratings, loading } = useMdbListRatings(tmdbId);

  return (
    <Show when={props.details()}>
      <DetailSection style={{ "margin-top": "1.5rem" }}>
        <RatingPanel ratings={ratings()} loading={loading()} />
      </DetailSection>
    </Show>
  );
}
