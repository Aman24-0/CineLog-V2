// src/lib/supabase/repositories/stats.ts
//
// Statistics Repository — pure-functional stats calculators.
//
// NOTE on data source
// -------------------
// The spec asks for `getOverviewStats(userId)` style functions that
// query Supabase directly. In practice the `vault` table only stores
// status / rating / timestamps / progress_minutes / rewatch_count —
// everything else (genres, cast, director, release year, runtime,
// title, poster) is enriched client-side via TMDB and lives only in
// the in-memory `WatchlistItem[]` exposed by `useUserLibrary`.
//
// Querying Supabase for stats would therefore miss every genre,
// director, decade, and rating histogram data point — there's nothing
// in the DB to aggregate. The right architecture is:
//
//   useUserLibrary (vault + TMDB enrichment)
//         ↓
//   stats.ts (pure calculators over WatchlistItem[])
//         ↓
//   useStatsData / StatisticsPage
//
// All functions below are pure: same input → same output, no I/O, no
// side effects. They take a `WatchlistItem[]` and return JSON shapes
// that drop straight into recharts. They are also fully unit-testable.
//
// The function signatures match the spec conceptually (getOverviewStats,
// getGenreBreakdown, etc.) but take the enriched list as a parameter
// instead of a userId, because that is where the data actually lives.

import type { WatchlistItem } from "~/shared/types";
import { normalizeGenre } from "~/shared/utils/genres";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OverviewStats {
  totalTitles: number;
  totalMovies: number;
  totalSeries: number;
  totalHoursWatched: number;
  totalMinutesWatched: number;
  completedCount: number;
  completedPercentage: number;
  averageRating: number;
  uniqueGenresCount: number;
  watchingCount: number;
  plannedCount: number;
}

export interface GenreCount {
  genre: string;
  count: number;
}

export interface DecadeCount {
  decade: string;
  count: number;
}

export interface RatingBucket {
  rating: number;
  count: number;
}

export interface MonthBucket {
  month: string;
  year: number;
  count: number;
}

export interface PersonCount {
  name: string;
  count: number;
}

export interface HighestRatedItem {
  title: string;
  year: number | null;
  poster: string | null;
  userRating: number;
  /** Original WatchlistItem — lets the carousel open the Details modal. */
  item: WatchlistItem;
}

export interface WatchPace {
  daily: number;
  weekly: number;
  monthly: number;
}

