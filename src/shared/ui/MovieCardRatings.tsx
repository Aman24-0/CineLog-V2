// src/shared/ui/MovieCardRatings.tsx
import { type Component } from "solid-js";
import Icon from "./Icon";
import type { WatchlistItem } from "~/shared/types";

/**
 * MovieCardRatings — the 3-source rating chip cluster.
 *
 * Three independent rating sources displayed side-by-side:
 *   - IMDb (yellow star + rating)
 *   - Rotten Tomatoes (tomato emoji + %)
 *   - User rating (person icon + score)
 *
 * Extracted from MovieCard.tsx to keep that file under the 250-line
 * limit. Shown only on `default` and `featured` variants (hidden on
 * `compact` for density).
 *
 * MDBList SYNC: The `overrideImdbRating` prop, when provided, replaces
 * the WatchlistItem's OMDb imdbRating with the lazy-loaded MDBList
 * IMDb score so the card badge matches the Details modal. When null
 * (still loading or unavailable), falls back to the OMDb rating.
 */
export interface MovieCardRatingsProps {
  movie: WatchlistItem;
  /**
   * Optional override for the IMDb rating chip. When provided (non-null
   * string), replaces movie.imdbRating with the MDBList IMDb score.
   * When null, falls back to movie.imdbRating (OMDb).
   */
  overrideImdbRating?: string | null;
}

const MovieCardRatings: Component<MovieCardRatingsProps> = (props) => {
  const imdbRating = () =>
    props.overrideImdbRating ?? props.movie.imdbRating ?? null;

  return (
    <div
      class="grid w-full"
      style={{ "grid-template-columns": "repeat(3, 1fr)", gap: "2px" }}
      aria-label={`Ratings: IMDb ${imdbRating() || "N/A"}, RT ${props.movie.rtRating || "N/A"}, My score ${props.movie.rating || "N/A"}`}
    >
      <div
        class="rating-chip rating-chip-imdb justify-center"
        role="img"
        aria-label={`IMDb: ${imdbRating() || "-"}`}
      >
        <Icon
          name="star"
          fill
          style={{ color: "#f5c518", "font-size": "8px", "flex-shrink": "0" }}
        />
        <span style={{ color: "#f5c518" }}>{imdbRating() || "—"}</span>
      </div>
      <div
        class="rating-chip rating-chip-rt justify-center"
        role="img"
        aria-label={`Rotten Tomatoes: ${props.movie.rtRating || "-"}`}
      >
        <span
          style={{ "font-size": "7px", "line-height": "1", "flex-shrink": "0" }}
          aria-hidden="true"
        >
          🍅
        </span>
        <span style={{ color: "#ff7878" }}>{props.movie.rtRating || "—"}</span>
      </div>
      <div
        class="rating-chip rating-chip-user justify-center"
        role="img"
        aria-label={`My score: ${props.movie.rating || "Not rated"}`}
      >
        <Icon
          name="person"
          fill
          style={{ color: "var(--p)", "font-size": "8px", "flex-shrink": "0" }}
        />
        <span style={{ color: "var(--p)" }}>{props.movie.rating || "—"}</span>
      </div>
    </div>
  );
};

export default MovieCardRatings;
