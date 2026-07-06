// src/features/dashboard/components/StatsGrid.tsx
import { For, Show, createMemo, Component } from "solid-js";
import Icon from "~/shared/ui/Icon";
import type { WatchlistItem } from "~/shared/types";

interface StatsGridProps {
  watchlist: WatchlistItem[];
  onNavigate: (status: string) => void;
}

const mode = (arr: string[]) => {
  if (arr.length === 0) return "-";
  const counts: Record<string, number> = {};
  let max = 0;
  let modeVal = "-";
  for (const v of arr) {
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > max) {
      max = counts[v];
      modeVal = v;
    }
  }
  return modeVal;
};

const StatsGrid: Component<StatsGridProps> = (props) => {
  const watchingCount = createMemo(() => props.watchlist.filter((m) => m.status === "Watching").length);
  const plannedList = createMemo(() => props.watchlist.filter((m) => m.status === "Planned" || m.status === "Plan to Watch"));
  const completedCount = createMemo(() => props.watchlist.filter((m) => m.status === "Completed").length);

  const insights = createMemo(() => {
    const list = props.watchlist;
    const genres = list.flatMap((m) => m.genresList || []);
    const topGenre = mode(genres);
    
    const imdbRatings = list.map((m) => parseFloat(m.imdbRating || "0")).filter((r) => !isNaN(r) && r > 0);
    const avgImdb = imdbRatings.length > 0 ? (imdbRatings.reduce((a, b) => a + b, 0) / imdbRatings.length).toFixed(1) : "-";
    
    const movies = list.filter((m) => m.media_type === "movie").length;
    const series = list.filter((m) => m.media_type === "tv").length;
    
    const currentYear = new Date().getFullYear().toString();
    const completedThisYear = list.filter((m) => m.status === "Completed" && m.watchDate?.startsWith(currentYear)).length;
    
    const platforms = list.flatMap((m) => m.platformsList || []);
    const topPlatform = mode(platforms);
    
    const runtimes = list.map((m) => m.runtime).filter((r) => r && r > 0);
    const avgRuntime = runtimes.length > 0 ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length) : "-";
    
    return { topGenre, avgImdb, movies, series, completedThisYear, topPlatform, avgRuntime };
  });

  const stats = createMemo(() => [
    { icon: "inventory_2", label: "Total Vault", value: props.watchlist.length, color: "white", status: "all" },
    { icon: "play_circle", label: "Watching", value: watchingCount(), color: "white", status: "Watching" },
    { icon: "bookmark", label: "Planned", value: plannedList().length, color: "var(--p)", status: "Planned" },
    { icon: "task_alt", label: "Completed", value: completedCount(), color: "white", status: "Completed" },
  ]);

  return (
    <div class="space-y-4">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger" role="region" aria-label="Vault statistics">
        <For each={stats()}>
          {(stat) => (
            <div
              onClick={() => props.onNavigate(stat.status)}
              onKeyDown={(e) => {
                if (e.key === "Enter") props.onNavigate(stat.status);
              }}
              class="stat-card p-4 flex flex-col items-center justify-center cursor-pointer group animate-fade-up"
              role="button"
              tabindex={0}
              aria-label={`${stat.value} ${stat.label}`}
            >
              <Icon
                name={stat.icon}
                class="text-gray-600 group-hover:text-white mb-2 text-xl"
                style={{ transition: "color 220ms ease-out", color: stat.color === "white" ? undefined : stat.color }}
                aria-hidden="true"
              />
              <span class="type-stat text-white mb-1" style={{ color: stat.color }}>{stat.value}</span>
              <span class="type-caption text-gray-500">{stat.label}</span>
            </div>
          )}
        </For>
      </div>

      <div class="glass-surface p-5 rounded-2xl border border-white/5 animate-fade-up">
        <h3 class="type-section-title mb-4">Vault Insights</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div class="flex flex-col gap-1">
            <span class="type-caption text-gray-500">Top Genre</span>
            <span class="type-metadata text-white font-bold">{insights().topGenre}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="type-caption text-gray-500">Average IMDb</span>
            <span class="type-metadata text-white font-bold">{insights().avgImdb}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="type-caption text-gray-500">Movies vs Series</span>
            <span class="type-metadata text-white font-bold">{insights().movies} / {insights().series}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="type-caption text-gray-500">Completed This Year</span>
            <span class="type-metadata text-white font-bold">{insights().completedThisYear}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="type-caption text-gray-500">Most Used Platform</span>
            <span class="type-metadata text-white font-bold">{insights().topPlatform}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="type-caption text-gray-500">Average Runtime</span>
            <span class="type-metadata text-white font-bold">{insights().avgRuntime}m</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsGrid;
