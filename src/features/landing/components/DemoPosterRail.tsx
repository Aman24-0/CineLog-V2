// src/features/landing/components/DemoPosterRail.tsx
/**
 * DemoPosterRail — horizontal scrollable poster rail for the landing page.
 *
 * Renders a row of GlassPosterCard items with optional section title.
 * Uses scroll-snap for smooth UX on both mobile (touch) and desktop.
 * This is a static demo component — no real data fetching.
 */

import { Component, For, Show } from "solid-js";
import { GlassPosterCard } from "~/shared/ui/glass";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { DemoTitle } from "../data/demoContent";

// ─── Props ─────────────────────────────────────────────────────

export interface DemoPosterRailProps {
  /** Array of demo titles to render as poster cards. */
  titles: DemoTitle[];
  /** Optional section title (e.g. "Trending"). */
  title?: string;
  /** Whether to show the rating badge on each card. */
  showRating?: boolean;
}

// ─── Component ─────────────────────────────────────────────────

const DemoPosterRail: Component<DemoPosterRailProps> = (props) => {
  return (
    <div class="landing-rail">
      <Show when={props.title}>
        <h3 class="landing-rail__title">{props.title}</h3>
      </Show>
      <div class="landing-rail__scroll">
        <For each={props.titles}>
          {(item) => (
            <div class="landing-rail__item">
              <GlassPosterCard
                title={item.title}
                meta={`${item.year} \u2022 ${item.genres[0] ?? ""}`}
                imageUrl={tmdbImage(item.posterPath, "w342")}
                imageAlt={`${item.title} poster`}
                overlay={
                  props.showRating ? (
                    <span class="landing-rail__rating-badge">
                      {item.rating.toFixed(1)}
                    </span>
                  ) : undefined
                }
              />
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default DemoPosterRail;
