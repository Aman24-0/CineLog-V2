// src/shared/ui/MovieCard.tsx
import { createSignal, Show, Component } from "solid-js";
import Icon from "./Icon";
import HighlightText from "./HighlightText";
import { formatRuntime } from "~/shared/utils/format";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { WatchlistItem } from "~/shared/types";

interface MovieCardProps {
  movie: WatchlistItem;
  search?: string;
  onClick: () => void;
}

/**
 * Premium MovieCard — CineLog's visual identity.
 *
 * Design:
 *  - 2:3 poster ratio with refined gradient overlay (top + bottom fade)
 *  - Status-aware badge (top-left): Planned=accent, Watching=green, Completed=blue
 *  - Tag / New Season badge (top-right)
 *  - Bottom info cluster: 2-line title, year·type·runtime metadata, 3 rating chips
 *  - Premium hover: card lifts, border glows accent, poster dims + scales
 *  - Touch feedback via .vault-card-premium active state
 *  - Image loading: shimmer skeleton → fade-in
 *
 * The card is shared between Vault grid and RecentlyAdded rail, so it must
 * be self-contained and not depend on parent context.
 */
const MovieCard: Component<MovieCardProps> = (props) => {
  const [imgLoaded, setImgLoaded] = createSignal(false);
  const [imgError, setImgError] = createSignal(false);

  const title = () => props.movie.title || props.movie.name || "Untitled";
  const year = () =>
    (props.movie.release_date || props.movie.first_air_date || "").split("-")[0] || "";

  const statusLabel = () => {
    const s = props.movie.status;
    if (s === "Plan to Watch" || s === "Planned") return "Planned";
    if (s === "Watching") return "Watching";
    if (s === "Completed") return "Completed";
    return s || "New";
  };

  // Status-aware badge class for color coding
  const statusBadgeClass = () => {
    const s = props.movie.status;
    if (s === "Plan to Watch" || s === "Planned") return "status-badge-planned";
    if (s === "Watching") return "status-badge-watching";
    if (s === "Completed") return "status-badge-completed";
    return "status-badge-planned";
  };

  // First platform for visibility (if available)
  const firstPlatform = () => props.movie.platformsList?.[0];

  return (
    <div
      onClick={() => props.onClick()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick();
        }
      }}
      class="vault-card-premium animate-fade-up touch-ripple"
      role="button"
      tabindex={0}
      aria-label={`${title()}${year() ? `, ${year()}` : ""} — ${statusLabel()}`}
    >
      <div class="vault-card-inner">
        {/* Loading skeleton */}
        <Show when={!imgLoaded() && !imgError()}>
          <div class="poster-loading" aria-hidden="true">
            <div
              style="
                position: absolute; top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                display: flex; flex-direction: column; align-items: center; gap: 8px;
                opacity: 0.10;
              "
            >
              <Icon name="movie" style="font-size: 28px; color: white; pointer-events: none" />
            </div>
          </div>
        </Show>

        {/* Poster image with fallback */}
        <Show
          when={props.movie.poster_path && !imgError()}
          fallback={
            <div
              class="absolute inset-0 flex flex-col items-center justify-center gap-2"
              style="background: linear-gradient(145deg, var(--tier-3), var(--tier-2)); z-index: 1"
              aria-hidden="true"
            >
              <Icon name="movie" style="color: var(--text-dim); font-size: 36px" />
              <span
                style="color: var(--text-dim); font-size: 8px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; font-family: 'Azeret Mono', monospace"
              >
                No Poster
              </span>
            </div>
          }
        >
          <img
            src={tmdbImage(props.movie.poster_path, "w500")}
            class={`vault-card-poster${imgLoaded() ? " img-loaded" : ""}`}
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
            onLoad={(e) => {
              setImgLoaded(true);
              e.currentTarget.classList.add("img-loaded");
            }}
            onError={() => setImgError(true)}
          />
        </Show>

        {/* Status badge (top-left) — status-aware color */}
        <div
          class={`tag-chip absolute top-2 left-2 ${statusBadgeClass()}`}
          style="z-index: 3; max-width: calc(100% - 60px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
          aria-hidden="true"
        >
          {statusLabel()}
        </div>

        {/* Tag / New Season badge (top-right) */}
        <Show
          when={props.movie.newSeasonAvailable}
          fallback={
            <Show when={props.movie.tag}>
              <div
                class="tag-chip absolute top-2 right-2"
                style="z-index: 3; max-width: 60px; color: rgba(255,255,255,0.85); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                aria-hidden="true"
              >
                {props.movie.tag}
              </div>
            </Show>
          }
        >
          <div
            class="badge-glow absolute top-2 right-2"
            style="z-index: 3; white-space: nowrap; max-width: none; font-size: 7px; padding: 3px 8px;"
            aria-hidden="true"
          >
            New Season
          </div>
        </Show>

        {/* Bottom info cluster */}
        <div class="absolute bottom-0 left-0 w-full p-2.5" style="z-index: 3">
          {/* Title — 2-line clamp for longer titles */}
          <p
            class="type-card-title mb-0.5"
            style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.25; min-height: 1.7em;"
          >
            <HighlightText text={title()} search={props.search} />
          </p>

          {/* Metadata row: year · type · runtime · platform */}
          <p class="type-subtitle mb-1.5" aria-hidden="true">
            {year()}
            {year() ? " · " : ""}
            {props.movie.media_type === "tv" ? "Series" : "Movie"}
            <Show when={props.movie.runtime && props.movie.runtime > 0}>
              {" · "}{formatRuntime(props.movie.runtime)}
            </Show>
            <Show when={firstPlatform()}>
              {" · "}{firstPlatform()}
            </Show>
          </p>

          {/* Rating chips — 3 independent sources */}
          <div
            class="grid w-full"
            style="grid-template-columns: repeat(3, 1fr); gap: 2px;"
            aria-label={`Ratings: IMDb ${props.movie.imdbRating || "N/A"}, RT ${props.movie.rtRating || "N/A"}, My score ${props.movie.rating || "N/A"}`}
          >
            <div
              class="rating-chip rating-chip-imdb justify-center"
              role="img"
              aria-label={`IMDb: ${props.movie.imdbRating || "-"}`}
            >
              <Icon name="star" fill style="color: #f5c518; font-size: 8px; flex-shrink: 0" />
              <span style="color: #f5c518;">
                {props.movie.imdbRating || "—"}
              </span>
            </div>

            <div
              class="rating-chip rating-chip-rt justify-center"
              role="img"
              aria-label={`Rotten Tomatoes: ${props.movie.rtRating || "-"}`}
            >
              <span style="font-size: 7px; line-height: 1; flex-shrink: 0" aria-hidden="true">🍅</span>
              <span style="color: #ff7878;">
                {props.movie.rtRating || "—"}
              </span>
            </div>

            <div
              class="rating-chip rating-chip-user justify-center"
              role="img"
              aria-label={`My score: ${props.movie.rating || "Not rated"}`}
            >
              <Icon name="person" fill style="color: var(--p); font-size: 8px; flex-shrink: 0" />
              <span style="color: var(--p);">
                {props.movie.rating || "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovieCard;
