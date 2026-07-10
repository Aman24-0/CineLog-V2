// src/features/details/components/EpisodeCard.tsx
import { Show, createSignal, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRuntime } from "~/shared/utils/format";
import { SafeImage } from "~/shared/ui";
import type { TMDBEpisode } from "~/shared/types";

/**
 * EpisodeCard — a single episode in the expanded SeasonNavigator list.
 *
 * Shows: still + episode number overlay + watched badge, then episode
 * title / runtime / air date / vote average, an expandable overview,
 * and a vault-aware action button:
 *   - Non-vault: "Add to Vault to Track" CTA
 *   - Vault + not watched: "Mark as Watched" (advances tracker)
 *   - Vault + watched + current: "Currently Watching" label
 *   - Vault + watched + not current: no action
 */
export interface EpisodeCardProps {
  episode: TMDBEpisode;
  isCurrent: boolean;
  isWatched: boolean;
  inVault: boolean;
  onMarkWatched: () => void;
  onAddToVault: () => void;
}

const EpisodeCard: Component<EpisodeCardProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  const stillUrl = () =>
    props.episode.still_path ? tmdbImage(props.episode.still_path, "w342") : "";

  const formattedAirDate = () => {
    if (!props.episode.air_date) return null;
    const d = new Date(props.episode.air_date);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const hasOverview = () =>
    props.episode.overview && props.episode.overview.trim().length > 0;

  return (
    <article
      class={`episode-card${props.isCurrent ? " episode-card-current" : ""}${
        props.isWatched ? " episode-card-watched" : ""
      }`}
    >
      {/* Still + number overlay */}
      <div class="episode-card-still-wrap">
        <SafeImage
          src={stillUrl()}
          alt=""
          class="episode-card-still"
          fallback={
            <div class="episode-card-still-fallback" aria-hidden="true">
              <span
                class="material-symbols-outlined"
                style="font-size: 24px; color: var(--text-dim)"
                aria-hidden="true"
              >
                movie
              </span>
            </div>
          }
        />
        <span class="episode-card-number" aria-hidden="true">
          E{props.episode.episode_number}
        </span>
        <Show when={props.isWatched}>
          <span class="episode-card-watched-badge" aria-label="Watched">
            <span
              class="material-symbols-outlined"
              style="font-size: 12px"
              aria-hidden="true"
            >
              check_circle
            </span>
          </span>
        </Show>
      </div>

      {/* Info + actions */}
      <div class="episode-card-body">
        <div class="episode-card-header">
          <h4 class="episode-card-title">
            {props.episode.name || `Episode ${props.episode.episode_number}`}
          </h4>
          <div class="episode-card-meta">
            <Show when={props.episode.runtime}>
              <span>{formatRuntime(props.episode.runtime!)}</span>
            </Show>
            <Show when={formattedAirDate()}>
              <span>{formattedAirDate()}</span>
            </Show>
            <Show when={props.episode.vote_average > 0}>
              <span style="color: #f5c518">★ {props.episode.vote_average.toFixed(1)}</span>
            </Show>
          </div>
        </div>

        {/* Overview — truncated, expandable */}
        <Show when={hasOverview()}>
          <Show
            when={expanded()}
            fallback={
              <p class="episode-card-overview episode-card-overview-clamped">
                {props.episode.overview}
              </p>
            }
          >
            <p class="episode-card-overview">{props.episode.overview}</p>
          </Show>
          <button
            type="button"
            class="episode-card-expand"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded() ? "Collapse overview" : "Expand overview"}
          >
            {expanded() ? "Less" : "More"}
          </button>
        </Show>

        {/* Action — vault-aware */}
        <div class="episode-card-actions">
          <Show
            when={props.inVault}
            fallback={
              <button
                type="button"
                class="episode-card-action episode-card-action-add"
                onClick={() => props.onAddToVault()}
                aria-label="Add to vault to track this episode"
              >
                <span
                  class="material-symbols-outlined"
                  style="font-size: 14px"
                  aria-hidden="true"
                >
                  add
                </span>
                Add to Vault to Track
              </button>
            }
          >
            <Show
              when={!props.isWatched}
              fallback={
                <Show when={props.isCurrent}>
                  <span class="episode-card-current-label">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 14px"
                      aria-hidden="true"
                    >
                      play_arrow
                    </span>
                    Currently Watching
                  </span>
                </Show>
              }
            >
              <button
                type="button"
                class="episode-card-action episode-card-action-watch"
                onClick={() => props.onMarkWatched()}
                aria-label={`Mark episode ${props.episode.episode_number} as watched`}
              >
                <span
                  class="material-symbols-outlined"
                  style="font-size: 14px"
                  aria-hidden="true"
                >
                  check
                </span>
                Mark as Watched
              </button>
            </Show>
          </Show>
        </div>
      </div>
    </article>
  );
};

export default EpisodeCard;
