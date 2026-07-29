// src/features/stats/components/RatingsHistogram.tsx
//
// RatingsHistogram — a vertical bar chart with ratings 1-10 on the
// X-axis and the count of titles at each rating on the Y-axis. Bars
// use a continuous colour gradient from the app's cool muted accent
// (low ratings, hue ~30°) to a bright gold (high ratings, hue ~50°),
// with lightness rising from 38% to 60% so the colour brightens as
// ratings improve. This replaces the previous red/orange/green
// discrete palette with a smoother, on-brand gradient.
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

/**
 * Smooth colour for a rating 1-10.
 *
 * The gradient interpolates two axes:
 *  - Hue:    18° (warm amber-red) → 50° (bright gold)
 *  - Light:  38%  (deep)          → 60%  (luminous)
 *  - Sat:    fixed at 85% so the colours stay vivid.
 *
 * The result is a perceptually-smooth ramp that starts dark amber
 * for ratings 1-3, warms through orange around 5-6, and finishes
 * on the app's signature gold for 9-10.
 */
function barColor(rating: number): string {
  const r = Math.max(1, Math.min(10, rating));
  const t = (r - 1) / 9; // 0..1
  const hue = 18 + t * 32; // 18 → 50
  const light = 38 + t * 22; // 38 → 60
  return `hsl(${hue.toFixed(1)}, 85%, ${light.toFixed(1)}%)`;
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
            value: `${count} · ${pct}%`,
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
