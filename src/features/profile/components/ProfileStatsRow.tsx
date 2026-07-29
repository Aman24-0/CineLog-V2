// src/features/profile/components/ProfileStatsRow.tsx
//
// ProfileStatsRow — five GlassStatCards showing:
//   1. Titles (total count)
//   2. Movies
//   3. Series
//   4. Hours watched (from total runtime)
//   5. Average rating
//
// Each card uses the GlassStatCard component for visual consistency
// with the rest of the app. Below the numeric value, a small
// progress ring shows the user's completion percentage (Completed /
// Total) — gives a glanceable "how much have I finished" indicator.

import { Show, For, type Component, type Accessor } from "solid-js";
import { GlassCard } from "~/shared/ui/glass";
import type { StatsData } from "../useStats";

export interface ProfileStatsRowProps {
  stats: Accessor<StatsData | null>;
}

interface StatCard {
  label: string;
  value: string;
  icon: string;
  /** Optional sublabel (e.g. "X% completed"). */
  sublabel?: string;
  /** Optional progress value 0-100 for the ring under the stat. */
  progress?: number;
}

const ProfileStatsRow: Component<ProfileStatsRowProps> = (props) => {
  const cards = (): StatCard[] => {
    const s = props.stats();
    if (!s) {
      // Loading skeleton values — show "—" so the layout doesn't jump.
      return [
        { label: "Titles", value: "—", icon: "video_library" },
        { label: "Movies", value: "—", icon: "movie" },
        { label: "Series", value: "—", icon: "tv" },
        { label: "Hours", value: "—", icon: "schedule" },
        { label: "Avg ★", value: "—", icon: "star" },
      ];
    }
    const completionPct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
    return [
      {
        label: "Titles",
        value: String(s.total),
        icon: "video_library",
        sublabel: `${completionPct}% completed`,
        progress: completionPct,
      },
      {
        label: "Movies",
        value: String(s.movieCount),
        icon: "movie",
        sublabel: `${s.moviePct}% of library`,
        progress: s.moviePct,
      },
      {
        label: "Series",
        value: String(s.tvCount),
        icon: "tv",
        sublabel: `${s.tvPct}% of library`,
        progress: s.tvPct,
      },
      {
        label: "Hours",
        value: String(s.totalRuntimeHours),
        icon: "schedule",
        sublabel: "watched",
      },
      {
        label: "Avg ★",
        value: s.avgRating > 0 ? String(s.avgRating) : "—",
        icon: "star",
        sublabel: s.avgRating > 0 ? "out of 10" : "not rated yet",
      },
    ];
  };

  return (
    <section class="profile-stats-row-v3" aria-label="Library statistics">
      <For each={cards()}>
        {(card) => (
          <GlassCard
            variant="glass"
            size="compact"
            class="profile-stat-card-v3"
            aria-label={`${card.label}: ${card.value}${card.sublabel ? ` (${card.sublabel})` : ""}`}
          >
            <div class="profile-stat-card-v3-icon-wrap" aria-hidden="true">
              <span class="material-symbols-outlined" aria-hidden="true">
                {card.icon}
              </span>
            </div>
            <p class="profile-stat-card-v3-value">{card.value}</p>
            <p class="profile-stat-card-v3-label">{card.label}</p>
            <Show when={card.sublabel}>
              <p class="profile-stat-card-v3-sublabel">{card.sublabel}</p>
            </Show>
            <Show when={card.progress != null && card.progress >= 0}>
              <div
                class="profile-stat-card-v3-progress"
                role="progressbar"
                aria-valuenow={card.progress ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${card.label} progress`}
              >
                <div
                  class="profile-stat-card-v3-progress-fill"
                  style={{ width: `${card.progress ?? 0}%` }}
                />
              </div>
            </Show>
          </GlassCard>
        )}
      </For>
    </section>
  );
};

export default ProfileStatsRow;
