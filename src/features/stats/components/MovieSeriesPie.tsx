// src/features/stats/components/MovieSeriesPie.tsx
//
// MovieSeriesPie — a donut chart showing the split between Movies
// and Series in the user's library. The donut has two segments
// (gold for movies, indigo for series) with the total count rendered
// in the centre.
//
// Below the donut, a legend shows the count + percentage for each
// segment so the numbers are accessible even when the donut is too
// small to read precisely (e.g. on a 320px phone).
//
// Implementation note: previously used recharts (React-only). Now
// uses the pure-SolidJS DonutChart primitive.

import { For, Show, createMemo, type Component, type Accessor } from "solid-js";
import ChartContainer from "./ChartContainer";
import { DonutChart, type DonutSlice } from "./SvgChart";
import type { MovieSeriesSplit } from "~/lib/supabase/repositories/stats";

interface MovieSeriesPieProps {
  split: Accessor<MovieSeriesSplit>;
}

const MovieSeriesPie: Component<MovieSeriesPieProps> = (props) => {
  const slices = createMemo<DonutSlice[]>(() => {
    const s = props.split();
    const list: DonutSlice[] = [
      { name: "Movies", value: s.movies, color: "#f5c518" },
      { name: "Series", value: s.series, color: "#7c8cff" }
    ];
    return list.filter((d) => d.value > 0);
  });

  const total = createMemo(
    (): number => props.split().movies + props.split().series
  );

  return (
    <ChartContainer
      icon="pie_chart"
      title="Movies vs Series"
      subtitle="Your content split by media type"
      height="280px"
      footer={
        <div class="stats-pie-legend">
          <For each={slices()}>
            {(entry) => {
              const pct =
                total() > 0 ? Math.round((entry.value / total()) * 100) : 0;
              return (
                <div class="stats-pie-legend-row">
                  <span
                    class="stats-pie-legend-dot"
                    style={{ background: entry.color }}
                    aria-hidden="true"
                  />
                  <span class="stats-pie-legend-name">{entry.name}</span>
                  <span class="stats-pie-legend-count">
                    {entry.value} · {pct}%
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      }
    >
      <Show
        when={total() > 0}
        fallback={<p class="stats-chart-empty">No titles yet.</p>}
      >
        <DonutChart
          slices={slices()}
          centreValue={total()}
          centreLabel="total"
          height={220}
        />
      </Show>
    </ChartContainer>
  );
};

export default MovieSeriesPie;
