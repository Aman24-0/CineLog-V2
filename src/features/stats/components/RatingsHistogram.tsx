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
//
// Implementation note: previously used recharts (React-only). Now
// uses the pure-SolidJS BarChartV primitive.

import { Show, createMemo, type Component, type Accessor } from "solid-js";
import ChartContainer from "./ChartContainer";
import { BarChartV, type BarVItem } from "./SvgChart";
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
  const total = createMemo((): number =>
    props.ratings().reduce((sum, r) => sum + r.count, 0),
  );

  const items = createMemo<BarVItem[]>(() =>
    props.ratings().map((r) => {
      const count = r.count;
      const pct = total() > 0 ? Math.round((count / total()) * 100) : 0;
      return {
        label: String(r.rating),
        value: count,
        color: barColor(r.rating),
        tooltipLabel: `★ ${r.rating} / 10`,
        tooltipRows: [
          {
            name: "Titles",
            value: `${count}${count === 1 ? "" : ""} · ${pct}%`,
            color: barColor(r.rating),
          },
        ],
      };
    }),
  );

  const hasRatings = createMemo(() => total() > 0);

  return (
    <ChartContainer
      icon="star"
      title="Ratings Distribution"
      subtitle="How you rate the titles you watch"
      height="300px"
    >
      <Show
        when={hasRatings()}
        fallback={<p class="stats-chart-empty">You haven't rated any titles yet.</p>}
      >
        <BarChartV items={items()} height={260} />
      </Show>
    </ChartContainer>
  );
};

export default RatingsHistogram;
