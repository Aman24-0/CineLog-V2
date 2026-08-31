// src/features/details/components/EpisodeCard.tsx
import { Show, createSignal, For, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRuntime } from "~/shared/utils/format";
import { SafeImage } from "~/shared/ui";
import { GlassModal } from "~/shared/ui/glass";
import ReactionPicker from "~/shared/ui/ReactionPicker";
import { normalizeReaction } from "~/shared/data/reactions";
import { ratingScale } from "~/core/preferences";
import type { TMDBEpisode } from "~/shared/types";
import type {
  EpisodeFeedback,
  EpisodeReaction
} from "~/lib/supabase/repositories";

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
 * EPISODE FEEDBACK:
 *   When a watched/current vault episode is rateable, MORE and RATE share
 *   one compact action row. RATE opens a centered dialog with the user's
 *   configured 5- or 10-point rating scale plus Love, Funny, Wow, Sad,
 *   Angry, and Disappointed reactions. Save persists both fields together;
 *   selecting the active value again clears that value. Thumbs-only users
 *   still get the reaction picker while the numeric rating field is hidden.
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
  /** Existing persisted rating/reaction for this episode. */
  feedback?: EpisodeFeedback;
  /**
   * Save the complete selection from the centered RATE dialog.
   * The parent persists rating and reaction atomically.
   */
  onFeedback?: (
    rating: number | null,
    reaction: EpisodeReaction | null
  ) => void;
  /** Legacy numeric-only callback retained for compatibility. */
  onRate?: (rating: number | null) => void;
}

export function canRateEpisode(
  props: Pick<
    EpisodeCardProps,
    "inVault" | "isWatched" | "isCurrent" | "onRate"
  >,
  scale: string
): boolean {
  return (
    props.inVault &&
    (props.isWatched || props.isCurrent) &&
    scale !== "thumbs" &&
    typeof props.onRate === "function"
  );
}

export function canOpenEpisodeFeedback(
  props: Pick<
    EpisodeCardProps,
    "inVault" | "isWatched" | "isCurrent" | "onFeedback" | "onRate"
  >
): boolean {
  return (
    props.inVault &&
    (props.isWatched || props.isCurrent) &&
    (typeof props.onFeedback === "function" ||
      typeof props.onRate === "function")
  );
}

// Common reaction vocabulary — shared with the Movie/TV Activity
// Edit modal via `src/shared/data/reactions.ts`. The EpisodeCard rate
// dialog uses ReactionPicker for consistency. Old saved reactions
// (love, wow, disappointed) are normalized at display time via
// `normalizeReaction` so existing episode ratings continue to show
// the correct reaction without a DB migration.
const REACTION_OPTIONS: ReadonlyArray<{
  value: EpisodeReaction;
  label: string;
  emoji: string;
}> = [
  { value: "loved_it", label: "Loved it", emoji: "😍" },
  { value: "funny", label: "Funny", emoji: "😂" },
  { value: "sad", label: "Sad", emoji: "😭" },
  { value: "shocked", label: "Shocked", emoji: "🤯" },
  { value: "scared", label: "Scared", emoji: "😱" },
  { value: "thoughtful", label: "Thoughtful", emoji: "🤔" },
  { value: "angry", label: "Angry", emoji: "🤬" },
  { value: "bored", label: "Bored", emoji: "🥱" }
];

