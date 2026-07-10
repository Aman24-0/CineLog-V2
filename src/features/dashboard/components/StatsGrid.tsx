// src/features/dashboard/components/StatsGrid.tsx
import { For, createMemo, Component } from "solid-js";
import { GlassCard } from "~/shared/ui/primitives";
import type { WatchlistItem } from "~/shared/types";

interface StatsGridProps {
  watchlist: WatchlistItem[];
  onNavigate: (status: string) => void;
}

const mode = (arr: string[]): string => {
  if (arr.length === 0) return "—";
  const counts: Record<string, number> = {};
  let max = 0;
  let modeVal = "—";
  for (const v of arr) {
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > max) {
      max = counts[v];
      modeVal = v;
    }
  }
  return modeVal;
};

interface StatItem {
  icon: string;
  label: string;
  value: number;
  status: string;
  accent?: boolean;
}

const StatsGrid: Component<StatsGridProps> = (props) => {
  const watchingCount = createMemo(() =>
    props.watchlist.filter((m) => m.status === "Watching").length
  );
  const plannedList = createMemo(() =>
    props.watchlist.filter(
      (m) => m.status === "Planned" || m.status === "Plan to Watch"
    )
  );
  const completedCount = createMemo(() =>
    props.watchlist.filter((m) => m.status === "Completed").length
  );

  const insights = createMemo(() => {
    const list = props.watchlist;
    const genres = list.flatMap((m) => m.genresList || []);
    const topGenre = mode(genres);

    const imdbRatings = list
      .map((m) => parseFloat(m.imdbRating || "0"))
      .filter((r) => !isNaN(r) && r > 0);
    const avgImdb =
      imdbRatings.length > 0
        ? (imdbRatings.reduce((a, b) => a + b, 0) / imdbRatings.length).toFixed(1)
        : "—";

    const movies = list.filter((m) => m.media_type === "movie").length;
    const series = list.filter((m) => m.media_type === "tv").length;

    const currentYear = new Date().getFullYear().toString();
    const completedThisYear = list.filter(
      (m) => m.status === "Completed" && m.watchDate?.startsWith(currentYear)
    ).length;

    const platforms = list.flatMap((m) => m.platformsList || []);
    const topPlatform = mode(platforms);

    const runtimes = list
      .map((m) => m.runtime)
      .filter((r): r is number => !!r && r > 0);
    const avgRuntime =
      runtimes.length > 0
        ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length)
        : "—";

    return {
      topGenre,
      avgImdb,
      movies,
      series,
      completedThisYear,
      topPlatform,
      avgRuntime
    };
  });

  const stats = createMemo<StatItem[]>(() => [
    { icon: "inventory_2", label: "Total Vault", value: props.watchlist.length, status: "all" },
    { icon: "play_circle", label: "Watching", value: watchingCount(), status: "Watching" },
    { icon: "bookmark", label: "Planned", value: plannedList().length, status: "Planned", accent: true },
    { icon: "task_alt", label: "Completed", value: completedCount(), status: "Completed" }
  ]);

  const insightRows = createMemo(() => [
    { label: "Top Genre", value: insights().topGenre },
    { label: "Average IMDb", value: insights().avgImdb },
    { label: "Movies / Series", value: `${insights().movies} / ${insights().series}` },
    { label: "Completed This Year", value: insights().completedThisYear },
    { label: "Top Platform", value: insights().topPlatform },
    { label: "Average Runtime", value: insights().avgRuntime === "—" ? "—" : `${insights().avgRuntime}m` }
  ]);

  return (
    <div class="space-y-4">
      <div
        class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger"
        role="region"
        aria-label="Vault statistics"
      >
        <For each={stats()}>
          {(stat) => (
            <div
              onClick={() => props.onNavigate(stat.status)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  props.onNavigate(stat.status);
                }
              }}
              class="stat-premium touch-ripple animate-fade-up"
              role="button"
              tabindex={0}
              aria-label={`${stat.value} ${stat.label}`}
              style={stat.accent ? { "border-color": "color-mix(in srgb, var(--p) 25%, transparent)" } : {}}
            >
              <span
                class="material-symbols-outlined"
                style={{
                  "font-size": "22px",
                  color: stat.accent ? "var(--p)" : "var(--text-soft)",
                  "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                }}
                aria-hidden="true"
              >
                {stat.icon}
              </span>
              <span class="type-stat-lg" style={{ color: stat.accent ? "var(--p)" : "var(--text-strong)" }}>
                {stat.value}
              </span>
              <span class="type-meta" style={{ "font-size": "0.5625rem" }}>
                {stat.label}
              </span>
            </div>
          )}
        </For>
      </div>

      <GlassCard padding="var(--sp-5)" radius="var(--radius-lg)" class="animate-fade-up">
        <div class="flex items-center gap-2 mb-4">
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "16px", color: "var(--p)" }}
            aria-hidden="true"
          >
            insights
          </span>
          <h3 class="type-eyebrow" style={{ margin: 0 }}>
            Vault Insights
          </h3>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
          <For each={insightRows()}>
            {(row) => (
              <div class="flex flex-col gap-1 min-w-0">
                <span class="type-meta" style={{ "font-size": "0.5625rem" }}>
                  {row.label}
                </span>
                <span
                  class="type-headline truncate"
                  style={{ "font-size": "0.9375rem", "font-weight": 700 }}
                >
                  {row.value}
                </span>
              </div>
            )}
          </For>
        </div>
      </GlassCard>
    </div>
  );
};

export default StatsGrid;
