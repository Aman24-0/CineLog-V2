// src/features/details/components/EpisodeCard.tsx
import { Show, createSignal, For, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRuntime } from "~/shared/utils/format";
import { SafeImage } from "~/shared/ui";
import { ratingScale } from "~/core/preferences";
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
 *
 * Phase 6 Task 2 — EPISODE RATING:
 *   When the episode is watched AND the user is in the vault AND the
 *   user's ratingScale is "5star" or "10star" (NOT "thumbs"), a row
 *   of star buttons appears below the overview. Tapping a star:
 *     • Sets the rating (1-N depending on the scale).
 *     • Calls onRate(rating) which persists it to the
 *       `episode_progress.rating` column.
 *   Tapping the same star again clears the rating (sets it to null).
 *   For "thumbs" users, the rating row is hidden — thumbs-up/down
 *   doesn't translate to a 1-N scale.
 */
export interface EpisodeCardProps {
  episode: TMDBEpisode;
  isCurrent: boolean;
  isWatched: boolean;
  inVault: boolean;
  /**
   * The user's existing rating for this episode (1-N), or null/undefined
   * if no rating has been set. Phase 6 Task 2.
   */
  rating?: number | null;
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
  /**
   * Phase 6 Task 2 — Called when the user picks a star rating.
   * `rating` is the new rating (1-N), or null to clear. The parent
   * (SeasonNavigator → useDetailsProgress.handleEpisodeRating)
   * persists it via `updateEpisodeRatingInSupabase`.
   */
  onRate?: (rating: number | null) => void;
}

export function canRateEpisode(
  props: Pick<EpisodeCardProps, "inVault" | "isWatched" | "isCurrent" | "onRate">,
  scale: string
): boolean {
  return props.inVault &&
    (props.isWatched || props.isCurrent) &&
    scale !== "thumbs" &&
    typeof props.onRate === "function";
}

const EpisodeCard: Component<EpisodeCardProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  // Local rating signal for optimistic UI — the parent's `rating` prop
  // is the source of truth, but we keep a local copy so the star the
  // user just clicked highlights IMMEDIATELY before the server round-
  // trip completes. The local signal resets whenever the prop changes
  // (e.g. on a vault refresh).
  const [localRating, setLocalRating] = createSignal<number | null>(
    props.rating ?? null
  );

  // Keep localRating in sync with the prop. When the parent's rating
  // changes (e.g. after a vault refresh picks up the persisted value),
  // we update the local signal so the stars reflect the canonical state.
  // We use createEffect-like behavior via a derived signal: read the
  // prop on every render and reset localRating when it changes.
  // SolidJS doesn't have a built-in "sync signal to prop" primitive,
  // so we use a createEffect-free approach: track the last-seen prop
  // value and reset localRating when it differs.
  let lastPropRating = props.rating ?? null;
  const currentRating = (): number | null => {
    const propRating = props.rating ?? null;
    if (propRating !== lastPropRating) {
      lastPropRating = propRating;
      setLocalRating(propRating);
    }
    return localRating();
  };

  // Whether to show the rating row at all. The current tracker episode is
  // also a completed/watched episode in CineLog's model (the toggle already
  // uses the same `isWatched || isCurrent` rule), so it must remain rateable.
  const showRatingRow = (): boolean =>
    canRateEpisode(props, ratingScale());

  // The max value for the rating scale — 5 for "5star", 10 for "10star".
  const ratingMax = (): number => (ratingScale() === "5star" ? 5 : 10);

  const handleStarClick = (star: number): void => {
    if (!props.onRate) return;
    const cur = currentRating();
    // Tap the same star again → clear the rating.
    const next = cur === star ? null : star;
    setLocalRating(next);
    props.onRate(next);
  };

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

          {/* Phase 6 Task 2 — Per-episode rating row.
            Renders only when: in vault + watched/current + scale != "thumbs" +
            onRate callback is provided. Each star is a button so the row is
            keyboard-accessible. Tapping a star sets the rating;
            tapping the same star again clears it (toggle behavior). */}
        <Show when={showRatingRow()}>
          <div
            class="episode-card-rating"
            role="radiogroup"
            aria-label={`Rating for episode ${props.episode.episode_number}`}
            style={{
              display: "flex",
              "align-items": "center",
              gap: "2px",
              "margin-top": "6px"
            }}
          >
            <For each={Array.from({ length: ratingMax() }, (_, i) => i + 1)}>
              {(star) => {
                const isActive = () =>
                  (currentRating() ?? 0) >= star;
                return (
                  <button
                    type="button"
                    class="episode-card-star focus-ring"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStarClick(star);
                    }}
                    aria-label={
                      currentRating() === star
                        ? `Clear rating`
                        : `Rate ${star} of ${ratingMax()}`
                    }
                    aria-checked={currentRating() === star}
                    role="radio"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px",
                      "font-size": "16px",
                      "line-height": "1",
                      color: isActive() ? "#f5c518" : "var(--text-dim)",
                      transition: "color 0.15s ease"
                    }}
                    title={`Rate ${star} of ${ratingMax()}`}
                  >
                    <span
                      class="material-symbols-outlined"
                      style={{
                        "font-size": "16px",
                        "font-variation-settings": isActive()
                          ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 16"
                          : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 16"
                      }}
                      aria-hidden="true"
                    >
                      star
                    </span>
                  </button>
                );
              }}
            </For>
            <Show when={currentRating() != null}>
              <button
                type="button"
                class="episode-card-rating-clear focus-ring"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStarClick(currentRating()!);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 4px",
                  "margin-left": "4px",
                  "font-size": "0.625rem",
                  color: "var(--text-dim)",
                  "font-family": "'Outfit', sans-serif"
                }}
                aria-label="Clear episode rating"
                title="Clear rating"
              >
                clear
              </button>
            </Show>
          </div>
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
