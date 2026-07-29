// src/features/stats/components/DecadeChart.tsx
//
// DecadeChart — a vertical bar chart of titles per release decade.
// Decades with zero titles are filtered out both by the stats
// repository AND here in the UI (defense-in-depth) so empty bars
// never appear. The X-axis labels are decade strings like "1950s",
// "1960s", ... — short enough to fit even on a 320px-wide phone.
//
// The favourite decade (the one with the highest count) gets a
// brighter bar; the rest are dimmed gold so the eye is drawn to the
// user's preferred era.
//
// Implementation note: previously used recharts (React-only). Now
// uses the pure-SolidJS BarChartV primitive.

import { createMemo, Show, type Component, type Accessor } from "solid-js";
import ChartContainer from "./ChartContainer";
import { BarChartV, type BarVItem } from "./SvgChart";
import type { DecadeCount } from "~/lib/supabase/repositories/stats";

interface DecadeChartProps {
  decades: Accessor<DecadeCount[]>;
}

const DecadeChart: Component<DecadeChartProps> = (props) => {
  // Defense-in-depth: filter out zero-count decades at the UI layer
  // as well as the repository layer. This guarantees no empty bars
  // ever render even if the repository contract changes.
  const visibleDecades = createMemo<DecadeCount[]>(() =>
    props.decades().filter((d) => d.count > 0),
  );

  const favoriteDecade = createMemo<string | null>(() => {
    const d = visibleDecades();
    if (d.length === 0) return null;
    return d.reduce((max, x) => (x.count > max.count ? x : max)).decade;
  });

  const items = createMemo<BarVItem[]>(() =>
    visibleDecades().map((d) => ({
      label: d.decade,
      value: d.count,
      color: d.decade === favoriteDecade() ? "#f5c518" : "rgba(245,197,24,0.45)",
      tooltipLabel: d.decade,
      tooltipRows: [
        {
          name: "Titles",
          value: String(d.count),
          color: d.decade === favoriteDecade() ? "#f5c518" : "rgba(245,197,24,0.6)",
        },
      ],
    })),
  );

  return (
    <ChartContainer
      icon="history"
      title="Release Decades"
      subtitle={
        favoriteDecade()
          ? `You love the ${favoriteDecade()}`
          : "Eras of cinema you watch"
      }
      height="100%"
    >
      <Show
        when={visibleDecades().length > 0}
        fallback={<p class="stats-chart-empty">No decade data yet.</p>}
      >
        <BarChartV items={items()} height={260} rotateLabels={visibleDecades().length > 6} />
      </Show>
    </ChartContainer>
  );
};

export default DecadeChart;
