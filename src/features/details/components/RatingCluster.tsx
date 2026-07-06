// src/features/details/components/RatingCluster.tsx
import { Show, createMemo } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import type { TMDBDetails, OMDbRatings, WatchlistItem } from "~/shared/types";

interface RatingClusterProps {
  details: TMDBDetails | null;
  omdb: OMDbRatings | null;
  baseItem: WatchlistItem | null;
}

/**
 * RatingCluster — integrated rating display with visual hierarchy.
 *
 * Layout: [User Rating (large)] | [IMDb row] [RT row]
 *
 * The user's own rating is the most prominent (large Bebas Neue number
 * with accent glow), because it's the rating that matters most to the user.
 * IMDb and RT are secondary rows on the right.
 *
 * If the user hasn't rated: shows "—" with "Not Rated" label.
 * If IMDb/RT are missing: those rows are hidden gracefully.
 *
 * TMDB rating is intentionally NOT shown — the three sources (User, IMDb,
 * RT) are independent and unambiguous.
 */
export default function RatingCluster(props: RatingClusterProps) {
  const { user } = useAuth();

  const userRating = () => {
    const r = props.baseItem?.rating;
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

  const hasAnyRating = () => userRating() !== null || imdb() !== null || rt() !== null;

  return (
    <Show when={hasAnyRating()}>
      <div class="rating-cluster">
        {/* Primary: user rating */}
        <div class="rating-cluster-primary">
          <span class="rating-cluster-value">
            {userRating() !== null ? userRating()!.toFixed(1) : "—"}
          </span>
          <span class="rating-cluster-label">
            {userRating() !== null ? "Your Rating" : "Not Rated"}
          </span>
        </div>

        {/* Secondary: IMDb + RT */}
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