export interface MovieSeriesSplit {
  movies: number;
  series: number;
  moviePercentage: number;
  seriesPercentage: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function safeYearFromDate(dateStr: string | null | undefined): number | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const year = parseInt(dateStr.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function decadeLabel(year: number | null): string | null {
  if (year === null || year < 1900 || year > 3000) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

function itemTitle(item: WatchlistItem): string {
  return item.title ?? item.name ?? item.original_title ?? item.original_name ?? "Untitled";
}

// ---------------------------------------------------------------------------
// Public functions — pure calculators over WatchlistItem[]
// ---------------------------------------------------------------------------

/**
 * High-level overview numbers shown in the StatsOverview cards.
 */
export function getOverviewStats(list: WatchlistItem[]): OverviewStats {
  const total = list.length;
  const movies = list.filter((m) => m.media_type === "movie").length;
  const series = list.filter((m) => m.media_type === "tv").length;
  const completed = list.filter((m) => m.status === "Completed").length;
  const watching = list.filter((m) => m.status === "Watching").length;
  const planned = list.filter(
    (m) => m.status === "Planned" || m.status === "Plan to Watch",
  ).length;

  const totalMinutes = list.reduce((sum, m) => sum + (m.runtime ?? 0), 0);
  const totalHours = totalMinutes / 60;

  const rated = list.filter((m) => typeof m.rating === "number" && (m.rating ?? 0) > 0);
  const avgRating =
    rated.length > 0
      ? rated.reduce((s, m) => s + (m.rating ?? 0), 0) / rated.length
      : 0;

  const genreSet = new Set<string>();
  list.forEach((m) => {
    if (Array.isArray(m.genresList)) {
      m.genresList.forEach((g) => {
        const n = normalizeGenre(g);
        if (n) genreSet.add(n);
      });
    }
  });

  return {
    totalTitles: total,
    totalMovies: movies,
    totalSeries: series,
    totalHoursWatched: Math.round(totalHours * 10) / 10,
    totalMinutesWatched: totalMinutes,
    completedCount: completed,
    completedPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    averageRating: Math.round(avgRating * 10) / 10,
    uniqueGenresCount: genreSet.size,
    watchingCount: watching,
    plannedCount: planned,
  };
}

/**
 * Top genres by count (descending). Returns at most `limit` entries.
 */
export function getGenreBreakdown(list: WatchlistItem[], limit = 10): GenreCount[] {
  const map = new Map<string, number>();
  list.forEach((m) => {
    if (!Array.isArray(m.genresList)) return;
    m.genresList.forEach((g) => {
      const n = normalizeGenre(g);
      if (!n) return;
      map.set(n, (map.get(n) ?? 0) + 1);
    });
  });
  return Array.from(map.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Count of titles per decade. Sorted chronologically. Decades with
 * zero titles are excluded.
 */
export function getDecadeBreakdown(list: WatchlistItem[]): DecadeCount[] {
  const map = new Map<string, number>();
  list.forEach((m) => {
    const year = safeYearFromDate(m.release_date ?? m.first_air_date);
    const decade = decadeLabel(year);
    if (!decade) return;
    map.set(decade, (map.get(decade) ?? 0) + 1);
  });
  return Array.from(map.entries())
    .map(([decade, count]) => ({ decade, count }))
    .sort((a, b) => a.decade.localeCompare(b.decade));
}

/**
 * Distribution of user ratings 1-10. Buckets with zero count are still
 * returned so the histogram chart can render every bar.
 */
export function getRatingsDistribution(list: WatchlistItem[]): RatingBucket[] {
  const counts = new Array(11).fill(0); // index 1..10
  list.forEach((m) => {
    const r = m.rating;
    if (typeof r === "number" && r >= 1 && r <= 10) {
      counts[r]++;
    }
  });
  const out: RatingBucket[] = [];
  for (let i = 1; i <= 10; i++) {
    out.push({ rating: i, count: counts[i] });
  }
  return out;
}

/**
 * Monthly activity for the last `months` months (default 12). Based on
 * the watch date (preferred) or addedAt as a fallback, for completed
 * titles only.
 */
export function getMonthlyActivity(list: WatchlistItem[], months = 12): MonthBucket[] {
  const completed = list.filter((m) => m.status === "Completed");
  const map = new Map<string, number>();

  completed.forEach((m) => {
    const dateStr = m.watchDate ?? (typeof m.addedAt === "string" ? m.addedAt : null);
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  });

  const out: MonthBucket[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short" });
    out.push({ month: label, year: d.getFullYear(), count: map.get(key) ?? 0 });
  }
  return out;
}

/**
 * Top actors by appearance count, derived from the `castList` array
 * on each vault item.
 */
export function getTopActors(list: WatchlistItem[], limit = 5): PersonCount[] {
  const map = new Map<string, number>();
  list.forEach((m) => {
    if (!Array.isArray(m.castList)) return;
    m.castList.forEach((name) => {
      if (!name || typeof name !== "string") return;
      const trimmed = name.trim();
      if (!trimmed) return;
      map.set(trimmed, (map.get(trimmed) ?? 0) + 1);
    });
  });
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Top directors by count. The vault item carries `director` as a
 * single string (e.g. "Christopher Nolan") so we aggregate by exact
 * match after trim.
 */
export function getTopDirectors(list: WatchlistItem[], limit = 5): PersonCount[] {
  const map = new Map<string, number>();
  list.forEach((m) => {
    if (!m.director || typeof m.director !== "string") return;
    const trimmed = m.director.trim();
    if (!trimmed) return;
    map.set(trimmed, (map.get(trimmed) ?? 0) + 1);
  });
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * The user's top-rated titles (rating desc).
 */
export function getHighestRated(list: WatchlistItem[], limit = 5): HighestRatedItem[] {
  return list
    .filter((m) => typeof m.rating === "number" && (m.rating ?? 0) > 0)
    .map((m) => {
      const year = safeYearFromDate(m.release_date ?? m.first_air_date);
      return {
        title: itemTitle(m),
        year,
        poster: m.poster_path ?? null,
        userRating: m.rating as number,
        item: m,
      };
    })
    .sort((a, b) => b.userRating - a.userRating)
    .slice(0, limit);
}

/**
 * Average completions per day / week / month over the last 90 days.
 * Returns 0 for all fields when the user has no completed titles.
 */
export function getWatchPace(list: WatchlistItem[]): WatchPace {
  const completed = list.filter((m) => m.status === "Completed");
  if (completed.length === 0) {
    return { daily: 0, weekly: 0, monthly: 0 };
  }
  const dates: Date[] = [];
  completed.forEach((m) => {
    const dateStr = m.watchDate ?? (typeof m.addedAt === "string" ? m.addedAt : null);
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) dates.push(d);
  });
  if (dates.length === 0) return { daily: 0, weekly: 0, monthly: 0 };

  // Compute over the last 90 days for a stable pace signal.
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const recent = dates.filter((d) => d >= ninetyDaysAgo);
  const total = recent.length;
  const days = 90;
  return {
    daily: Math.round((total / days) * 100) / 100,
    weekly: Math.round((total / (days / 7)) * 100) / 100,
    monthly: Math.round((total / (days / 30)) * 100) / 100,
  };
}

/**
 * Movies vs Series split with percentages.
 */
export function getMovieSeriesSplit(list: WatchlistItem[]): MovieSeriesSplit {
  const movies = list.filter((m) => m.media_type === "movie").length;
  const series = list.filter((m) => m.media_type === "tv").length;
  const total = movies + series;
  return {
    movies,
    series,
    moviePercentage: total > 0 ? Math.round((movies / total) * 100) : 0,
    seriesPercentage: total > 0 ? Math.round((series / total) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Convenience: compute everything in one pass.
// ---------------------------------------------------------------------------

export interface AllStats {
  overview: OverviewStats;
  genres: GenreCount[];
  decades: DecadeCount[];
  ratings: RatingBucket[];
  monthly: MonthBucket[];
  actors: PersonCount[];
  directors: PersonCount[];
  highestRated: HighestRatedItem[];
  pace: WatchPace;
  split: MovieSeriesSplit;
}

export function getStatsData(list: WatchlistItem[]): AllStats {
  return {
    overview: getOverviewStats(list),
    genres: getGenreBreakdown(list),
    decades: getDecadeBreakdown(list),
    ratings: getRatingsDistribution(list),
    monthly: getMonthlyActivity(list),
    actors: getTopActors(list),
    directors: getTopDirectors(list),
    highestRated: getHighestRated(list),
    pace: getWatchPace(list),
    split: getMovieSeriesSplit(list),
  };
}
