// src/features/details/DetailsModal/DetailsSeasons.tsx
import { Show, Suspense, lazy } from "solid-js";
import type { Accessor } from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";
import type {
  EpisodeFeedback,
  EpisodeReaction
} from "~/lib/supabase/repositories";

const SeasonNavigator = lazy(
  () => import("~/features/details/components/SeasonNavigator")
);

/**
 * DetailsSeasons — wraps the lazy-loaded SeasonNavigator inside a
 * DetailSection. Renders only for TV titles with seasons metadata.
 *
 * The section label is ownership-aware: vault titles see "Episodes",
 * non-vault titles see "Episode Guide" (read-only browsing).
 *
 * v2.6 — added `onEpisodeUnmark` prop to support the bidirectional
 * episode toggle. The watched direction still uses `onEpisodeChange`
 * (advances tracker + upserts episode_progress); the unwatch direction
 * uses `onEpisodeUnmark` (deletes episode_progress records from this
 * position onward + rewinds the tracker). Both flow into the parent
 * `useDetailsProgress` hook as the single source of truth.
 */
export interface DetailsSeasonsProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
  vaultItem: Accessor<WatchlistItem | null>;
  inVault: Accessor<boolean>;
  /** Mark an episode as watched — advances the tracker + upserts progress. */
  onEpisodeChange: (season: number, episode: number) => void;
  /**
   * Unmark an episode — the unwatch direction of the bidirectional
   * toggle (v2.6). Deletes episode_progress records from
   * (unmarkSeason, unmarkEpisode) onward and rewinds the tracker to
   * (newTrackerSeason, newTrackerEpisode).
   */
  onEpisodeUnmark: (
    unmarkSeason: number,
    unmarkEpisode: number,
    newTrackerSeason: number,
    newTrackerEpisode: number
  ) => void;
  onAddToVault: () => void;
  /**
   * Phase 6 Task 2 — Called when the user rates an episode. Optional;
   * when omitted, EpisodeCard hides the rating row. The parent
   * (useDetailsProgress.handleEpisodeRating) persists the rating.
   */
  onRateEpisode?: (
    season: number,
    episode: number,
    rating: number | null
  ) => void;
  /** Save the complete rating/reaction selection from the RATE dialog. */
  onFeedbackEpisode?: (
    season: number,
    episode: number,
    rating: number | null,
    reaction: EpisodeReaction | null
  ) => void;
  /**
   * Phase 6 Task 2 — Accessor returning a Map of "S{season}E{episode}"
   * → rating for the current vault item. Optional; when omitted (or
   * when the accessor returns an empty Map), no episode shows a
   * pre-existing rating.
   */
  episodeRatings?: Accessor<Map<string, number | null>>;
  /** Accessor returning complete persisted episode feedback. */
  episodeFeedbacks?: Accessor<Map<string, EpisodeFeedback>>;
}

export default function DetailsSeasons(props: DetailsSeasonsProps) {
  return (
    <Show
      when={props.baseItem()?.media_type === "tv" && props.details()?.seasons}
    >
      <DetailSection
        label={props.inVault() ? "Episodes" : "Episode Guide"}
        icon="video_library"
      >
        <Suspense fallback={<div class="v2-card h-48 animate-pulse" />}>
          <SeasonNavigator
            item={props.baseItem()!}
            details={props.details()}
            vaultItem={props.vaultItem()}
            onEpisodeChange={props.onEpisodeChange}
            onEpisodeUnmark={props.onEpisodeUnmark}
            onAddToVault={props.onAddToVault}
            onRateEpisode={props.onRateEpisode}
            onFeedbackEpisode={props.onFeedbackEpisode}
            episodeRatings={props.episodeRatings?.() ?? new Map()}
            episodeFeedbacks={props.episodeFeedbacks?.() ?? new Map()}
          />
        </Suspense>
      </DetailSection>
    </Show>
  );
}
