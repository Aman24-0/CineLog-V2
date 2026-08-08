// src/features/landing/components/DemoStatsShowcase.tsx
/**
 * DemoStatsShowcase — statistics dashboard visualization for the landing page.
 *
 * Renders:
 *   1. Four GlassStatCard items (Total Titles, Hours Watched, Avg Rating, Completed)
 *   2. A CSS-only horizontal genre bar chart with animated widths
 *   3. A Movies vs Series split bar
 *
 * Static demo — no real stats data.
 */

import { Component, For } from "solid-js";
import { GlassCard, GlassStatCard } from "~/shared/ui/glass";
import {
  DEMO_STAT_CARDS,
  DEMO_GENRE_BARS,
  DEMO_TYPE_SPLIT,
} from "../data/demoContent";

// ─── Component ─────────────────────────────────────────────────

const DemoStatsShowcase: Component = () => {
  return (
    <div class="landing-stats">
      {/* Stat cards row */}
      <div class="landing-stats__cards">
        <For each={DEMO_STAT_CARDS}>
          {(stat) => (
            <GlassStatCard
              value={stat.value}
              label={stat.label}
              icon={stat.icon}
              variant="glass"
              size="default"
            />
          )}
        </For>
      </div>

      {/* Genre bar chart */}
      <GlassCard
        variant="glass"
        size="comfortable"
        class="landing-stats__genre-chart"
      >
        <h4 class="landing-stats__chart-title">Genre Breakdown</h4>
        <div class="landing-stats__bars">
          <For each={DEMO_GENRE_BARS}>
            {(bar) => (
              <div class="landing-stats__bar-row">
                <span class="landing-stats__bar-label">{bar.genre}</span>
                <div class="landing-stats__bar-track">
                  <div
                    class="landing-stats__bar-fill"
                    style={{ width: `${bar.percent}%` }}
                  />
                </div>
                <span class="landing-stats__bar-value">{bar.percent}%</span>
              </div>
            )}
          </For>
        </div>
      </GlassCard>

      {/* Movies vs Series split */}
      <GlassCard
        variant="glass"
        size="compact"
        class="landing-stats__type-split"
      >
        <h4 class="landing-stats__chart-title">Movies vs Series</h4>
        <div class="landing-stats__split-bar">
          <div
            class="landing-stats__split-movies"
            style={{ width: `${DEMO_TYPE_SPLIT.movies}%` }}
          >
            <span class="landing-stats__split-label">
              {DEMO_TYPE_SPLIT.movies}% Movies
            </span>
          </div>
          <div
            class="landing-stats__split-series"
            style={{ width: `${DEMO_TYPE_SPLIT.series}%` }}
          >
            <span class="landing-stats__split-label">
              {DEMO_TYPE_SPLIT.series}% Series
            </span>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default DemoStatsShowcase;
