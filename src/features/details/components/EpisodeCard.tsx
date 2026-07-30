// src/features/details/components/EpisodeCard.tsx
import { Show, createSignal, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRuntime } from "~/shared/utils/format";
import { SafeImage } from "~/shared/ui";
import type { TMDBEpisode } from "~/shared/types";

/**
 * EpisodeCard — a single episode in the expanded SeasonNavigator list.
 *
 * Layout:
 *   [16:9 still with E# overlay]   [Title / meta / overview]   [Toggle]
 *
 * The right-aligned circular toggle replaces the previous large
 * "MARK AS WATCHED" button row. Empty circle = unwatched, filled
 * checkmark = watched. Tapping flips the state and the parent
 * (SeasonNavigator.handleEpisodeToggle) advances or rewinds the
 * tracker accordingly.
 *
 * For non-vault titles, the toggle becomes a small "+" button that
 * triggers `onAddToVault` (calling out: "track this by adding it to
 * your vault first").
 *
 * v2.5 — REDESIGN RATIONALE:
 *   The old card had a prominent "Mark as Watched" button below the
 *   overview. This was visually heavy, took vertical space, and
 *   couldn't represent the watched state (the button only appeared
 *   for unwatched episodes — watched episodes had either nothing or
 *   a "Currently Watching" label, so the user had no way to UNWATCH
 *   an episode). The new circular toggle:
 *     - Always present (consistent affordance)
 *     - Compact (28px circle in the top-right corner)
 *     - Bidirectional (tap to mark watched, tap again to unwatch)
 *     - State-clear (filled check vs empty circle at a glance)
 */
export interface EpisodeCardProps {
  episode: TMDBEpisode;
  isCurrent: boolean;
  isWatched: boolean;
  inVault: boolean;
  /**
   * Called when the user taps the circular toggle.
   * `newWatched` is the desired new state:
   *   - true = user wants this episode marked as watched
   *   - false = user wants this episode marked as unwatched
   * The parent (SeasonNavigator) translates this into an
   * `onEpisodeChange` call that advances or rewinds the tracker.
   */
  onToggle: (newWatched: boolean) => void;
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
      year: "numeric"
    });
  };

  const hasOverview = () =>
    props.episode.overview && props.episode.overview.trim().length > 0;

  /**
   * "Watched" state for the toggle's visual treatment.
   *
   * The current episode (the one the tracker is on) is treated as
   * watched for toggle purposes — the user is on it because they
   * just finished the previous one, so it makes sense to show a
   * filled check. Tapping it then "unwatches" by rewinding the
   * tracker to the previous episode.
   */
  const isWatchedState = () => props.isWatched || props.isCurrent;

  const handleToggleClick = () => {
    // Flip the current state. The parent decides what tracker move
    // to make — EpisodeCard just signals intent.
    props.onToggle(!isWatchedState());
  };

  const toggleAriaLabel = () => {
    const epNum = props.episode.episode_number;
    return isWatchedState()
      ? `Mark episode ${epNum} as unwatched`
      : `Mark episode ${epNum} as watched`;
  };

  return (
    <article
      class={`episode-card${props.isCurrent ? " episode-card-current" : ""}${
        props.isWatched ? " episode-card-watched" : ""
      }`}
    >
      {/* Still + number overlay.
          The old watched badge that sat in the top-right of the still
          is gone — the toggle in the top-right of the card replaces it
          and is the single source of truth for watched state. */}
      <div class="episode-card-still-wrap">
        <SafeImage
          src={stillUrl()}
          alt=""
          class="episode-card-still"
          fallback={
            <div class="episode-card-still-fallback" aria-hidden="true">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "24px", color: "var(--text-dim)" }}
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
      </div>

      {/* Info — title, meta, overview */}
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
              <span style={{ color: "#f5c518" }}>
                ★ {props.episode.vote_average.toFixed(1)}
              </span>
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
      </div>

      {/* Right-aligned circular toggle — vault-aware.
          - In vault + watched: filled accent-color circle with check icon.
            Tap to unwatch (rewinds tracker to previous episode).
          - In vault + not watched: empty circle outline.
            Tap to watch (advances tracker to this episode).
          - Not in vault: small "+" button.
            Tap to add the whole title to the vault. */}
      <Show
        when={props.inVault}
        fallback={
          <button
            type="button"
            class="episode-card-add-btn"
            onClick={() => props.onAddToVault()}
            aria-label={`Add to watchlist to track episode ${props.episode.episode_number}`}
            title="Add to Watchlist to Track"
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "18px" }}
              aria-hidden="true"
            >
              add
            </span>
          </button>
        }
      >
        <button
          type="button"
          class={`episode-card-toggle${isWatchedState() ? " episode-card-toggle-watched" : ""}`}
          onClick={handleToggleClick}
          aria-label={toggleAriaLabel()}
          aria-pressed={isWatchedState()}
          title={isWatchedState() ? "Mark as unwatched" : "Mark as watched"}
        >
          <Show
            when={isWatchedState()}
            fallback={
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "20px" }}
                aria-hidden="true"
              >
                radio_button_unchecked
              </span>
            }
          >
            <span
              class="material-symbols-outlined"
              style={{
                "font-size": "20px",
                "font-variation-settings":
                  "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20"
              }}
              aria-hidden="true"
            >
              check_circle
            </span>
          </Show>
        </button>
      </Show>
    </article>
  );
};

export default EpisodeCard;
