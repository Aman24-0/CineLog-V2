// src/features/stats/components/ActivityChart.tsx
//
// ActivityChart — a vertical bar chart showing how many titles the
// user completed per month over the last 12 months. Bars use a gold
// gradient that matches the app's accent colour, and the chart
// includes a Movies-vs-Series toggle that overlays two bars per
// month when enabled.
//
// Data source: getMonthlyActivity() from the stats repository.
//
// Implementation note: this previously used recharts (a React-only
// library). recharts' React hooks crashed inside SolidJS, manifesting
// as "e is not a function" at runtime. We now use the pure-SolidJS
// SvgChart primitives.

import { createSignal, createMemo, Show, type Component, type Accessor } from "solid-js";
import ChartContainer from "./ChartContainer";
import { BarChartV, type BarVItem, type TooltipRow } from "./SvgChart";
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
  /** YYYY-MM key — used for tooltip / display. */
  key: string;
}

const ActivityChart: Component<ActivityChartProps> = (props) => {
  const [showSplit, setShowSplit] = createSignal(false);

  // Re-derive the monthly buckets split by media type when the toggle
  // is on. We rebuild the same MonthBucket[] shape but with two
  // counts per row.
  const rows = createMemo<Row[]>(() => {
    const base = props.monthly();
    if (!showSplit()) {
      return base.map((b, idx) => ({
        ...b,
        movies: 0,
        series: 0,
        key: monthKey(idx),
      }));
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
    const wl = props.watchlist();
    if (Array.isArray(wl)) {
      wl.forEach((m) => {
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
    }
    return base.map((b, idx) => {
      const entry = map.get(monthKey(idx)) ?? { movies: 0, series: 0 };
      return { ...b, movies: entry.movies, series: entry.series, key: monthKey(idx) };
    });
  });

  const items = createMemo<BarVItem[]>(() =>
    rows().map((r) => {
      const tooltipRows: TooltipRow[] = showSplit()
        ? [
            { name: "Movies", value: String(r.movies), color: "#f5c518" },
            { name: "Series", value: String(r.series), color: "#7c8cff" },
            { name: "Total", value: String(r.count), color: "rgba(255,255,255,0.4)" },
          ]
        : [{ name: "Completed", value: String(r.count), color: "#f5c518" }];
      return {
        label: r.month,
        value: r.count,
        secondary: r.series,
        color: "#f5c518",
        secondaryColor: "#7c8cff",
        tooltipLabel: `${r.month} ${r.year}`,
        tooltipRows,
      };
    }),
  );

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
      <Show
        when={items().length > 0}
        fallback={<p class="stats-chart-empty">No activity yet.</p>}
      >
        <BarChartV items={items()} split={showSplit()} height={260} />
      </Show>
    </ChartContainer>
  );
};

/** Build the YYYY-MM key for the i-th most recent month (0 = oldest of the 12). */
function monthKey(idx: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default ActivityChart;
