// src/features/profile/achievements.constants.ts
//
// Single source of truth for all CineLog achievement definitions.
//
// Bug #10 (Phase 13 Chunk 3): The AchievementsPage and
// AchievementsPreview components had drifted — the page had 16 badges
// while the preview had 15 (missing `animation-fan`) and several
// titles/thresholds mismatched (e.g. `hundred-titles` was "Cinema
// Lover" on the page but "Top 50 Watcher" in the preview, even though
// both used the same 100-title threshold).
//
// This module is the canonical list. Both components now import and
// map over `ACHIEVEMENTS` here, eliminating future drift.
//
// Achievement philosophy: NOT gamification. No XP, no levels, no
// childish badges. Each entry is an elegant museum card — premium,
// minimal, aspirational. The `desc` field is rendered on the full
// AchievementsPage but is intentionally optional for the preview rail
// (which only shows title + icon + progress).

import { hasGenre, collectGenres } from "~/shared/utils/genres";
import type { WatchlistItem } from "~/shared/types";

export interface AchievementDef {
  id: string;
  title: string;
  /** Longer description shown on the full Achievements page. The preview
   *  rail ignores this field. */
  desc: string;
  icon: string;
  /** Compute progress from a watchlist. Returns { current, target } or
   *  { unlocked: true } — the latter is implied when current >= target. */
  progress: (list: WatchlistItem[]) => {
    unlocked: boolean;
    current: number;
    target: number;
  };
}

/**
 * Canonical achievement list. Order is significant — it controls both
 * the rendering order on the Achievements page and the left-to-right
 * order in the profile preview rail.
 *
 * When adding a new achievement, append to this array ONLY. Do not
 * duplicate the definition in any component file.
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-watch",
    title: "First Steps",
    desc: "Add your first title to your watchlist.",
    icon: "play_circle",
    progress: (list) => ({
      unlocked: list.length >= 1,
      current: Math.min(list.length, 1),
      target: 1
    })
  },
  {
    id: "ten-titles",
    title: "Getting Started",
    desc: "Build a watchlist of 10 titles.",
    icon: "video_library",
    progress: (list) => ({
      unlocked: list.length >= 10,
      current: Math.min(list.length, 10),
      target: 10
    })
  },
  {
    id: "fifty-titles",
    title: "Cinephile",
    desc: "Reach 50 titles in your watchlist.",
    icon: "movie_filter",
    progress: (list) => ({
      unlocked: list.length >= 50,
      current: Math.min(list.length, 50),
      target: 50
    })
  },
  {
    id: "hundred-titles",
    title: "Cinema Lover",
    desc: "Reach 100 titles in your watchlist.",
    icon: "auto_awesome",
    progress: (list) => ({
      unlocked: list.length >= 100,
      current: Math.min(list.length, 100),
      target: 100
    })
  },
  {
    id: "first-complete",
    title: "Completed",
    desc: "Finish your first title.",
    icon: "task_alt",
    progress: (list) => {
      const c = list.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 1, current: Math.min(c, 1), target: 1 };
    }
  },
  {
    id: "ten-completed",
    title: "Finisher",
    desc: "Complete 10 titles.",
    icon: "check_circle",
    progress: (list) => {
      const c = list.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    }
  },
  {
    id: "fifty-completed",
    title: "Completionist",
    desc: "Complete 50 titles.",
    icon: "emoji_events",
    progress: (list) => {
      const c = list.filter((m) => m.status === "Completed").length;
      return { unlocked: c >= 50, current: Math.min(c, 50), target: 50 };
    }
  },
  {
    id: "sci-fi-explorer",
    title: "Sci-Fi Explorer",
    desc: "Watch 10 Sci-Fi titles.",
    icon: "rocket_launch",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "sci")).length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    }
  },
  {
    id: "horror-fan",
    title: "Horror Aficionado",
    desc: "Watch 10 Horror titles.",
    icon: "ghost",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "horror")).length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    }
  },
  {
    id: "drama-lover",
    title: "Drama Lover",
    desc: "Watch 15 Drama titles.",
    icon: "theater_comedy",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "drama")).length;
      return { unlocked: c >= 15, current: Math.min(c, 15), target: 15 };
    }
  },
  {
    id: "animation-fan",
    title: "Animation Fan",
    desc: "Watch 10 Animation titles.",
    icon: "animation",
    progress: (list) => {
      const c = list.filter((m) => hasGenre(m, "anim")).length;
      return { unlocked: c >= 10, current: Math.min(c, 10), target: 10 };
    }
  },
  {
    id: "tv-binger",
    title: "Series Binger",
    desc: "Add 20 TV series to your watchlist.",
    icon: "tv",
    progress: (list) => {
      const c = list.filter((m) => m.media_type === "tv").length;
      return { unlocked: c >= 20, current: Math.min(c, 20), target: 20 };
    }
  },
  {
    id: "movie-purist",
    title: "Film Purist",
    desc: "Add 30 movies to your watchlist.",
    icon: "movie",
    progress: (list) => {
      const c = list.filter((m) => m.media_type === "movie").length;
      return { unlocked: c >= 30, current: Math.min(c, 30), target: 30 };
    }
  },
  {
    id: "critic",
    title: "Critic",
    desc: "Rate 25 titles.",
    icon: "star",
    progress: (list) => {
      const c = list.filter((m) => m.rating && m.rating > 0).length;
      return { unlocked: c >= 25, current: Math.min(c, 25), target: 25 };
    }
  },
  {
    id: "decade-explorer",
    title: "Time Traveler",
    desc: "Watch titles from 4 different decades.",
    icon: "history",
    progress: (list) => {
      const decades = new Set<string>();
      list.forEach((m) => {
        const d = m.release_date || m.first_air_date;
        if (d) {
          const y = parseInt(d.split("-")[0], 10);
          if (!isNaN(y)) decades.add(Math.floor(y / 10) * 10 + "s");
        }
      });
      return {
        unlocked: decades.size >= 4,
        current: Math.min(decades.size, 4),
        target: 4
      };
    }
  },
  {
    id: "genre-explorer",
    title: "Eclectic Taste",
    desc: "Watch titles from 8 different genres.",
    icon: "palette",
    progress: (list) => {
      const genres = new Set<string>();
      collectGenres(list).forEach((g) => genres.add(g));
      return {
        unlocked: genres.size >= 8,
        current: Math.min(genres.size, 8),
        target: 8
      };
    }
  }
];

/** Total achievement count — convenience export so consumers don't
 *  reach into the array. */
export const ACHIEVEMENTS_TOTAL = ACHIEVEMENTS.length;
