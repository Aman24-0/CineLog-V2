// src/features/stats/components/TrendsChart.tsx
//
// TrendsChart — a line chart showing cumulative completions over the
// last 12 months. Each point on the line is the running total of
// completed titles up to and including that month. This gives a
// sense of pace: a steep slope means a productive streak, a flat
// segment means a dry spell.
//
// Below the chart, three pace chips surface the average daily /
// weekly / monthly completions (computed over the last 90 days by
// the getWatchPace calculator).

import { createMemo, Show, For, type Component, type Accessor } from "solid-js";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
} from "recharts";
import ChartContainer from "./ChartContainer";
import StatsTooltip from "./StatsTooltip";
import type { MonthBucket, WatchPace } from "~/lib/supabase/repositories/stats";

interface TrendsChartProps {
  monthly: Accessor<MonthBucket[]>;
  pace: Accessor<WatchPace>;
}

interface CumulativeRow {
  month: string;
  cumulative: number;
  completed: number;
}

const TrendsChart: Component<TrendsChartProps> = (props) => {
  // Build a cumulative series from the monthly counts.
  const rows = createMemo<CumulativeRow[]>(() => {
    const months = props.monthly();
    let running = 0;
    return months.map((m) => {
      running += m.count;
      return { month: m.month, cumulative: running, completed: m.count };
    });
  });

  const paceChips = createMemo(() => {
    const p = props.pace();
    return [
      { label: "per day", value: p.daily.toFixed(2), icon: "today" },
      { label: "per week", value: p.weekly.toFixed(1), icon: "date_range" },
      { label: "per month", value: p.monthly.toFixed(1), icon: "calendar_month" },
    ];
  });

  return (
    <ChartContainer
      icon="trending_up"
      title="Cumulative Trend"
      subtitle="Running total of completed titles over the last 12 months"
      height="300px"
      footer={
        <div class="stats-pace-row">
          <For each={paceChips()}>
            {(chip) => (
              <div class="stats-pace-chip">
                <span class="material-symbols-outlined stats-pace-chip-icon" aria-hidden="true">
                  {chip.icon}
                </span>
                <div class="stats-pace-chip-text">
                  <p class="stats-pace-chip-value">{chip.value}</p>
                  <p class="stats-pace-chip-label">{chip.label}</p>
                </div>
              </div>
            )}
          </For>
        </div>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows()} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="statsTrendArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f5c518" stop-opacity={0.45} />
              <stop offset="100%" stop-color="#f5c518" stop-opacity={0} />
            </linearGradient>
          </defs>
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
            cursor={{ stroke: "rgba(255,255,255,0.2)", strokeWidth: 1 }}
            content={
              <StatsTooltip
                valueFormatter={(v) => `${v} total`}
                labelFormatter={(label) => `${label}`}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            name="Cumulative"
            stroke="#f5c518"
            strokeWidth={2.5}
            fill="url(#statsTrendArea)"
            dot={{ r: 3, fill: "#f5c518", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#f5c518", stroke: "#0a0a0f", strokeWidth: 2 }}
          />
          <Line type="monotone" dataKey="cumulative" stroke="transparent" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

export default TrendsChart;
