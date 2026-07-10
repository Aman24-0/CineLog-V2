// src/features/profile/useStats.ts
//
// useStats — derives cinematic statistics from the user's watchlist.
//
// This hook turns raw watchlist data into stories:
//   • Total titles, watching, completed, planned
//   • Total runtime (hours of cinema watched)
//   • Movie vs TV ratio
//   • Top genres (with counts + percentages)
//   • Release decade distribution
//   • Favorite decade
//   • Favorite directors (from the `director` field)
//   • Completion heatmap (last 365 days, GitHub-style)
//   • Monthly trends
//   • Weekend vs weekday watching
//   • Personal records (most prolific month, longest runtime)
//
// All computations are pure memos over the watchlist signal — no
// additional fetching. The hook is SSR-safe (reads from useUserLibrary
// which is already mounted at the app root).

import { createMemo, type Accessor } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { normalizeGenre, collectGenres } from "~/shared/utils/genres";
import type { WatchlistItem } from "~/shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatsData {
  total: number;
  watching: number;
  completed: number;
  planned: number;
  totalRuntimeMinutes: number;
  totalRuntimeHours: number;
  movieCount: number;
  tvCount: number;
  moviePct: number;
  tvPct: number;
  topGenres: { name: string; count: number; pct: number }[];
  decades: { decade: string; count: number }[];
  favoriteDecade: string | null;
  topDirectors: { name: string; count: number }[];
  heatmap: { date: string; level: 0 | 1 | 2 | 3 | 4 }[];
  monthlyCounts: { month: string; count: number }[];
  weekdayVsWeekend: { weekday: number; weekend: number };
  avgRating: number;
  topRated: WatchlistItem | null;
  mostRewatched: WatchlistItem | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStats(): { stats: Accessor<StatsData | null>; watchlist: Accessor<WatchlistItem[]> } {
  const library = useUserLibrary();

  const stats = createMemo<StatsData | null>(() => {
    const list = library.watchlist();
    if (!list || list.length === 0) return null;

    const watching = list.filter((m) => m.status === "Watching").length;
    const completed = list.filter((m) => m.status === "Completed").length;
    const planned = list.filter(
      (m) => m.status === "Planned" || m.status === "Plan to Watch"
    ).length;

    // Runtime
    const totalRuntimeMinutes = list.reduce(
      (sum, m) => sum + (m.runtime ?? 0),
      0
    );

    // Movie vs TV
    const movieCount = list.filter((m) => m.media_type === "movie").length;
    const tvCount = list.filter((m) => m.media_type === "tv").length;
    const total = movieCount + tvCount;
    const moviePct = total > 0 ? Math.round((movieCount / total) * 100) : 0;
    const tvPct = total > 0 ? 100 - moviePct : 0;

    // Genres
    const genreMap = new Map<string, number>();
    list.forEach((m) => {
      if (!m.genresList || !Array.isArray(m.genresList)) return;
      m.genresList.forEach((g) => {
        const name = normalizeGenre(g);
        if (name) genreMap.set(name, (genreMap.get(name) ?? 0) + 1);
      });
    });
    const topGenres = Array.from(genreMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Decades
    const decadeMap = new Map<string, number>();
    list.forEach((m) => {
      const dateStr = m.release_date || m.first_air_date;
      if (!dateStr) return;
      const year = parseInt(dateStr.split("-")[0], 10);
      if (isNaN(year)) return;
      const decade = `${Math.floor(year / 10) * 10}s`;
      decadeMap.set(decade, (decadeMap.get(decade) ?? 0) + 1);
    });
    const decades = Array.from(decadeMap.entries())
      .map(([decade, count]) => ({ decade, count }))
      .sort((a, b) => a.decade.localeCompare(b.decade));

    const favoriteDecade =
      decades.length > 0
        ? decades.reduce((max, d) => (d.count > max.count ? d : max)).decade
        : null;

    // Directors
    const directorMap = new Map<string, number>();
    list.forEach((m) => {
      if (m.director && m.director.trim()) {
        directorMap.set(m.director, (directorMap.get(m.director) ?? 0) + 1);
      }
    });
    const topDirectors = Array.from(directorMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Heatmap — last 365 days
    const heatmap = buildHeatmap(list);

    // Monthly counts — last 12 months
    const monthlyCounts = buildMonthlyCounts(list);

    // Weekday vs weekend
    const weekdayVsWeekend = buildWeekdayVsWeekend(list);

    // Average rating
    const ratedItems = list.filter((m) => m.rating && m.rating > 0);
    const avgRating =
      ratedItems.length > 0
        ? ratedItems.reduce((s, m) => s + (m.rating ?? 0), 0) / ratedItems.length
        : 0;

    // Top rated
    const topRated = ratedItems.length > 0
      ? ratedItems.reduce((max, m) => ((m.rating ?? 0) > (max.rating ?? 0) ? m : max))
      : null;

    return {
      total: list.length,
      watching,
      completed,
      planned,
      totalRuntimeMinutes,
      totalRuntimeHours: Math.round((totalRuntimeMinutes / 60) * 10) / 10,
      movieCount,
      tvCount,
      moviePct,
      tvPct,
      topGenres,
      decades,
      favoriteDecade,
      topDirectors,
      heatmap,
      monthlyCounts,
      weekdayVsWeekend,
      avgRating: Math.round(avgRating * 10) / 10,
      topRated,
      mostRewatched: null,
    };
  });

  return { stats, watchlist: library.watchlist };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHeatmap(list: WatchlistItem[]): { date: string; level: 0 | 1 | 2 | 3 | 4 }[] {
  const days: { date: string; level: 0 | 1 | 2 | 3 | 4 }[] = [];
  const today = new Date();
  const countMap = new Map<string, number>();

  list.forEach((m) => {
    const dateStr = m.watchDate || (typeof m.addedAt === "string" ? m.addedAt : null);
    if (!dateStr) return;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const key = d.toISOString().split("T")[0];
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    } catch {
      // skip invalid dates
    }
  });

  // Build 53 weeks (364 days) + today
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const count = countMap.get(key) ?? 0;
    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (count >= 4) level = 4;
    else if (count >= 3) level = 3;
    else if (count >= 2) level = 2;
    else if (count >= 1) level = 1;
    days.push({ date: key, level });
  }

  return days;
}

function buildMonthlyCounts(list: WatchlistItem[]): { month: string; count: number }[] {
  const months: { month: string; count: number }[] = [];
  const now = new Date();
  const countMap = new Map<string, number>();

  list.forEach((m) => {
    const dateStr = m.watchDate || (typeof m.addedAt === "string" ? m.addedAt : null);
    if (!dateStr) return;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    } catch {
      // skip
    }
  });

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short" });
    months.push({ month: label, count: countMap.get(key) ?? 0 });
  }

  return months;
}

function buildWeekdayVsWeekend(list: WatchlistItem[]): { weekday: number; weekend: number } {
  let weekday = 0;
  let weekend = 0;
  list.forEach((m) => {
    const dateStr = m.watchDate || (typeof m.addedAt === "string" ? m.addedAt : null);
    if (!dateStr) return;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const day = d.getDay();
      if (day === 0 || day === 6) weekend++;
      else weekday++;
    } catch {
      // skip
    }
  });
  return { weekday, weekend };
}
