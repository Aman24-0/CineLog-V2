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

import { For, type Component, type Accessor } from "solid-js";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import ChartContainer from "./ChartContainer";
import StatsTooltip from "./StatsTooltip";
import type { MovieSeriesSplit } from "~/lib/supabase/repositories/stats";

interface MovieSeriesPieProps {
  split: Accessor<MovieSeriesSplit>;
}

const MovieSeriesPie: Component<MovieSeriesPieProps> = (props) => {
  const data = () => {
    const s = props.split();
    return [
      { name: "Movies", value: s.movies, color: "#f5c518" },
      { name: "Series", value: s.series, color: "#7c8cff" },
    ].filter((d) => d.value > 0);
  };

  const total = (): number => props.split().movies + props.split().series;

  return (
    <ChartContainer
      icon="pie_chart"
      title="Movies vs Series"
      subtitle="Your content split by media type"
      height="280px"
      footer={
        <div class="stats-pie-legend">
          <For each={data()}>
            {(entry) => {
              const pct = total() > 0 ? Math.round((entry.value / total()) * 100) : 0;
              return (
                <div class="stats-pie-legend-row">
                  <span class="stats-pie-legend-dot" style={{ background: entry.color }} aria-hidden="true" />
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
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            content={
              <StatsTooltip
                valueFormatter={(v) => {
                  const count = Number(v) || 0;
                  const pct = total() > 0 ? Math.round((count / total()) * 100) : 0;
                  return `${count} title${count === 1 ? "" : "s"} · ${pct}%`;
                }}
              />
            }
          />
          <Pie
            data={data()}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="56%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="var(--bg, #0a0a0f)"
            strokeWidth={2}
          >
            <For each={data()}>
              {(entry) => <Cell fill={entry.color} />}
            </For>
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* Centre label overlay — shows the total count in the donut hole. */}
      <div class="stats-pie-centre" aria-hidden="true">
        <p class="stats-pie-centre-value">{total()}</p>
        <p class="stats-pie-centre-label">total</p>
      </div>
    </ChartContainer>
  );
};

export default MovieSeriesPie;
