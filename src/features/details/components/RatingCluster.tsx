// src/features/details/components/RatingCluster.tsx
import { Show, createMemo } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import type { TMDBDetails, OMDbRatings, WatchlistItem } from "~/shared/types";

interface RatingClusterProps {
  details: TMDBDetails | null;
  omdb: OMDbRatings | null;
  /** TMDB identity — always present */
  baseItem: WatchlistItem | null;
  /**
   * User-owned vault item — null when the title is NOT in the vault.
   * The "Your Rating" slot only renders when this is present AND has a
   * rating > 0. Non-vault titles show only IMDb / RT (TMDB-sourced).
   */
  vaultItem?: WatchlistItem | null;
}

/**
 * RatingCluster — integrated rating display with visual hierarchy.
 *
 * Layout: [User Rating (large)] | [IMDb row] [RT row]
 *
 * OWNERSHIP BOUNDARY:
 *   The user's own rating is a user-owned state. The "Your Rating"
 *   slot only renders when `vaultItem` is present AND has a rating > 0.
 *   Non-vault titles show only IMDb / RT rows (TMDB-sourced data).
 *   If neither IMDb nor RT exists AND the title isn't in the vault,
 *   the entire cluster is hidden (no empty "Not Rated" slot for
 *   titles the user doesn't own).
 *
 * TMDB rating is intentionally NOT shown — the three sources (User,
 * IMDb, RT) are independent and unambiguous.
 */
export default function RatingCluster(props: RatingClusterProps) {
  const { user } = useAuth();

  const userRating = () => {
    const r = props.vaultItem?.rating;
    if (typeof r !== "number" || r <= 0) return null;
    return r;
  };

  const imdb = () => {
    const v = props.omdb?.imdb;
    if (!v || v === "-" || v === "N/A") return null;
    return v;
  };

  const rt = () => {
    const v = props.omdb?.rt;
    if (!v || v === "-" || v === "N/A") return null;
    return v;
  };

  const username = createMemo(() => {
    const u = user();
    if (u?.displayName) return u.displayName;
    if (u?.email) return u.email.split("@")[0];
    return "Guest";
  });

  // Show the cluster when there's ANY rating to display.
  // For non-vault titles: only IMDb/RT.
  // For vault titles: user rating OR IMDb/RT.
  const hasAnyRating = () => userRating() !== null || imdb() !== null || rt() !== null;

  return (
    <Show when={hasAnyRating()}>
      <div class="rating-cluster">
        {/* Primary: user rating — ONLY when in vault AND rated */}
        <Show when={userRating() !== null}>
          <div class="rating-cluster-primary">
            <span class="rating-cluster-value">
              {userRating()!.toFixed(1)}
            </span>
            <span class="rating-cluster-label">Your Rating</span>
          </div>
        </Show>

        {/* Secondary: IMDb + RT (always TMDB-sourced, always allowed) */}
        <div class="rating-cluster-secondary">
          <Show when={imdb()}>
            <div class="rating-cluster-row">
              <span
                class="material-symbols-outlined rating-cluster-row-icon"
                style={{ color: "#f5c518", "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                aria-hidden="true"
              >
                star
              </span>
              <span class="rating-cluster-row-value" style={{ color: "#f5c518" }}>
                {imdb()}
              </span>
              <span class="rating-cluster-row-label">IMDb</span>
            </div>
          </Show>

          <Show when={rt()}>
            <div class="rating-cluster-row">
              <span class="rating-cluster-row-icon" style={{ "font-size": "12px" }} aria-hidden="true">
                🍅
              </span>
              <span class="rating-cluster-row-value" style={{ color: "#ff7878" }}>
                {rt()}
              </span>
              <span class="rating-cluster-row-label">Rotten T.</span>
            </div>
          </Show>

          <Show when={userRating() !== null}>
            <div class="rating-cluster-row" style={{ "margin-top": "0.25rem" }}>
              <span
                class="material-symbols-outlined rating-cluster-row-icon"
                style={{ color: "var(--p)", "font-size": "12px" }}
                aria-hidden="true"
              >
                person
              </span>
              <span class="rating-cluster-row-label" style={{ margin: 0, color: "var(--p)" }}>
                {username()}
              </span>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
