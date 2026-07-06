// src/shared/utils/progress.ts
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

/**
 * CineLog V2 Progress Engine — the single source of truth for all progress.
 *
 * ARCHITECTURE:
 *   Status is the source of truth. Only titles with status === "Watching"
 *   may participate in the progress system. Planned and Completed titles
 *   are NEVER considered "in progress" regardless of legacy watchProgress data.
 *
 *   Progress is calculated from season/episode (manual tracker) only.
 *   No currentTime, no streaming playback percentage, no legacy logic.
 *
 * MIGRATION:
 *   Legacy V1 data may contain watchProgress with currentTime > 0 on Planned
 *   titles. The `isWatchable` gate ensures these are never shown as "in
 *   progress". The `useVault` hook also clears invalid watchProgress on load.
 *
 * USAGE:
 *   import { isWatchable, getContinueWatchingList, getEpisodeProgress } from "~/shared/utils/progress";
 *
 *   // Gate: only Watching titles participate
 *   if (isWatchable(item)) { ... }
 *
 *   // List: all resumable titles (Watching only)
 *   const continueList = getContinueWatchingList(watchlist);
 *
 *   // Progress: from season/episode only
 *   const progress = getEpisodeProgress(item, tmdbDetails);
 */

/**
 * isWatchable — the single gate for progress participation.
 *
 * Only titles with status === "Watching" are considered watchable.
 * This is the ONLY function that should be used to determine whether
 * a title appears in Continue Watching, In Progress shelves, Dashboard
 * stats, Resume hero, or any progress-based calculation.
 *
 * Planned, Completed, and Plan to Watch titles are NEVER watchable,
 * even if they have legacy watchProgress data.
 */
export function isWatchable(m: WatchlistItem | null | undefined): boolean {
  if (!m) return false;
  return m.status === "Watching";
}

/**
 * getContinueWatchingList — all titles the user is actively watching.
 *
 * Filters by isWatchable (status === "Watching") and sorts by
 * watchProgress.updatedAt descending (most recently watched first).
 *
 * This replaces the old logic that filtered by `watchProgress.currentTime > 0
 * && status !== "Completed"` — which incorrectly included Planned titles
 * with legacy progress data.
 */
export function getContinueWatchingList(list: WatchlistItem[]): WatchlistItem[] {
  return list
    .filter(isWatchable)
    .sort((a, b) => {
      const tA = a.watchProgress?.updatedAt ? new Date(a.watchProgress.updatedAt).getTime() : 0;
      const tB = b.watchProgress?.updatedAt ? new Date(b.watchProgress.updatedAt).getTime() : 0;
      return tB - tA;
    });
}

export interface EpisodeProgress {
  /** 0-100 percentage based on episode/season vs total episodes */
  pct: number;
  /** Current season number */
  season: number;
  /** Current episode number */
  episode: number;
  /** Total episodes in current season (0 if unknown) */
  totalEps: number;
  /** Total seasons (0 if unknown) */
  totalSeasons: number;
  /** True if user is on the last episode of the last season */
  isAtEnd: boolean;
  /** Human-readable progress label (e.g. "S1 E5 / 10") */
  label: string;
}

/**
 * getEpisodeProgress — calculate progress from the manual tracker only.
 *
 * Progress = (current episode / total episodes in season) * 100
 *
 * No currentTime, no streaming duration, no playback percentage.
 * The manual tracker (season/episode) is the single source of truth.
 *
 * For movies (no seasons/episodes), progress is 0 (movies don't have
 * episode-based progress — they're either Watching or Completed).
 */
export function getEpisodeProgress(
  m: WatchlistItem | null | undefined,
  details: TMDBDetails | null | undefined
): EpisodeProgress | null {
  if (!m || !isWatchable(m)) return null;

  const season = m.season || 1;
  const episode = m.episode || 1;

  // Get total episodes for the current season from TMDB details
  const seasonData = details?.seasons?.find((s) => s.season_number === season);
  const totalEps = seasonData?.episode_count || m.totalEps || 0;

  // Get total seasons
  const seasons = details?.seasons?.filter((s) => s.season_number > 0);
  const totalSeasons = seasons && seasons.length > 0
    ? Math.max(...seasons.map((s) => s.season_number))
    : 1;

  // Calculate percentage
  const pct = totalEps > 0
    ? Math.min(100, Math.max(0, (episode / totalEps) * 100))
    : 0;

  // Is the user at the end?
  const isAtEnd = totalEps > 0 && episode === totalEps && season === totalSeasons;

  // Human-readable label
  const label = totalEps > 0
    ? `S${season} E${episode} / ${totalEps}`
    : `S${season} E${episode}`;

  return {
    pct: Math.round(pct),
    season,
    episode,
    totalEps,
    totalSeasons,
    isAtEnd,
    label
  };
}

/**
 * getInProgressCount — count of titles actively being watched.
 *
 * Uses isWatchable gate — only status === "Watching" counts.
 */
export function getInProgressCount(list: WatchlistItem[]): number {
  return list.filter(isWatchable).length;
}
