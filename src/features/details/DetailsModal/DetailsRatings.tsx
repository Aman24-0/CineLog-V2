// src/features/details/DetailsModal/DetailsRatings.tsx
import { Show, createMemo, type Accessor } from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import RatingPanel from "~/features/details/components/RatingPanel";
import {
  useMdbListRatings,
  type FrontendMediaType
} from "~/features/details/useMdbListRatings";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

/**
 * DetailsRatings — the 3-column MDBList rating panel (IMDb / RT / MC).
 *
 * Fetches ratings + vote counts from our /api/media/ratings server
 * route (which proxies MDBList's v2 Title Lookup endpoint). The panel
 * replaces the old RatingCluster (which used legacy data without vote
 * counts).
 *
 * OWNERSHIP BOUNDARY:
 *   This component ONLY renders third-party aggregator ratings. It
 *   does NOT touch user-owned data (the user's personal rating lives
 *   in YourActivityCard, which is untouched by this change).
 *
 * FETCH STRATEGY:
 *   We read both the TMDB id AND media_type from `baseItem` (always
 *   present the moment the modal opens). This lets the rating fetch
 *   fire in parallel with the TMDB details fetch — the server route
 *   needs both values to construct MDBList's path-based Title Lookup
 *   URL: /tmdb/{movie|show}/{tmdbId}.
 *
 * FALLBACK:
 *   If the MDBList fetch fails or returns no ratings, the panel still
 *   renders with "NR" placeholders — this is intentional so the
 *   section layout stays consistent. The old legacy ratings are NOT used
 *   as a fallback (MDBList is the single source of truth now).
 */
export interface DetailsRatingsProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
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

  // Derive the media_type ("movie"|"tv") for the MDBList fetch. The
  // server route maps this to MDBList's path segment ("movie"|"show").
  const mediaType = createMemo<FrontendMediaType | null>(() => {
    const mt = props.baseItem()?.media_type;
    if (mt !== "movie" && mt !== "tv") return null;
    return mt;
  });

  // ESLint: tmdbId and mediaType are Accessors passed by reference to
  // useMdbListRatings, which tracks them inside its own createEffect /
  // resource fetcher. The lint rule can't see through the hook boundary.
  // eslint-disable-next-line solid/reactivity
  const { ratings, loading } = useMdbListRatings(tmdbId, mediaType);

  return (
    <Show when={props.details()}>
      <DetailSection style={{ "margin-top": "1.5rem" }}>
        <RatingPanel ratings={ratings()} loading={loading()} />
      </DetailSection>
    </Show>
  );
}
