// src/features/landing/components/DemoTimeline.tsx
/**
 * DemoTimeline — franchise timeline visualization for the landing page.
 *
 * Renders a horizontal timeline for the first demo franchise (MCU)
 * with connected phase nodes, year ranges, and title lists.
 * Uses GlassBadge for phase labels and a connecting accent line.
 *
 * Static demo — no real franchise data.
 */

import { Component, For } from "solid-js";
import { GlassCard, GlassBadge } from "~/shared/ui/glass";
import { DEMO_FRANCHISES } from "../data/demoContent";

// ─── Component ─────────────────────────────────────────────────

const DemoTimeline: Component = () => {
  const franchise = DEMO_FRANCHISES[0];

  return (
    <GlassCard
      variant="glass-strong"
      padding="none"
      class="landing-timeline"
    >
      {/* Header */}
      <div class="landing-timeline__header">
        <h3 class="landing-timeline__title">{franchise.name}</h3>
        <GlassBadge
          intent="primary"
          label="Timeline"
          icon="timeline"
          size="compact"
          glass
        />
      </div>

      {/* Timeline track */}
      <div class="landing-timeline__track">
        {/* Connecting line */}
        <div class="landing-timeline__line" aria-hidden="true" />

        <For each={franchise.phases}>
          {(phase, idx) => (
            <div class="landing-timeline__phase">
              {/* Node dot on the line */}
              <div
                class="landing-timeline__node"
                classList={{
                  "landing-timeline__node--first": idx() === 0,
                  "landing-timeline__node--last":
                    idx() === franchise.phases.length - 1
                }}
                aria-hidden="true"
              >
                <div class="landing-timeline__node-dot" />
              </div>

              {/* Phase label */}
              <GlassBadge
                intent="primary"
                label={phase.name}
                size="compact"
                glass
                class="landing-timeline__phase-badge"
              />

              {/* Years */}
              <span class="landing-timeline__phase-years">
                {phase.years}
              </span>

              {/* Title list */}
              <ul class="landing-timeline__phase-titles">
                <For each={phase.titles}>
                  {(title) => (
                    <li class="landing-timeline__phase-title">
                      {title}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
      </div>
    </GlassCard>
  );
};

export default DemoTimeline;
