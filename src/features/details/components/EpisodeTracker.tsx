// src/features/details/components/EpisodeTracker.tsx
import { createSignal, createMemo, createEffect, Show } from "solid-js";
import { getEpisodeProgress, resolveSeasons } from "~/shared/utils/progress";
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
 * PROGRESS:
 *   Uses the shared progress engine (`getEpisodeProgress`) — the single
 *   source of truth. The percentage shown here is SERIES-WIDE (sum of
 *   completed episodes across all seasons ÷ total episodes across all
 *   seasons). This is the SAME value rendered on the Dashboard Hero,
 *   Continue Watching rail, Vault, and Stats — no duplicate formulas.
 *
 * Visual treatment:
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

  // Pull the normalized season list through the SAME resolver the engine uses.
  // This guarantees the +/- buttons agree with the progress bar.
  const seasonList = createMemo(() => resolveSeasons(props.item, props.details));

  const totalEps = createMemo(() => {
    const current = seasonList().find((s) => s.number === season());
    return current?.count || props.item.totalEps || 0;
  });

  const finalSeason = createMemo(() => {
    const list = seasonList();
    if (list.length === 0) return 1;
    return list[list.length - 1].number;
  });

  // SINGLE SOURCE OF TRUTH — same function used everywhere else in the app.
  // We project the user's in-progress season/episode onto the item so the
  // preview matches what will be persisted on save.
  const progress = createMemo(() => {
    const previewItem: WatchlistItem = {
      ...props.item,
      season: season(),
      episode: episode()
    };
    return getEpisodeProgress(previewItem, props.details);
  });

  const isCompletedEligible = createMemo(() => {
    const p = progress();
    return !!p && p.isAtEnd;
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
      {/* Header row — current position + series-wide % */}
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
            disabled={season() >= finalSeason()}
            class="w-11 h-11 rounded-xl flex items-center justify-center border active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
            disabled={totalEps() > 0 && episode() >= totalEps()}
            class="w-11 h-11 rounded-xl flex items-center justify-center border active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            style={{ background: "var(--p-dim)", color: "var(--p)", "border-color": "color-mix(in srgb, var(--p) 30%, transparent)" }}
            aria-label="Episode plus"
          >
            <span class="material-symbols-outlined" style="font-size: 20px" aria-hidden="true">add</span>
          </button>
        </div>
      </div>

      {/* Progress Bar — SERIES-WIDE percentage from the shared engine */}
      <div>
        <div class="flex justify-between items-center mb-2">
          <span class="type-micro" style={{ color: "var(--text-muted)" }}>
            Series Progress
          </span>
          <span class="type-micro" style={{ color: "var(--p)", "font-weight": 800 }}>
            {progress()?.pct ?? 0}%
          </span>
        </div>
        <div
          class="progress-premium"
          role="progressbar"
          aria-valuenow={progress()?.pct ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progress()?.pct ?? 0}% of series complete`}
        >
          <div
            class="progress-premium-fill"
            style={{ width: `${progress()?.pct ?? 0}%` }}
          />
        </div>
        <div class="flex justify-between items-center mt-2">
          <span class="type-micro" style={{ color: "var(--text-muted)" }}>
            {progress()?.label}
          </span>
          <Show when={progress()?.seriesLabel && progress()!.seriesLabel !== "—"}>
            <span class="type-micro" style={{ color: "var(--text-dim)" }}>
              {progress()!.seriesLabel}
            </span>
          </Show>
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
