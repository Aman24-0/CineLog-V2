// src/features/profile/components/ProfileAchievements.tsx
//
// Compact achievements strip — folded into the Collection section.
// Shows up to 4 small earned icons + locked count.
// Not a standalone section — it's a detail within Collection.
//
// Design:
//   • Small circular icons (32px) in a single row
//   • Tier indicated by fill opacity, not color
//   • "+N locked" count in Azeret Mono
//   • Tappable — navigates to full achievements page
//   • Quiet presence — doesn't demand attention

import { Show, For, createMemo, type Component } from "solid-js";
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
    title: "Opening Night",
    desc: "Add your first title",
    icon: "play_circle",
    tier: "bronze",
    progress: (list) => ({ unlocked: list.length >= 1, current: Math.min(list.length, 1), target: 1 }),
  },
  {
    id: "ten-titles",
    title: "Double Feature",
    desc: "Build a vault of 10 titles",
    icon: "video_library",
    tier: "bronze",
    progress: (list) => ({ unlocked: list.length >= 10, current: Math.min(list.length, 10), target: 10 }),
  },
  {
    id: "fifty-titles",
    title: "Festival Selection",
    desc: "Reach 50 titles",
    icon: "movie_filter",
    tier: "silver",
    progress: (list) => ({ unlocked: list.length >= 50, current: Math.min(list.length, 50), target: 50 }),
  },
  {
    id: "hundred-titles",
    title: "Palme d'Or",
    desc: "Reach 100 titles",
    icon: "auto_awesome",
    tier: "gold",
    progress: (list) => ({ unlocked: list.length >= 100, current: Math.min(list.length, 100), target: 100 }),
  },
  {
    id: "first-complete",
    title: "Closing Credits",
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
    title: "Encore",
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
    title: "Standing Ovation",
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
    title: "Sci-Fi Pioneer",
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
    title: "Midnight Screening",
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
    title: "Drama Jury Prize",
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
    title: "Golden Reel",
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

  // Featured: top 4 by tier (highest first)
  const featured = createMemo(() => {
    const items = [...unlocked()];
    items.sort((a, b) => (TIER_ORDER[b.def.tier] ?? 0) - (TIER_ORDER[a.def.tier] ?? 0));
    return items.slice(0, 4);
  });

  return (
    <Show when={computed().length > 0}>
      <div class="achievements-strip" role="list" aria-label="Achievements">
        <For each={featured()}>
          {(ach) => (
            <button
              type="button"
              class={`achievements-strip-icon achievements-strip-${ach.def.tier} focus-ring`}
              onClick={() => navigate("/profile/achievements")}
              aria-label={`${ach.def.title}: ${ach.def.desc}`}
              title={ach.def.title}
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "16px", "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
                aria-hidden="true"
              >
                {ach.def.icon}
              </span>
            </button>
          )}
        </For>

        <Show when={locked().length > 0}>
          <span class="achievements-strip-count" aria-label={`${locked().length} locked achievements`}>
            +{locked().length}
          </span>
        </Show>
      </div>
    </Show>
  );
};

export default ProfileAchievements;
