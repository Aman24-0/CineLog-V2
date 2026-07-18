// src/features/profile/components/StatsGrid.tsx
//
// StatsGrid — three glassmorphism boxes showing watchlist totals.
//
// Layout (v2.2 — per user request "remove 'in watchlist' text and align
// all three in one horizontal row"):
//   All three boxes sit in a single horizontal row (3 equal columns):
//     Box 1: Total titles in watchlist
//     Box 2: Total movies in watchlist
//     Box 3: Total series in watchlist
//   Each box shows: icon (top), large number, label — vertically stacked
//   and centered. No sublabel text.
//
// Visual language:
//   • Glassmorphism (frosted glass) — translucent tier-2 background,
//     blur backdrop, hairline border
//   • Theme-aware: uses --p accent for the numeric value, --text-soft
//     for the label
//   • Hover: border brightens, soft lift
//
// Architecture:
//   ProfilePage → StatsGrid → useStats (derived from watchlist)

import { type Component, type Accessor } from "solid-js";
import type { StatsData } from "../useStats";

interface StatsGridProps {
  stats: Accessor<StatsData | null>;
}

const StatsGrid: Component<StatsGridProps> = (props) => {
  const boxes = () => {
    const s = props.stats();
    return [
      {
        label: "Titles",
        value: s?.total ?? 0,
        icon: "video_library",
      },
      {
        label: "Movies",
        value: s?.movieCount ?? 0,
        icon: "movie",
      },
      {
        label: "Series",
        value: s?.tvCount ?? 0,
        icon: "tv",
      },
    ];
  };

  return (
    <section class="profile-section profile-stats-grid-section" aria-label="Watchlist statistics">
      <div class="stats-grid" role="list">
        {boxes().map((box) => (
          <div
            class="stats-glass-box"
            role="listitem"
            aria-label={`${box.label}: ${box.value}`}
          >
            <div class="stats-glass-icon-wrap" aria-hidden="true">
              <span class="material-symbols-outlined stats-glass-icon" aria-hidden="true">
                {box.icon}
              </span>
            </div>
            <p class="stats-glass-value">{box.value}</p>
            <p class="stats-glass-label">
              <span class="stats-glass-label-strong">{box.label}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default StatsGrid;
