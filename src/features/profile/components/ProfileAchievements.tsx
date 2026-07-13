// src/features/profile/components/ProfileAchievements.tsx
//
// Sprint 2C — Final Implementation.
// Featured trophy case — not a horizontal rail.
// Shows 3-4 most prestigious unlocked trophies + locked count.
// Expandable into full achievements page.
//
// Design:
//   • Featured layout: highest-tier unlocked at larger size
//   • Locked as silhouettes (outline only, no icon fill)
//   • Tier colors: bronze/silver/gold/platinum
//   • Green accent ONLY on platinum glow
//   • Counter: "4 of 16" in Azeret Mono
//   • "View All" navigates to full achievements page

import { Show, For, createMemo, createSignal, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { WatchlistItem } from "~/shared/types";
import { hasGenre, collectGenres } from "~/shared/utils/genres";

interface ProfileAchievementsProps {
  watchlist: () => WatchlistItem[];
}

// ── Achievement Definitions ──────────────────────────────────────

interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  progress: (list: WatchlistItem[]) =>
    { unlocked: boolean; current: number; target: number };
}

const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-watch",
    title: "First Steps",
    desc: "Add your first title",
    icon: "play_circle",
    tier: "bronze",
    progress: (list) => ({ unlocked: list.length >= 1, current: Math.min(list.length, 1), target: 1 }),
  },
  {
    id: "ten-titles",
    title: "Getting Started",
    desc: "Build a vault of 10 titles",
    icon: "video_library",
    tier: "bronze",
    progress: (list) => ({ unlocked: list.length >= 10, current: Math.min(list.length, 10), target: 10 }),
  },
  {
    id: "fifty-titles",
    title: "Cinephile",
    desc: "Reach 50 titles",
    icon: "movie_filter",
    tier: "silver",
    progress: (list) => ({ unlocked: list.length >= 50, current: Math.min(list.length, 50), target: 50 }),
  },
  {
    id: "hundred-titles",
    title: "Cinema Legend",
    desc: "Reach 100 titles",
    icon: "auto_awesome",
    tier: "gold",
    progress: (list) => ({ unlocked: list.length >= 100, current: Math.min(list.length, 100), target: 100 }),
  },
  {
    id: "first-complete",
    title: "Finished",
    desc: "Complete your first title",
    icon: "task_alt",
    tier: "bronze",
    progress: (list) => {
      const c = list.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 1, current: Math.min(c, 1), target: 1 };
    },
  },
  {
    id: "ten-completed",
    title: "Finisher",
    desc: "Complete 10 titles",
    icon: "check_circle",
    tier: "silver",
    progress: (list) => {
      const c = list.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    },
  },
  {
    id: "fifty-completed",
    title: "Completionist",
    desc: "Complete 50 titles",
    icon: "emoji_events",
    tier: "gold",
    progress: (list) => {
      const c = list.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 50, current: Math.min(c, 50), target: 50 };
    },
  },
  {
    id: "sci-fi-explorer",
    title: "Sci-Fi Explorer",
    desc: "Watch 10 Sci-Fi titles",
    icon: "rocket_launch",
    tier: "silver",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "sci")).length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    },
  },
  {
    id: "horror-fan",
    title: "Night Owl",
    desc: "Watch 10 Horror titles",
    icon: "ghost",
    tier: "silver",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "horror")).length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    },
  },
  {
    id: "drama-lover",
    title: "Story Seeker",
    desc: "Watch 15 Drama titles",
    icon: "theater_comedy",
    tier: "silver",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "drama")).length;
      return { unlocked: c >= 15, current: Math.min(c, 15), target: 15 };
    },
  },
  {
    id: "animation-fan",
    title: "Dream Weaver",
    desc: "Watch 10 Animation titles",
    icon: "animation",
    tier: "silver",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "anim")).length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    },
  },
  {
    id: "tv-binger",
    title: "Series Binger",
    desc: "Add 20 TV series",
    icon: "tv",
    tier: "silver",
    progress: (list) => {
      const c = list.filter((m) => m.media_type === "tv").length;
      return { unlocked: c >= 20, current: Math.min(c, 20), target: 20 };
    },
  },
  {
    id: "movie-purist",
    title: "Film Purist",
    desc: "Add 30 movies",
    icon: "movie",
    tier: "silver",
    progress: (list) => {
      const c = list.filter((m) => m.media_type === "movie").length;
      return { unlocked: c >= 30, current: Math.min(c, 30), target: 30 };
    },
  },
  {
    id: "critic",
    title: "Critic",
    desc: "Rate 25 titles",
    icon: "star",
    tier: "silver",
    progress: (list) => {
      const c = list.filter((m) => m.rating && m.rating > 0).length;
      return { unlocked: c >= 25, current: Math.min(c, 25), target: 25 };
    },
  },
  {
    id: "decade-explorer",
    title: "Time Traveler",
    desc: "Watch titles from 4 decades",
    icon: "history",
    tier: "gold",
    progress: (list) => {
      const decades = new Set<string>();
      list.forEach((m) => {
        const d = m.release_date || m.first_air_date;
        if (d) {
          const y = parseInt(d.split("-")[0], 10);
          if (!isNaN(y)) decades.add(Math.floor(y / 10) * 10 + "s");
        }
      });
      return { unlocked: decades.size >= 4, current: Math.min(decades.size, 4), target: 4 };
    },
  },
  {
    id: "genre-explorer",
    title: "Eclectic Taste",
    desc: "Watch titles from 8 genres",
    icon: "palette",
    tier: "platinum",
    progress: (list) => {
      const genres = new Set<string>();
      collectGenres(list).forEach((g) => genres.add(g));
      return { unlocked: genres.size >= 8, current: Math.min(genres.size, 8), target: 8 };
    },
  },
];

