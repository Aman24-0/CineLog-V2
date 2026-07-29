// src/features/stats/components/DecadeChart.tsx
//
// DecadeChart — a vertical bar chart of titles per release decade.
// Decades with zero titles are excluded by the calculator, so the
// chart only shows eras the user actually watches. The X-axis labels
// are decade strings like "1950s", "1960s", ... — short enough to
// fit even on a 320px-wide phone.
//
// The favourite decade (the one with the highest count) gets a
// brighter bar; the rest are dimmed gold so the eye is drawn to the
// user's preferred era.

import { createMemo, For, Show, type Component, type Accessor } from "solid-js";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from "recharts";
import ChartContainer from "./ChartContainer";
import StatsTooltip from "./StatsTooltip";
import type { DecadeCount } from "~/lib/supabase/repositories/stats";

interface DecadeChartProps {
  decades: Accessor<DecadeCount[]>;
}

const DecadeChart: Component<DecadeChartProps> = (props) => {
  const favoriteDecade = createMemo<string | null>(() => {
    const d = props.decades();
    if (d.length === 0) return null;
    return d.reduce((max, x) => (x.count > max.count ? x : max)).decade;
  });

  return (
    <ChartContainer
      icon="history"
      title="Release Decades"
      subtitle={
        <Show when={favoriteDecade()} fallback="Eras of cinema you watch">
          You love the <span style={{ color: "var(--p, #f5c518)" }}>{favoriteDecade()}</span>
        </Show> as string
      }
      height="300px"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={props.decades()}
          margin={{ top: 10, right: 16, left: -16, bottom: 0 }}
          barCategoryGap="22%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="decade"
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
          <Bar dataKey="count" name="Titles" radius={[4, 4, 0, 0]} maxBarSize={40}>
            <For each={props.decades()}>
              {(entry) => (
                <Cell
                  fill={entry.decade === favoriteDecade() ? "#f5c518" : "rgba(245,197,24,0.45)"}
                />
              )}
            </For>
            <LabelList
              dataKey="count"
              position="top"
              style={{ fill: "rgba(255,255,255,0.65)", fontSize: 10, fontFamily: "'Azeret Mono', monospace", fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

export default DecadeChart;
