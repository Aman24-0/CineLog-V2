// src/features/profile/components/StatsGrid.tsx
//
// StatsGrid — three glassmorphism boxes showing watchlist totals.
//
// LAYOUT (v2.1, per user request):
//   2 columns × 2 rows. The left column is a single tall box
//   (Total Titles) spanning both rows. The right column has two
//   stacked boxes (Movies top, Series bottom).
//
//   ┌──────────────┬──────────────┐
//   │              │   Movies     │
//   │  Total       ├──────────────┤
//   │  Titles      │   Series     │
//   └──────────────┴──────────────┘
//
// Visual language:
//   • Glassmorphism (frosted glass) — translucent tier-2 background,
//     blur backdrop, hairline border
//   • Theme-aware: uses --p accent for the numeric value
//   • Each box has a subtle icon and a large numeric value
//   • Hover: border brightens, soft lift
//   • No "in watchlist" sublabel — labels are clean ("Titles",
//     "Movies", "Series" only)
//
// Architecture:
//   ProfilePage → StatsGrid → useStats (derived from watchlist)

import { type Component, type Accessor } from "solid-js";
import type { StatsData } from "../useStats";

interface StatsGridProps {
  stats: Accessor<StatsData | null>;
}

const StatsGrid: Component<StatsGridProps> = (props) => {
  const total = () => props.stats()?.total ?? 0;
  const movies = () => props.stats()?.movieCount ?? 0;
  const series = () => props.stats()?.tvCount ?? 0;

  return (
    <section class="profile-section profile-stats-grid-section" aria-label="Watchlist statistics">
      <div class="stats-grid" role="list">
        {/* Total Titles — left column, spans both rows */}
        <div
          class="stats-glass-box stats-glass-box-total"
          role="listitem"
          aria-label={`Total titles: ${total()}`}
        >
          <div class="stats-glass-icon-wrap" aria-hidden="true">
            <span class="material-symbols-outlined stats-glass-icon" aria-hidden="true">
              video_library
            </span>
          </div>
          <p class="stats-glass-value">{total()}</p>
          <p class="stats-glass-label">
            <span class="stats-glass-label-strong">Titles</span>
          </p>
        </div>

        {/* Movies — right column, top row */}
        <div
          class="stats-glass-box stats-glass-box-movies"
          role="listitem"
          aria-label={`Movies: ${movies()}`}
        >
          <div class="stats-glass-icon-wrap" aria-hidden="true">
            <span class="material-symbols-outlined stats-glass-icon" aria-hidden="true">
              movie
            </span>
          </div>
          <p class="stats-glass-value">{movies()}</p>
          <p class="stats-glass-label">
            <span class="stats-glass-label-strong">Movies</span>
          </p>
        </div>

        {/* Series — right column, bottom row */}
        <div
          class="stats-glass-box stats-glass-box-series"
          role="listitem"
          aria-label={`Series: ${series()}`}
        >
          <div class="stats-glass-icon-wrap" aria-hidden="true">
            <span class="material-symbols-outlined stats-glass-icon" aria-hidden="true">
              tv
            </span>
          </div>
          <p class="stats-glass-value">{series()}</p>
          <p class="stats-glass-label">
            <span class="stats-glass-label-strong">Series</span>
          </p>
        </div>
      </div>
    </section>
  );
};

export default StatsGrid;