// ── Tier color map ───────────────────────────────────────────────

const TIER_COLORS: Record<string, { bg: string; border: string; glow: string }> = {
  bronze:   { bg: "rgba(205,127,50,0.12)",  border: "rgba(205,127,50,0.35)",  glow: "rgba(205,127,50,0.2)" },
  silver:   { bg: "rgba(192,192,192,0.10)",  border: "rgba(192,192,192,0.30)", glow: "rgba(192,192,192,0.15)" },
  gold:     { bg: "rgba(255,215,0,0.12)",    border: "rgba(255,215,0,0.40)",   glow: "rgba(255,215,0,0.25)" },
  platinum: { bg: "rgba(0,229,255,0.10)",    border: "rgba(0,229,255,0.40)",   glow: "rgba(0,229,255,0.2)" },
};

// ── Tier ordering (higher = more prestigious) ────────────────────

const TIER_ORDER: Record<string, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

// ── Component ────────────────────────────────────────────────────

const ProfileAchievements: Component<ProfileAchievementsProps> = (props) => {
  const navigate = useNavigate();

  const computed = createMemo(() => {
    const list = props.watchlist();
    return ACHIEVEMENTS.map((def) => {
      const p = def.progress(list);
      return { def, ...p };
    });
  });

  const unlocked = createMemo(() => computed().filter((a) => a.unlocked));
  const locked = createMemo(() => computed().filter((a) => !a.unlocked));
  const unlockedCount = createMemo(() => unlocked().length);

  // Featured: top 3-4 by tier (highest first), limited to unlocked
  const featured = createMemo(() => {
    const items = [...unlocked()];
    items.sort((a, b) => (TIER_ORDER[b.def.tier] ?? 0) - (TIER_ORDER[a.def.tier] ?? 0));
    return items.slice(0, 4);
  });

  const [expanded, setExpanded] = createSignal(false);

  return (
    <Show when={computed().length > 0}>
      <section class="profile-section achievements-section" aria-label="Achievements">
        {/* Counter: "4 of 16" */}
        <div class="achievements-header">
          <p class="achievements-counter">
            <span class="achievements-counter-unlocked">{unlockedCount()}</span>
            <span class="achievements-counter-sep"> of </span>
            <span class="achievements-counter-total">{ACHIEVEMENTS.length}</span>
          </p>
        </div>

        {/* Featured trophy case */}
        <div class="achievements-trophy-case" role="list" aria-label="Featured achievements">
          <For each={expanded() ? unlocked() : featured()}>
            {(ach, _idx) => {
              const tierStyle = TIER_COLORS[ach.def.tier] ?? TIER_COLORS.bronze;
              const isPlatinum = ach.def.tier === "platinum";
              return (
                <div
                  role="listitem"
                  class={`achievement-trophy achievement-trophy-unlocked achievement-trophy-${ach.def.tier}`}
                  style={{
                    "background": tierStyle.bg,
                    "border-color": tierStyle.border,
                    "box-shadow": isPlatinum
                      ? `0 0 20px var(--p-glow, ${tierStyle.glow}), inset 0 0 12px ${tierStyle.glow}`
                      : `0 0 12px ${tierStyle.glow}, inset 0 0 8px ${tierStyle.glow}`,
                  }}
                >
                  <button
                    type="button"
                    class="achievement-trophy-btn focus-ring"
                    onClick={() => navigate("/profile/achievements")}
                    aria-label={`${ach.def.title} — ${ach.def.tier}: ${ach.def.desc}`}
                    title={ach.def.desc}
                  >
                    <span
                      class="material-symbols-outlined achievement-trophy-icon"
                      style={{ "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                      aria-hidden="true"
                    >
                      {ach.def.icon}
                    </span>
                    <span class="achievement-trophy-label">{ach.def.title}</span>
                  </button>
                </div>
              );
            }}
          </For>

          {/* Locked silhouettes (small, at end) */}
          <Show when={!expanded() && locked().length > 0}>
            <div class="achievements-locked-group" aria-hidden="true">
              <For each={locked().slice(0, 3)}>
                {() => (
                  <div class="achievement-trophy achievement-trophy-locked">
                    <div class="achievement-trophy-silhouette" />
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* "+ N more" or "View All" */}
        <Show when={!expanded() && locked().length > 0}>
          <button
            type="button"
            class="achievements-more focus-ring"
            onClick={() => setExpanded(true)}
            aria-label={`Show all ${locked().length} locked achievements`}
          >
            + {locked().length} locked
          </button>
        </Show>
        <Show when={expanded() && unlocked().length > 4}>
          <button
            type="button"
            class="achievements-view-all focus-ring"
            onClick={() => navigate("/profile/achievements")}
            aria-label="View all achievements"
          >
            View All Achievements
            <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">arrow_forward</span>
          </button>
        </Show>
      </section>
    </Show>
  );
};

export default ProfileAchievements;
