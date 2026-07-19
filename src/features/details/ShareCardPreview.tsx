// src/features/details/ShareCardPreview.tsx
//
// ShareCardPreview — the visual share card shown in the ShareSheet
// and used as the source for PNG generation via html-to-image.
//
// DESIGN
// ------
// The card is a 500px-wide green tile with:
//   • Poster image (TMDB w500) at the top, 280px tall, with a soft
//     gradient fading into the card body
//   • Brand row (top-left): popcorn icon + "CINELOG"
//   • Type badge (top-right): "MOVIE" or "SERIES"
//   • Body:
//       - Title (Bebas Neue, large)
//       - Rating row (★ X.X/10) — pill-shaped chip
//       - Release date row (📅 Released: Mon D, YYYY)
//       - For series: stats row with # Seasons and # Episodes
//       - Genres as chips
//       - Overview (clamped to 4 lines)
//   • CTA footer (dashed top border):
//       - Brand icon (gradient square with popcorn)
//       - Headline: "Start tracking your cinema log on CineLog"
//       - URL: the deep link, truncated
//
// The card is rendered at fixed pixel dimensions so html-to-image
// produces a consistent PNG. On small screens the visible preview
// scales down via CSS transform (see share.css), but the offscreen
// render-target stays at 1:1.
//
// The component reads from a TMDBDetails object (the rich payload
// from /movie/{id} or /tv/{id} with append_to_response). It also
// accepts the deep-link URL as a prop so it can be configured
// independently of the title metadata.

import { Show, For, type Accessor } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import {
  resolveTitle,
  resolveReleaseDate,
  formatReleaseDate,
  truncateOverview,
} from "~/shared/utils/share";
import type { TMDBDetails } from "~/shared/types";

export interface ShareCardPreviewProps {
  /** Rich TMDB details (poster, genres, overview, vote_average, seasons) */
  details: Accessor<TMDBDetails | null>;
  /** "movie" | "tv" — drives the type badge and series-only rows */
  mediaType: Accessor<"movie" | "tv">;
  /** The TMDB id used to build the deep link URL */
  tmdbId: Accessor<string | number>;
  /** The deep link URL to display in the CTA. Computed by parent. */
  shareUrl: Accessor<string>;
  /**
   * When true, the card renders with the .share-card-offscreen class
   * so it's positioned off-screen at exact 1:1 dimensions for PNG
   * generation. When false (default), it's the visible preview.
   */
  forCapture?: boolean;
}

export default function ShareCardPreview(props: ShareCardPreviewProps) {
  const title = () => resolveTitle(props.details());
  const releaseDate = () => formatReleaseDate(resolveReleaseDate(props.details()));
  const hasRating = () => props.details()?.vote_average && props.details()!.vote_average! > 0;
  const overview = () => truncateOverview(props.details()?.overview ?? "", 320);
  const genres = () => props.details()?.genres ?? [];
  const posterUrl = () => tmdbImage(props.details()?.poster_path, "w500");
  const isSeries = () => props.mediaType() === "tv";
  const numSeasons = () => props.details()?.number_of_seasons ?? 0;
  const numEpisodes = () => props.details()?.number_of_episodes ?? 0;
  const displayUrl = () => {
    // Show just the path portion in the CTA so it's readable
    try {
      const u = new URL(props.shareUrl());
      return u.pathname;
    } catch {
      return props.shareUrl();
    }
  };

  return (
    <div class={`share-card ${props.forCapture ? "share-card-offscreen" : ""}`}>
      {/* Poster header */}
      <div
        class="share-card-poster"
        style={posterUrl() ? { "background-image": `url(${posterUrl()})` } : {}}
      >
        <div class="share-card-brand">
          <span class="material-symbols-outlined share-card-brand-icon" aria-hidden="true">
            movie
          </span>
          <span class="share-card-brand-text">CINELOG</span>
        </div>
        <div class="share-card-type-badge">
          {isSeries() ? "SERIES" : "MOVIE"}
        </div>
      </div>

      {/* Body */}
      <div class="share-card-body">
        <h2 class="share-card-title">{title()}</h2>

        {/* Rating chip + release date row */}
        <Show when={hasRating()}>
          <div class="share-card-rating-big">
            <span class="material-symbols-outlined share-card-rating-star" aria-hidden="true">
              star
            </span>
            <span class="share-card-rating-value">{props.details()?.vote_average?.toFixed(1)}</span>
            <span class="share-card-rating-max">/ 10</span>
          </div>
        </Show>

        <Show when={releaseDate()}>
          <div class="share-card-meta-row" style={{ "margin-top": "0.625rem" }}>
            <span class="material-symbols-outlined share-card-meta-icon" aria-hidden="true">
              calendar_month
            </span>
            <span class="share-card-meta-label">Released:</span>
            <span class="share-card-meta-value">{releaseDate()}</span>
          </div>
        </Show>

        {/* Series-specific stats */}
        <Show when={isSeries() && (numSeasons() > 0 || numEpisodes() > 0)}>
          <div class="share-card-series-info">
            <Show when={numSeasons() > 0}>
              <div class="share-card-series-stat">
                <div class="share-card-series-stat-label">Seasons</div>
                <div class="share-card-series-stat-value">{numSeasons()}</div>
              </div>
            </Show>
            <Show when={numEpisodes() > 0}>
              <div class="share-card-series-stat">
                <div class="share-card-series-stat-label">Episodes</div>
                <div class="share-card-series-stat-value">{numEpisodes()}</div>
              </div>
            </Show>
          </div>
        </Show>

        {/* Genres as chips */}
        <Show when={genres().length > 0}>
          <div class="share-card-genres">
            <For each={genres().slice(0, 5)}>
              {(g) => <span class="share-card-genre-chip">{g.name}</span>}
            </For>
          </div>
        </Show>

        {/* Overview */}
        <Show when={overview()}>
          <p class="share-card-overview">{overview()}</p>
        </Show>

        {/* CTA footer */}
        <div class="share-card-cta">
          <div class="share-card-cta-icon">
            <span class="material-symbols-outlined" aria-hidden="true">
              movie_filter
            </span>
          </div>
          <div class="share-card-cta-text">
            <p class="share-card-cta-headline">Start tracking your cinema log on CineLog</p>
            <p class="share-card-cta-sub">{displayUrl()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
