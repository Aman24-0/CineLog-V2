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
 * EpisodeCard — a full-bleed cinematic backdrop card for the horizontal
 * episode carousel.
 *
 * 2026-09-03 REDESIGN v2 — Nuvio-inspired full-bleed card:
 *   ┌────────────────────────────────────┐
 *   │  E1                          ✓     │  ← badge (top-left) + watched (top-right)
 *   │                                    │
 *   │        EPISODE BACKDROP            │  ← still fills the ENTIRE card
 *   │        (object-fit: cover)         │
 *   │                                    │
 *   │     ┌──────────────────────────┐   │
 *   │     │ Freedom Day              │   │  ← title (over backdrop)
 *   │     │ Sheriff Becker's plans…  │   │  ← overview (3 lines, over backdrop)
 *   │     │ 1h 2m · May 4 · ★7.3  ⭐ │   │  ← metadata + rate icon (over backdrop)
 *   │     └──────────────────────────┘   │
 *   └────────────────────────────────────┘
 *
 * The entire card is a single unified surface — the episode still fills
 * the whole card with object-fit: cover. A multi-layer bottom-to-top
 * dark gradient overlay ensures text readability. There is NO separate
 * dark content block below the image.
 *
 * CHANGES FROM v1:
 *   - Removed the separate .episode-card-body div. All content is
 *     positioned over the backdrop via absolute positioning.
 *   - Removed the More/expand button entirely. The overview is now
 *     always 3-line clamped (not expandable).
 *   - The Rate icon moved to the bottom-right of the card (over the
 *     backdrop), next to the metadata row.
 *   - The card is substantially wider (300px mobile / 340px sm / 380px
 *     lg) and taller (aspect-ratio 3/4 on mobile) for a cinematic feel.
 *   - The carousel shows one card almost full-width on mobile, with a
 *     small peek of the next card.
 *
 * ACTIONS (icon-based, preserving existing handlers):
 *   - Watched toggle: top-right of the card (over the backdrop).
 *     Calls onToggle(!isWatchedState()) — same as before.
 *   - Rate: star icon at the bottom-right (over the backdrop).
 *     Calls openFeedbackDialog() — same as before.
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
  rating?: number | null;
  onToggle: (newWatched: boolean) => void;
  onAddToVault: () => void;
  feedback?: EpisodeFeedback;
  onFeedback?: (
    rating: number | null,
    reaction: EpisodeReaction | null
  ) => void;
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
  // ── State ────────────────────────────────────────────────────────
  // NOTE: the `expanded` signal and More button have been REMOVED in
  // this redesign. The overview is always 3-line clamped — no toggle.
  const [rateDialogOpen, setRateDialogOpen] = createSignal(false);
  const [draftRating, setDraftRating] = createSignal<number | null>(null);
  const [draftReaction, setDraftReaction] =
    createSignal<EpisodeReaction | null>(null);
  const [isSavingFeedback, setIsSavingFeedback] = createSignal(false);

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

  // Use w500 for a higher-quality backdrop on the wider cinematic card.
  const stillUrl = () =>
    props.episode.still_path ? tmdbImage(props.episode.still_path, "w500") : "";

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
      {/* ── Full-bleed backdrop ──────────────────────────────────────
          The episode still fills the ENTIRE card via object-fit: cover.
          There is NO separate dark body below the image. */}
      <SafeImage
        src={stillUrl()}
        alt=""
        class="episode-card-backdrop"
        fallback={
          <div class="episode-card-backdrop-fallback" aria-hidden="true">
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "32px", color: "var(--text-dim)" }}
              aria-hidden="true"
            >
              movie
            </span>
          </div>
        }
      />

      {/* ── Multi-layer gradient overlay ────────────────────────────
          A top gradient (for badge/toggle readability) + a strong
          bottom-to-top gradient (for title/overview/metadata
          readability). The overlay is a single div with a CSS
          background that combines both gradients. */}
      <div class="episode-card-overlay" aria-hidden="true" />

      {/* ── Top-left: episode number badge ────────────────────────── */}
      <span class="episode-card-number" aria-hidden="true">
        E{props.episode.episode_number}
      </span>

      {/* ── Top-right: watched toggle (vault-aware) ─────────────────
          - In vault + watched: filled accent circle with check.
          - In vault + not watched: empty circle outline.
          - Not in vault: small "+" button. */}
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

      {/* ── Bottom content area (over the backdrop) ─────────────────
          Title + 3-line overview + metadata row + rate icon.
          Positioned at the bottom of the card via absolute positioning.
          NO More button — the overview is always 3-line clamped. */}
      <div class="episode-card-content">
        <h4 class="episode-card-title">
          {props.episode.name || `Episode ${props.episode.episode_number}`}
        </h4>

        <Show when={hasOverview()}>
          <p class="episode-card-overview">{props.episode.overview}</p>
        </Show>

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
          {/* Rate icon — compact, over the backdrop */}
          <Show when={canOpenFeedback()}>
            <button
              type="button"
              class="episode-card-rate-btn focus-ring"
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
                style={{
                  "font-size": "16px",
                  "font-variation-settings": currentRating() != null
                    ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 16"
                    : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 16"
                }}
                aria-hidden="true"
              >
                star
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
