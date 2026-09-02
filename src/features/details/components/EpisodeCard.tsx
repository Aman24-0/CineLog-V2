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
 * EpisodeCard — a compact vertical preview card for the horizontal
 * episode carousel.
 *
 * 2026-09-03 REDESIGN — Nuvio-inspired compact card:
 *   ┌──────────────────────┐
 *   │                      │
 *   │    EPISODE STILL     │
 *   │                      │
 *   │  E1              ✓   │  ← number badge (left) + watched toggle (right)
 *   ├──────────────────────┤
 *   │ Freedom Day          │  ← title (1 line, ellipsis)
 *   │ Sheriff Becker's...  │  ← overview (2 lines, ellipsis)
 *   │ 1h 2m · May 4 · ★7.3│  ← compact metadata row
 *   │  ⭐ Rate    ⋯ More   │  ← icon-based action row
 *   └──────────────────────┘
 *
 * The card is designed for a horizontal carousel — fixed width,
 * compact height, all information inside the card (no external rows).
 *
 * ACTIONS (icon-based, preserving existing handlers):
 *   - Watched toggle: top-right of the still (check_circle / radio_button_unchecked).
 *     Calls onToggle(!isWatchedState()) — same as before.
 *   - Rate: star icon in the action row. Calls openFeedbackDialog() —
 *     same as before. Shows the existing GlassModal rating dialog.
 *   - More: ellipsis icon in the action row. Toggles the overview
 *     expand/collapse — same as the old "More" button.
 *   - Non-vault: the watched toggle becomes a "+" add button that
 *     calls onAddToVault() — same as before.
 *
 * EPISODE FEEDBACK (preserved):
 *   When a watched/current vault episode is rateable, the Rate icon
 *   opens the existing centered dialog with the user's configured
 *   5- or 10-point rating scale plus reactions. Save persists both
 *   fields together via onFeedback (or onRate for legacy callers).
 */
export interface EpisodeCardProps {
  episode: TMDBEpisode;
  isCurrent: boolean;
  isWatched: boolean;
  inVault: boolean;
  /**
   * The user's existing rating for this episode (1-N), or null/undefined
   * if no rating has been set.
   */
  rating?: number | null;
  /**
   * Called when the user taps the watched toggle.
   * `newWatched` is the desired new state:
   *   - true = user wants this episode marked as watched
   *   - false = user wants this episode marked as unwatched
   */
  onToggle: (newWatched: boolean) => void;
  onAddToVault: () => void;
  /** Existing persisted rating/reaction for this episode. */
  feedback?: EpisodeFeedback;
  /** Save the complete selection from the centered RATE dialog. */
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
// Edit modal via `src/shared/data/reactions.ts`.
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

  // Keep the local display state aligned with the hydrated parent map.
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
    const reaction = normalizeReaction(currentReaction());
    if (rating == null && reaction == null) return null;
    const parts = [rating != null ? `★${rating}` : null];
    const reactionLabel = reaction
      ? REACTION_OPTIONS.find((option) => option.value === reaction)?.emoji
      : null;
    if (reactionLabel) parts.push(reactionLabel);
    return parts.filter(Boolean).join(" ");
  };

  const stillUrl = () =>
    props.episode.still_path ? tmdbImage(props.episode.still_path, "w342") : "";

  const formattedAirDate = () => {
    if (!props.episode.air_date) return null;
    const d = new Date(props.episode.air_date);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
  };

  const hasOverview = () =>
    props.episode.overview && props.episode.overview.trim().length > 0;

  /**
   * "Watched" state for the toggle's visual treatment.
   * The current episode is treated as watched for toggle purposes.
   */
  const isWatchedState = () => props.isWatched || props.isCurrent;

  const handleToggleClick = (e: Event) => {
    e.stopPropagation();
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
      role="listitem"
    >
      {/* Still image with number badge + watched toggle overlay */}
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
        {/* Gradient overlay for badge/toggle readability */}
        <div class="episode-card-still-overlay" aria-hidden="true" />
        {/* Episode number badge (top-left) */}
        <span class="episode-card-number" aria-hidden="true">
          E{props.episode.episode_number}
        </span>
        {/* Watched toggle (top-right) — vault-aware.
            - In vault + watched: filled accent circle with check.
              Tap to unwatch.
            - In vault + not watched: empty circle outline.
              Tap to watch.
            - Not in vault: small "+" button. Tap to add to vault. */}
        <Show
          when={props.inVault}
          fallback={
            <button
              type="button"
              class="episode-card-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                props.onAddToVault();
              }}
              aria-label={`Add to watchlist to track episode ${props.episode.episode_number}`}
              title="Add to Watchlist to Track"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "16px" }}
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
                  style={{ "font-size": "18px" }}
                  aria-hidden="true"
                >
                  radio_button_unchecked
                </span>
              }
            >
              <span
                class="material-symbols-outlined"
                style={{
                  "font-size": "18px",
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
      </div>

      {/* Card body — title, overview, metadata, actions */}
      <div class="episode-card-body">
        {/* Title */}
        <h4 class="episode-card-title">
          {props.episode.name || `Episode ${props.episode.episode_number}`}
        </h4>

        {/* Overview — 2-line clamped, expandable via More */}
        <Show when={hasOverview()}>
          <p
            class={`episode-card-overview${expanded() ? "" : " episode-card-overview-clamped"}`}
          >
            {props.episode.overview}
          </p>
        </Show>

        {/* Compact metadata row — runtime · air date · rating · feedback */}
        <div class="episode-card-meta">
          <Show when={props.episode.runtime}>
            <span>{formatRuntime(props.episode.runtime!)}</span>
          </Show>
          <Show when={formattedAirDate()}>
            <span>{formattedAirDate()}</span>
          </Show>
          <Show when={props.episode.vote_average > 0}>
            <span style={{ color: "#f5c518" }}>
              ★{props.episode.vote_average.toFixed(1)}
            </span>
          </Show>
          <Show when={feedbackSummary()}>
            <span style={{ color: "var(--p)" }}>{feedbackSummary()}</span>
          </Show>
        </div>

        {/* Icon-based action row — Rate + More */}
        <div class="episode-card-actions">
          <Show when={canOpenFeedback()}>
            <button
              type="button"
              class="episode-card-action-btn episode-card-rate-btn focus-ring"
              onClick={(e) => {
                e.stopPropagation();
                openFeedbackDialog();
              }}
              aria-haspopup="dialog"
              aria-label={`Rate episode ${props.episode.episode_number}`}
              title="Rate"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "16px" }}
                aria-hidden="true"
              >
                star
              </span>
              <Show when={currentRating() != null}>
                <span class="episode-card-rate-value">
                  {currentRating()}
                </span>
              </Show>
            </button>
          </Show>
          <Show when={hasOverview()}>
            <button
              type="button"
              class="episode-card-action-btn episode-card-more-btn focus-ring"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              aria-label={expanded() ? "Collapse overview" : "Expand overview"}
              title={expanded() ? "Less" : "More"}
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "16px" }}
                aria-hidden="true"
              >
                {expanded() ? "unfold_less" : "unfold_more"}
              </span>
            </button>
          </Show>
        </div>
      </div>

      {/* Rate dialog — preserved from the previous version */}
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
    </article>
  );
};

export default EpisodeCard;
