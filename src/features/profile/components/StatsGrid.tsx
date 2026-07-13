// src/features/profile/components/StatsGrid.tsx
//
// StatsGrid — three glassmorphism boxes showing watchlist totals.
//
// Layout:
//   Box 1: Total titles in watchlist (all)
//   Box 2: Total movies in watchlist
//   Box 3: Total series in watchlist
//
// Visual language:
//   • Glassmorphism (frosted glass) — translucent tier-2 background,
//     blur backdrop, hairline border
//   • Theme-aware: uses --p accent for the numeric value, --text-soft
//     for the label
//   • Each box has a subtle icon and a large numeric value
//   • Hover: border brightens, soft lift
//
// Architecture:
//   ProfilePage → StatsGrid → useStats (derived from watchlist)

import { type Component, type Accessor, Show } from "solid-js";
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
        sublabel: "in watchlist",
        value: s?.total ?? 0,
        icon: "video_library",
      },
      {
        label: "Movies",
        sublabel: "in watchlist",
        value: s?.movieCount ?? 0,
        icon: "movie",
      },
      {
        label: "Series",
        sublabel: "in watchlist",
        value: s?.tvCount ?? 0,
        icon: "tv",
      },
    ];
  };

  return (
    <section class="profile-section profile-stats-grid-section" aria-label="Watchlist statistics">
      <div class="stats-grid" role="list">
        {boxes().map((box) => (
          <div class="stats-glass-box" role="listitem" aria-label={`${box.label}: ${box.value} ${box.sublabel}`}>
            <div class="stats-glass-icon-wrap" aria-hidden="true">
              <span class="material-symbols-outlined stats-glass-icon" aria-hidden="true">
                {box.icon}
              </span>
            </div>
            <p class="stats-glass-value">{box.value}</p>
            <p class="stats-glass-label">
              <span class="stats-glass-label-strong">{box.label}</span>
              <Show when={box.sublabel}>
                <span class="stats-glass-label-sub">{box.sublabel}</span>
              </Show>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default StatsGrid;
