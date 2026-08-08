// src/features/landing/components/DemoDiscoverShowcase.tsx
/**
 * DemoDiscoverShowcase — composed product showcase for the Discover experience.
 *
 * Renders a spotlight-style hero card (left) with two poster rails (right).
 * On mobile the layout stacks vertically. Uses static demo data only.
 */

import { Component, For } from "solid-js";
import { GlassCard, GlassBadge } from "~/shared/ui/glass";
import { tmdbImage } from "~/core/tmdb/tmdb";
import SafeImage from "~/shared/ui/SafeImage";
import DemoPosterRail from "./DemoPosterRail";
import {
  DEMO_SPOTLIGHT,
  DEMO_MOVIES,
  DEMO_TV_SHOWS,
} from "../data/demoContent";

// ─── Component ─────────────────────────────────────────────────

const DemoDiscoverShowcase: Component = () => {
  const spotlight = DEMO_SPOTLIGHT;

  return (
    <div class="landing-discover">
      {/* Left: Spotlight hero */}
      <GlassCard
        variant="glass-strong"
        padding="none"
        class="landing-discover__spotlight"
      >
        {/* Backdrop image */}
        <div class="landing-discover__backdrop">
          <SafeImage
            src={tmdbImage(spotlight.backdropPath, "w1280")}
            alt=""
            class="landing-discover__backdrop-img"
            fallback={<div class="landing-discover__backdrop-fallback" />}
          />
          <div class="landing-discover__backdrop-overlay" />
        </div>

        {/* Content overlay */}
        <div class="landing-discover__spotlight-content">
          <div class="landing-discover__badges">
            <GlassBadge
              intent="primary"
              label={spotlight.rating.toFixed(1)}
              icon="star"
              size="compact"
              glass
            />
            <For each={spotlight.genres}>
              {(genre) => (
                <GlassBadge
                  intent="default"
                  label={genre}
                  size="compact"
                  glass
                />
              )}
            </For>
          </div>
          <h3 class="landing-discover__spotlight-title">
            {spotlight.title}
          </h3>
          <p class="landing-discover__spotlight-tagline">
            {spotlight.tagline}
          </p>
          <p class="landing-discover__spotlight-year">
            {spotlight.year}
          </p>
        </div>
      </GlassCard>

      {/* Right: Rails */}
      <div class="landing-discover__rails">
        <DemoPosterRail
          titles={DEMO_MOVIES.slice(0, 8)}
          title="Trending"
          showRating
        />
        <DemoPosterRail
          titles={DEMO_TV_SHOWS.slice(0, 6)}
          title="Because You Loved Inception"
        />
      </div>
    </div>
  );
};

export default DemoDiscoverShowcase;
