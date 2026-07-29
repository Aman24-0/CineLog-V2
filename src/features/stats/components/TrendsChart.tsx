// src/features/stats/components/TrendsChart.tsx
//
// TrendsChart — an area + line chart showing cumulative completions
// over the last 12 months. Each point on the line is the running
// total of completed titles up to and including that month. This
// gives a sense of pace: a steep slope means a productive streak, a
// flat segment means a dry spell.
//
// Below the chart, three GlassBadge components surface the average
// daily / weekly / monthly completions (computed over the last 90
// days by the getWatchPace calculator). The badges use the design
// system's `info` intent so they read as subtle meta information
// rather than primary actions.
//
// Implementation note: previously used recharts (React-only). Now
// uses the pure-SolidJS AreaChartV primitive.

import { createMemo, For, Show, type Component, type Accessor } from "solid-js";
import ChartContainer from "./ChartContainer";
import { AreaChartV, type AreaVPoint } from "./SvgChart";
import { GlassBadge } from "~/shared/ui/glass";
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

  const points = createMemo<AreaVPoint[]>(() =>
    rows().map((r) => ({
      label: r.month,
      value: r.cumulative,
      tooltipLabel: r.month,
      tooltipRows: [
        { name: "Cumulative", value: String(r.cumulative), color: "#f5c518" },
        { name: "This month", value: String(r.completed), color: "rgba(255,255,255,0.5)" },
      ],
    })),
  );

  const paceBadges = createMemo(() => {
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
      height="100%"
      footer={
        <div class="stats-pace-row stats-pace-row-badges">
          <For each={paceBadges()}>
            {(chip) => (
              <div class="stats-pace-badge-wrap">
                <GlassBadge
                  intent="info"
                  size="default"
                  icon={chip.icon}
                  glass
                  class="stats-pace-badge"
                  label={`${chip.value} · ${chip.label}`}
                />
              </div>
            )}
          </For>
        </div>
      }
    >
      <Show
        when={rows().length > 0}
        fallback={<p class="stats-chart-empty">No completed titles yet.</p>}
      >
        <AreaChartV points={points()} height={260} />
      </Show>
    </ChartContainer>
  );
};

export default TrendsChart;
