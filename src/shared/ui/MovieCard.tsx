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

const MovieCard: Component<MovieCardProps> = (props) => {
  const [imgLoaded, setImgLoaded] = createSignal(false);
  const [imgError, setImgError] = createSignal(false);

  const title = () => props.movie.title || props.movie.name || "Untitled";
  const year = () =>
    (props.movie.release_date || props.movie.first_air_date || "").split("-")[0] || "";

  const statusLabel = () => {
    const s = props.movie.status;
    if (s === "Plan to Watch") return "Planned";
    if (s === "Watching") return "Watching";
    if (s === "Completed") return "Completed";
    if (s === "Planned") return "Planned";
    return s || "New";
  };

  return (
    <div
      onClick={() => props.onClick()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick();
        }
      }}
      class="movie-card animate-fade-up"
      role="button"
      tabindex={0}
      aria-label={`${title()}${year() ? `, ${year()}` : ""} — ${statusLabel()}`}
    >
      <div class="movie-card-inner">
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

        <Show
          when={props.movie.poster_path && !imgError()}
          fallback={
            <div
              class="absolute inset-0 flex flex-col items-center justify-center gap-2"
              style="background: linear-gradient(145deg, #1a1a1a, #111); z-index: 1"
              aria-hidden="true"
            >
              <Icon name="movie" style="color: rgba(255,255,255,0.08); font-size: 36px" />
              <span
                style="color: rgba(255,255,255,0.08); font-size: 8px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; font-family: 'Azeret Mono', monospace"
              >
                No Poster
              </span>
            </div>
          }
        >
          <img
            src={tmdbImage(props.movie.poster_path, "w500")}
            class={`movie-card-poster${imgLoaded() ? " img-loaded" : ""}`}
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

        <div
          class="tag-chip absolute top-2 left-2"
          style="color: var(--p); z-index: 3; max-width: calc(100% - 60px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
          aria-hidden="true"
        >
          {statusLabel()}
        </div>

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
            class="tag-chip absolute top-2 right-2"
            style="color: var(--p); border-color: color-mix(in srgb, var(--p) 55%, transparent); box-shadow: 0 0 12px var(--p-glow); z-index: 3; white-space: nowrap; max-width: none"
            aria-hidden="true"
          >
            New Season
          </div>
        </Show>

        <div class="absolute bottom-0 left-0 w-full p-2.5" style="z-index: 3">
          <p
            class="type-card-title mb-0.5"
            style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.25; min-height: 1.7em;"
          >
            <HighlightText text={title()} search={props.search} />
          </p>

          <p class="type-subtitle mb-1.5" aria-hidden="true">
            {year()}
            {year() ? " · " : ""}
            {props.movie.media_type === "tv" ? "Series" : "Movie"}
            <Show when={props.movie.runtime && props.movie.runtime > 0}>
              {" · "}{formatRuntime(props.movie.runtime)}
            </Show>
          </p>

          <div
            class="grid w-full"
            style="grid-template-columns: repeat(3, 1fr); gap: 2px;"
            aria-label={`Ratings: IMDb ${props.movie.imdbRating || "N/A"}, RT ${props.movie.rtRating || "N/A"}, My score ${props.movie.rating || "N/A"}`}
          >
            <div
              class="rating-pill justify-center"
              style="border-color: rgba(245,197,24,0.3); padding: 2px 3px; border-radius: 5px; gap: 2px; min-width: 0"
              role="img"
              aria-label={`IMDb: ${props.movie.imdbRating || "-"}`}
            >
              <Icon name="star" fill style="color: #f5c518; font-size: 8px; flex-shrink: 0" />
              <span
                style="color: #f5c518; font-size: 7.5px; font-weight: 700; line-height: 1; font-family: 'Outfit', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
              >
                {props.movie.imdbRating || "—"}
              </span>
            </div>

            <div
              class="rating-pill justify-center"
              style="border-color: rgba(255,90,80,0.3); padding: 2px 3px; border-radius: 5px; gap: 2px; min-width: 0"
              role="img"
              aria-label={`Rotten Tomatoes: ${props.movie.rtRating || "-"}`}
            >
              <span style="font-size: 7px; line-height: 1; flex-shrink: 0" aria-hidden="true">🍅</span>
              <span
                style="color: #ff7878; font-size: 7.5px; font-weight: 700; line-height: 1; font-family: 'Outfit', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
              >
                {props.movie.rtRating || "—"}
              </span>
            </div>

            <div
              class="rating-pill justify-center"
              style="border-color: color-mix(in srgb, var(--p) 35%, transparent); padding: 2px 3px; border-radius: 5px; gap: 2px; min-width: 0"
              role="img"
              aria-label={`My score: ${props.movie.rating || "Not rated"}`}
            >
              <Icon name="person" fill style="color: var(--p); font-size: 8px; flex-shrink: 0" />
              <span
                style="color: var(--p); font-size: 7.5px; font-weight: 700; line-height: 1; font-family: 'Outfit', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
              >
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