const EpisodeCard: Component<EpisodeCardProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const [rateDialogOpen, setRateDialogOpen] = createSignal(false);
  const [draftRating, setDraftRating] = createSignal<number | null>(null);
  const [draftReaction, setDraftReaction] =
    createSignal<EpisodeReaction | null>(null);
  const [isSavingFeedback, setIsSavingFeedback] = createSignal(false);

  // Keep the local display state aligned with the hydrated parent map. The
  // fallback to `props.rating` preserves the legacy prop contract while the
  // new feedback map is loading or when an older caller is still mounted.
  const [localRating, setLocalRating] = createSignal<number | null>(
    props.feedback?.rating ?? props.rating ?? null
  );
  const [localReaction, setLocalReaction] =
    createSignal<EpisodeReaction | null>(props.feedback?.reaction ?? null);
  let lastPropRating = props.feedback?.rating ?? props.rating ?? null;
  let lastPropReaction = props.feedback?.reaction ?? null;
  const syncFeedbackFromProps = () => {
    const propRating = props.feedback?.rating ?? props.rating ?? null;
    const propReaction = props.feedback?.reaction ?? null;
    if (propRating !== lastPropRating || propReaction !== lastPropReaction) {
      lastPropRating = propRating;
      lastPropReaction = propReaction;
      setLocalRating(propRating);
      setLocalReaction(propReaction);
    }
  };

  const currentRating = (): number | null => {
    syncFeedbackFromProps();
    return localRating();
  };
  const currentReaction = (): EpisodeReaction | null => {
    syncFeedbackFromProps();
    return localReaction();
  };

  const canOpenFeedback = (): boolean => canOpenEpisodeFeedback(props);
  const ratingMax = (): number => (ratingScale() === "5star" ? 5 : 10);

  const openFeedbackDialog = (): void => {
    setDraftRating(currentRating());
    setDraftReaction(currentReaction());
    setRateDialogOpen(true);
  };

  const closeFeedbackDialog = (): void => {
    if (!isSavingFeedback()) setRateDialogOpen(false);
  };

  const selectDraftRating = (star: number): void => {
    setDraftRating((current) => (current === star ? null : star));
  };

  const saveFeedback = async (): Promise<void> => {
    if (isSavingFeedback()) return;
    setIsSavingFeedback(true);
    try {
      if (props.onFeedback) {
        await props.onFeedback(draftRating(), draftReaction());
      } else {
        props.onRate?.(draftRating());
      }
      setLocalRating(draftRating());
      setLocalReaction(draftReaction());
      setRateDialogOpen(false);
    } finally {
      setIsSavingFeedback(false);
    }
  };

  const feedbackSummary = (): string | null => {
    const rating = currentRating();
    // Normalize legacy reactions (love→loved_it, wow→shocked,
    // disappointed→bored) so the summary shows the new label even
    // for old saved values.
    const reaction = normalizeReaction(currentReaction());
    if (rating == null && reaction == null) return null;
    const parts = [rating != null ? `★ ${rating}/${ratingMax()}` : null];
    const reactionLabel = reaction
      ? REACTION_OPTIONS.find((option) => option.value === reaction)?.label
      : null;
    if (reactionLabel) parts.push(reactionLabel);
    return parts.filter(Boolean).join(" · ");
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

        {/* Overview — truncated, expandable. The MORE action and the RATE
            action share one compact row so episode cards stay scannable. */}
        <div class="episode-card-actions">
          <Show when={hasOverview()}>
            <button
              type="button"
              class="episode-card-expand"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded() ? "Collapse overview" : "Expand overview"}
            >
              {expanded() ? "Less" : "More"}
            </button>
          </Show>
          <Show when={canOpenFeedback()}>
            <button
              type="button"
              class="episode-card-rate-button focus-ring"
              onClick={(event) => {
                event.stopPropagation();
                openFeedbackDialog();
              }}
              aria-haspopup="dialog"
              aria-label={`Rate episode ${props.episode.episode_number}`}
            >
              Rate
            </button>
          </Show>
          <Show when={feedbackSummary()}>
            <span class="episode-card-feedback-summary">
              {feedbackSummary()}
            </span>
          </Show>
        </div>

        <GlassModal
          open={rateDialogOpen()}
          onClose={closeFeedbackDialog}
          title={`Rate Episode ${props.episode.episode_number}`}
          icon="rate_review"
          size="md"
          class="episode-rating-dialog"
          id={`episode-rating-${props.episode.id}`}
        >
          <div class="episode-rating-dialog-body">
            <Show when={ratingScale() !== "thumbs"}>
              <fieldset class="episode-rating-fieldset">
                <legend>Rating</legend>
                <div
                  class={`episode-rating-dialog-stars episode-rating-dialog-stars--${ratingMax()}`}
                  role="radiogroup"
                  aria-label={`Rating for episode ${props.episode.episode_number}`}
                >
                  <For
                    each={Array.from(
                      { length: ratingMax() },
                      (_, index) => index + 1
                    )}
                  >
                    {(star) => (
                      <button
                        type="button"
                        class={`episode-rating-dialog-star focus-ring${
                          (draftRating() ?? 0) >= star ? " is-active" : ""
                        }`}
                        onClick={() => selectDraftRating(star)}
                        role="radio"
                        aria-checked={draftRating() === star}
                        aria-label={
                          draftRating() === star
                            ? `Clear rating`
                            : `Rate ${star} of ${ratingMax()}`
                        }
                      >
                        <span
                          class="material-symbols-outlined"
                          aria-hidden="true"
                        >
                          star
                        </span>
                        <span class="episode-rating-dialog-star-value">
                          {star}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </fieldset>
            </Show>

            <fieldset class="episode-reaction-fieldset">
              <legend>Reaction</legend>
              {/* Common ReactionPicker — shared with the Movie/TV
                  Activity Edit modal. The draft reaction is
                  normalized from legacy values via
                  `normalizeReaction` so old saved reactions display
                  correctly in the new vocabulary. */}
              <ReactionPicker
                value={normalizeReaction(draftReaction())}
                onChange={(r) => setDraftReaction(r as EpisodeReaction | null)}
                disabled={isSavingFeedback()}
              />
            </fieldset>

            <div class="episode-rating-dialog-actions">
              <button
                type="button"
                class="episode-rating-dialog-cancel focus-ring"
                onClick={closeFeedbackDialog}
                disabled={isSavingFeedback()}
              >
                Cancel
              </button>
              <button
                type="button"
                class="episode-rating-dialog-save focus-ring"
                onClick={() => void saveFeedback()}
                disabled={isSavingFeedback()}
              >
                {isSavingFeedback() ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </GlassModal>
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
