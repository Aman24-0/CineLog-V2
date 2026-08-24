// src/features/stats/components/StatsOverview.tsx
//
// StatsOverview — the 4 hero cards at the top of the Statistics page.
//
// Each card shows a single headline number with a small icon, a label,
// and a one-line sub-text that gives the number context (e.g. "23
// movies · 7 series" under the Titles card). The "Completed" card
// also carries a circular progress ring that fills to the completion
// percentage — a visual anchor that the rest of the page can reference.
//
// The card grid is responsive: 2 columns on mobile, 4 on desktop.

import { Show, For, type Component, type Accessor } from "solid-js";
import { GlassCard } from "~/shared/ui/glass";
import type { OverviewStats } from "~/lib/supabase/repositories/stats";

interface StatsOverviewProps {
  overview: Accessor<OverviewStats>;
}

interface OverviewCard {
  key: string;
  icon: string;
  iconClass: string;
  label: string;
  value: string;
  sub: string;
  /** When set, a circular progress ring is rendered at the right of the card. */
  progress?: number;
}

const StatsOverview: Component<StatsOverviewProps> = (props) => {
  const cards = (): OverviewCard[] => {
    const o = props.overview();
    return [
      {
        key: "titles",
        icon: "movie",
        iconClass: "stats-overview-icon-gold",
        label: "Titles",
        value: String(o.totalTitles),
        sub: `${o.totalMovies} movies · ${o.totalSeries} series`
      },
      {
        key: "hours",
        icon: "schedule",
        iconClass: "stats-overview-icon-blue",
        label: "Hours Watched",
        value: String(o.totalHoursWatched),
        sub: `${o.totalMinutesWatched.toLocaleString()} minutes`
      },
      {
        key: "rating",
        icon: "star",
        iconClass: "stats-overview-icon-yellow",
        label: "Avg Rating",
        value: o.averageRating > 0 ? o.averageRating.toFixed(1) : "—",
        sub: "out of 10"
      },
      {
        key: "completed",
        icon: "task_alt",
        iconClass: "stats-overview-icon-green",
        label: "Completed",
        value: String(o.completedCount),
        sub: `${o.completedPercentage}% of library`,
        progress: o.completedPercentage
      }
    ];
  };

  return (
    <div class="stats-overview-grid">
      <For each={cards()}>
        {(card) => (
          <GlassCard class="stats-overview-card" padding="default">
            <div class="stats-overview-card-row">
              <div class="stats-overview-card-text">
                <div
                  class={`stats-overview-icon ${card.iconClass}`}
                  aria-hidden="true"
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "20px" }}
                    aria-hidden="true"
                  >
                    {card.icon}
                  </span>
                </div>
                <p class="stats-overview-value">{card.value}</p>
                <p class="stats-overview-label">{card.label}</p>
                <p class="stats-overview-sub">{card.sub}</p>
              </div>
              <Show when={card.progress !== undefined}>
                <ProgressRing value={card.progress!} />
              </Show>
            </div>
          </GlassCard>
        )}
      </For>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ProgressRing — small circular SVG progress indicator
//
// Sized to visually pair with the 32px stat icon on the left side of
// the card (40px outer diameter, 3px stroke). Top-aligned so it sits
// on the same baseline as the icon row and never crowds the value
// text on narrow mobile cards.
// ---------------------------------------------------------------------------

const ProgressRing: Component<{ value: number }> = (props) => {
  const size = 40;
  const center = size / 2;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = (): number => {
    const pct = Math.max(0, Math.min(100, props.value));
    return circumference - (pct / 100) * circumference;
  };
  return (
    <div class="stats-overview-ring" aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--tier-3, rgba(255,255,255,0.08))"
          stroke-width="3"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--p)"
          stroke-width="3"
          stroke-linecap="round"
          stroke-dasharray={`${circumference}`}
          stroke-dashoffset={`${offset()}`}
          transform={`rotate(-90 ${center} ${center})`}
          style={{
            transition: "stroke-dashoffset 800ms var(--ease-smooth, ease)"
          }}
        />
      </svg>
      <span class="stats-overview-ring-label">{props.value}%</span>
    </div>
  );
};

export default StatsOverview;
