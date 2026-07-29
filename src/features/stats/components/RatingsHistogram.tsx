// src/features/stats/components/RatingsHistogram.tsx
//
// RatingsHistogram — a vertical bar chart with ratings 1-10 on the
// X-axis and the count of titles at each rating on the Y-axis. Bars
// are colour-coded by rating intensity:
//
//   1-4  → red    (you didn't like it)
//   5-7  → orange (it was okay)
//   8-10 → green  (you loved it)
//
// The tooltip shows the count AND the percentage of rated titles at
// that score, which gives context for sparse distributions.

import { For, type Component, type Accessor } from "solid-js";
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
import type { RatingBucket } from "~/lib/supabase/repositories/stats";

interface RatingsHistogramProps {
  ratings: Accessor<RatingBucket[]>;
}

function barColor(rating: number): string {
  if (rating <= 4) return "#ef4444"; // red
  if (rating <= 7) return "#f59e0b"; // orange
  return "#22c55e"; // green
}

const RatingsHistogram: Component<RatingsHistogramProps> = (props) => {
  const total = (): number =>
    props.ratings().reduce((sum, r) => sum + r.count, 0);

  return (
    <ChartContainer
      icon="star"
      title="Ratings Distribution"
      subtitle="How you rate the titles you watch"
      height="300px"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={props.ratings()}
          margin={{ top: 10, right: 8, left: -16, bottom: 0 }}
          barCategoryGap="20%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="rating"
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
            content={
              <StatsTooltip
                valueFormatter={(v) => {
                  const count = Number(v) || 0;
                  const pct = total() > 0 ? Math.round((count / total()) * 100) : 0;
                  return `${count} title${count === 1 ? "" : "s"} · ${pct}%`;
                }}
                labelFormatter={(label) => `★ ${label} / 10`}
              />
            }
          />
          <Bar dataKey="count" name="Titles" radius={[4, 4, 0, 0]} maxBarSize={36}>
            <For each={props.ratings()}>
              {(entry) => <Cell fill={barColor(entry.rating)} />}
            </For>
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

export default RatingsHistogram;
