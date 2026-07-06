// src/features/details/components/EpisodeTracker.tsx
import { createSignal, createMemo, createEffect, Show } from "solid-js";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

interface EpisodeTrackerProps {
  item: WatchlistItem;
  details: TMDBDetails | null;
  onChange: (season: number, episode: number) => void;
  onMarkCompleted: () => void;
}

/**
 * Episode Tracker — V2 cinematic styling.
 *
 * Logic unchanged from V1 (per spec: preserve tracker logic).
 * Visual treatment updated to match the new cinematic Details page:
 *  - Glass surface with refined border
 *  - Larger touch targets (44px minimum)
 *  - Premium progress bar with gradient + shimmer
 *  - Cleaner typography using V2 type tokens
 */
export default function EpisodeTracker(props: EpisodeTrackerProps) {
  const [season, setSeason] = createSignal(props.item.season || 1);
  const [episode, setEpisode] = createSignal(props.item.episode || 1);

  createEffect(() => {
    setSeason(props.item.season || 1);
    setEpisode(props.item.episode || 1);
  });

  const totalEps = createMemo(() => {
    const seasonData = props.details?.seasons?.find(
      (s) => s.season_number === season()
    );
    return seasonData?.episode_count || props.item.totalEps || 0;
  });

  const finalSeason = createMemo(() => {
    const seasons = props.details?.seasons?.filter((s) => s.season_number > 0);
    if (!seasons || seasons.length === 0) return 1;
    return Math.max(...seasons.map((s) => s.season_number));
  });

  const progress = createMemo(() => {
    const total = totalEps() > 0 ? totalEps() : 1;
    return Math.min(100, Math.max(0, (episode() / total) * 100));
  });

  const isCompletedEligible = createMemo(() => {
    return (
      totalEps() > 0 &&
      episode() === totalEps() &&
      season() === finalSeason()
    );
  });

  const incrementEpisode = () => {
    const next = episode() + 1;
    setEpisode(next);
    props.onChange(season(), next);
  };

  const decrementEpisode = () => {
    if (episode() > 1) {
      const next = episode() - 1;
      setEpisode(next);
      props.onChange(season(), next);
    }
  };

  const incrementSeason = () => {
    const next = season() + 1;
    setSeason(next);
    setEpisode(1);
    props.onChange(next, 1);
  };

  const decrementSeason = () => {
    if (season() > 1) {
      const next = season() - 1;
      setSeason(next);
      setEpisode(1);
      props.onChange(next, 1);
    }
  };

  return (
    <div class="v2-info-group animate-fade-up">
      {/* Header row */}
      <div class="flex justify-between items-center">
        <span class="type-micro" style={{ color: "var(--text-muted)" }}>
          Current Progress
        </span>
        <span class="type-headline-sm" style={{ color: "var(--text-strong)" }}>
          S{season()} E{episode()}
        </span>
      </div>

      {/* Season Control */}
      <div class="flex items-center justify-between">
        <span class="type-body-soft">Season {season()}</span>
        <div class="flex gap-2">
          <button
            onClick={decrementSeason}
            disabled={season() <= 1}
            class="w-11 h-11 rounded-xl flex items-center justify-center border active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            style={{ background: "var(--p-dim)", color: "var(--p)", "border-color": "color-mix(in srgb, var(--p) 30%, transparent)" }}
            aria-label="Season minus"
          >
            <span class="material-symbols-outlined" style="font-size: 20px" aria-hidden="true">remove</span>
          </button>
          <button
            onClick={incrementSeason}
            class="w-11 h-11 rounded-xl flex items-center justify-center border active:scale-95 transition-all"
            style={{ background: "var(--p-dim)", color: "var(--p)", "border-color": "color-mix(in srgb, var(--p) 30%, transparent)" }}
            aria-label="Season plus"
          >
            <span class="material-symbols-outlined" style="font-size: 20px" aria-hidden="true">add</span>
          </button>
        </div>
      </div>

      {/* Episode Control */}
      <div class="flex items-center justify-between">
        <span class="type-body-soft">
          Episode {episode()} / {totalEps() || "?"}
        </span>
        <div class="flex gap-2">
          <button
            onClick={decrementEpisode}
            disabled={episode() <= 1}
            class="w-11 h-11 rounded-xl flex items-center justify-center border active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            style={{ background: "var(--p-dim)", color: "var(--p)", "border-color": "color-mix(in srgb, var(--p) 30%, transparent)" }}
            aria-label="Episode minus"
          >
            <span class="material-symbols-outlined" style="font-size: 20px" aria-hidden="true">remove</span>
          </button>
          <button
            onClick={incrementEpisode}
            class="w-11 h-11 rounded-xl flex items-center justify-center border active:scale-95 transition-all"
            style={{ background: "var(--p-dim)", color: "var(--p)", "border-color": "color-mix(in srgb, var(--p) 30%, transparent)" }}
            aria-label="Episode plus"
          >
            <span class="material-symbols-outlined" style="font-size: 20px" aria-hidden="true">add</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div>
        <div class="flex justify-between items-center mb-2">
          <span class="type-micro" style={{ color: "var(--text-muted)" }}>Progress</span>
          <span class="type-micro" style={{ color: "var(--p)", "font-weight": 800 }}>
            {Math.round(progress())}%
          </span>
        </div>
        <div class="progress-premium">
          <div
            class="progress-premium-fill"
            style={{ width: `${progress()}%` }}
          />
        </div>
      </div>

      {/* Mark as Completed */}
      <Show when={isCompletedEligible()}>
        <button
          onClick={() => props.onMarkCompleted()}
          class="w-full rounded-xl py-3 type-micro active:scale-95 transition-transform"
          style={{
            background: "var(--p-dim)",
            color: "var(--p)",
            border: "1px solid color-mix(in srgb, var(--p) 30%, transparent)",
            "font-weight": 800
          }}
          aria-label="Mark as Completed"
        >
          ✓ Mark as Completed
        </button>
      </Show>
    </div>
  );
}
