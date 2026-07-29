// src/features/stats/components/ActivityChart.tsx
//
// ActivityChart — a vertical bar chart showing how many titles the
// user completed per month over the last 12 months. The bars use a
// gold gradient that matches the app's accent colour, and the chart
// includes a Movies-vs-Series toggle that overlays two bars per
// month when enabled.
//
// Data source: getMonthlyActivity() from the stats repository.

import { createSignal, createMemo, Show, For, type Component, type Accessor } from "solid-js";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import ChartContainer from "./ChartContainer";
import StatsTooltip from "./StatsTooltip";
import type { MonthBucket } from "~/lib/supabase/repositories/stats";
import type { WatchlistItem } from "~/shared/types";

interface ActivityChartProps {
  monthly: Accessor<MonthBucket[]>;
  /** The full watchlist — used to compute the movies-vs-series overlay. */
  watchlist: Accessor<WatchlistItem[]>;
}

interface Row {
  month: string;
  year: number;
  count: number;
  movies: number;
  series: number;
}

const ActivityChart: Component<ActivityChartProps> = (props) => {
  const [showSplit, setShowSplit] = createSignal(false);

  // Re-derive the monthly buckets split by media type when the toggle
  // is on. We rebuild the same MonthBucket[] shape but with two
  // counts per row.
  const rows = createMemo<Row[]>(() => {
    const base = props.monthly();
    if (!showSplit()) {
      return base.map((b) => ({ ...b, movies: 0, series: 0 }));
    }
    // Re-bucket the watchlist by completion month + media_type.
    const map = new Map<string, { movies: number; series: number }>();
    const now = new Date();
    // Pre-seed the last 12 months so empty months still render.
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, { movies: 0, series: 0 });
    }
    props.watchlist().forEach((m) => {
      if (m.status !== "Completed") return;
      const dateStr = m.watchDate ?? (typeof m.addedAt === "string" ? m.addedAt : null);
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = map.get(key);
      if (!entry) return;
      if (m.media_type === "movie") entry.movies++;
      else if (m.media_type === "tv") entry.series++;
    });
    return base.map((b, idx) => {
      const now2 = new Date();
      const d = new Date(now2.getFullYear(), now2.getMonth() - (11 - idx), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = map.get(key) ?? { movies: 0, series: 0 };
      return { ...b, movies: entry.movies, series: entry.series };
    });
  });

  return (
    <ChartContainer
      icon="calendar_month"
      title="Monthly Activity"
      subtitle="Titles completed per month — last 12 months"
      height="300px"
      headerRight={
        <button
          type="button"
          class={`stats-toggle ${showSplit() ? "stats-toggle-active" : ""}`}
          onClick={() => setShowSplit((v) => !v)}
          aria-pressed={showSplit()}
          aria-label="Toggle movies vs series overlay"
        >
          <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
            stacked_bar_chart
          </span>
          <span>Movies vs Series</span>
        </button>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows()} margin={{ top: 10, right: 8, left: -16, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "'Azeret Mono', monospace" }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "'Azeret Mono', monospace" }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={<StatsTooltip valueFormatter={(v) => `${v} title${v === 1 ? "" : "s"}`} />}
          />
          <Show
            when={showSplit()}
            fallback={
              <Bar dataKey="count" name="Completed" radius={[4, 4, 0, 0]} maxBarSize={36}>
                <For each={rows()}>
                  {(entry) => (
                    <Cell fill={entry.count > 0 ? "url(#statsBarGold)" : "rgba(255,255,255,0.08)"} />
                  )}
                </For>
              </Bar>
            }
          >
            <Bar dataKey="movies" name="Movies" fill="#f5c518" radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="series" name="Series" fill="#7c8cff" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </Show>
          <defs>
            <linearGradient id="statsBarGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f5c518" />
              <stop offset="100%" stop-color="#d4a014" />
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

export default ActivityChart;
