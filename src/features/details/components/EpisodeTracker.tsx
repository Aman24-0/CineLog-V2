// src/features/details/components/EpisodeTracker.tsx
import { createSignal, createMemo, createEffect, Show } from "solid-js";
import Icon from "~/shared/ui/Icon";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

interface EpisodeTrackerProps {
  item: WatchlistItem;
  details: TMDBDetails | null;
  onChange: (season: number, episode: number) => void;
  onMarkCompleted: () => void;
}

export default function EpisodeTracker(props: EpisodeTrackerProps) {
  const [season, setSeason] = createSignal(props.item.season || 1);
  const [episode, setEpisode] = createSignal(props.item.episode || 1);

  // Sync local state if the underlying item changes (e.g., Firestore update)
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
    <div class="glass-surface p-5 rounded-2xl border border-white/5 mb-6 animate-fade-up">
      <div class="flex justify-between items-center mb-4">
        <span class="type-caption text-gray-400 flex items-center gap-2">
          <Icon name="video_library" class="text-[14px]" style="color: var(--p)" /> Tracker
        </span>
        <span class="type-metadata font-black text-white">
          S{season()} E{episode()}
        </span>
      </div>

      {/* Season Control */}
      <div class="flex items-center justify-between mb-3">
        <span class="type-metadata text-gray-300">Season {season()}</span>
        <div class="flex gap-2">
          <button
            onClick={decrementSeason}
            disabled={season() <= 1}
            class="w-11 h-11 rounded-xl flex items-center justify-center border active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            style="background: var(--p-dim); color: var(--p); border-color: var(--p)"
            aria-label="Season minus"
          >
            <Icon name="remove" />
          </button>
          <button
            onClick={incrementSeason}
            class="w-11 h-11 rounded-xl flex items-center justify-center border active:scale-95 transition-all"
            style="background: var(--p-dim); color: var(--p); border-color: var(--p)"
            aria-label="Season plus"
          >
            <Icon name="add" />
          </button>
        </div>
      </div>

      {/* Episode Control */}
      <div class="flex items-center justify-between mb-4">
        <span class="type-metadata text-gray-300">
          Episode {episode()} / {totalEps() || "?"}
        </span>
        <div class="flex gap-2">
          <button
            onClick={decrementEpisode}
            disabled={episode() <= 1}
            class="w-11 h-11 rounded-xl flex items-center justify-center border active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            style="background: var(--p-dim); color: var(--p); border-color: var(--p)"
            aria-label="Episode minus"
          >
            <Icon name="remove" />
          </button>
          <button
            onClick={incrementEpisode}
            class="w-11 h-11 rounded-xl flex items-center justify-center border active:scale-95 transition-all"
            style="background: var(--p-dim); color: var(--p); border-color: var(--p)"
            aria-label="Episode plus"
          >
            <Icon name="add" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div class="flex justify-between items-center mb-2">
        <span class="type-caption text-gray-500">Progress</span>
        <span class="type-caption font-bold" style="color: var(--p)">{Math.round(progress())}%</span>
      </div>
      <div class="w-full h-2 bg-black rounded-full overflow-hidden mb-4">
        <div
          class="h-full rounded-full animate-bar-grow"
          style={{
            width: `${progress()}%`,
            background: "var(--p)",
            "box-shadow": "0 0 10px var(--p-glow)",
            transition: "width 500ms ease-out"
          }}
        />
      </div>

      <Show when={isCompletedEligible()}>
        <button
          onClick={() => props.onMarkCompleted()}
          class="w-full rounded-xl py-2 type-caption active:scale-95 transition-transform"
          style="background: var(--p-dim); color: var(--p); border: 1px solid var(--p)"
          aria-label="Mark as Completed"
        >
          ✓ Mark as Completed
        </button>
      </Show>
    </div>
  );
}
