// src/shared/utils/progress.ts
import type { WatchlistItem, TMDBDetails, CachedSeasonInfo } from "~/shared/types";

/**
 * CineLog V2 Progress Engine — the SINGLE source of truth for all progress.
 *
 * ARCHITECTURE:
 *   Status is the source of truth. Only titles with status === "Watching"
 *   may participate in the progress system. Planned and Completed titles
 *   are NEVER considered "in progress" regardless of legacy watchProgress data.
 *
 *   Progress is calculated from the manual tracker (season/episode) only.
 *   No currentTime, no streaming playback percentage, no legacy logic.
 *
 *   *** SERIES-WIDE PROGRESS ***
 *   The percentage represents overall SERIES completion, never per-season:
 *
 *       completedEpisodesAcrossAllSeasons
 *       ----------------------------------
 *       totalEpisodesAcrossAllSeasons
 *
 *   Example (House of the Dragon):
 *     S1 = 10 eps, S2 = 8 eps, S3 = 8 eps → total = 26
 *     User is on S3 E1 → completed = 10 + 8 + 1 = 19
 *     pct = 19 / 26 = 73%  (rounded)
 *
 *   The SAME value is returned everywhere — Dashboard Hero, Continue
 *   Watching, Vault, Details page, Stats, every progress bar. There is
 *   no other formula anywhere in the codebase. If you need a percentage,
 *   call `getEpisodeProgress()`.
 *
 * SEASON DATA SOURCES (in priority order):
 *   1. `m.seasons` — cached on the WatchlistItem by the Details modal.
 *      Available everywhere; no fetch needed.
 *   2. `details.seasons` — passed in by callers that have TMDB details
 *      (currently only the Details modal / EpisodeTracker).
 *   3. `m.totalEps` (legacy) — treated as season 1's episode count.
 *      Used only for items cached before the `seasons` field existed.
 *   4. `[]` (empty) — no data; progress returns pct=0 with a label only.
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
 *   // Progress — single source of truth for percentages everywhere
 *   const progress = getEpisodeProgress(item, tmdbDetails);
 *   // → { pct: 73, season: 3, episode: 1, totalEps: 8, totalSeasons: 3,
 *   //    seriesTotalEps: 26, seriesCompletedEps: 19, isAtEnd: false,
 *   //    label: "S3 E1 / 8", seriesLabel: "19 / 26 eps" }
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
  /** 0-100 percentage — SERIES-WIDE completion, same value everywhere */
  pct: number;
  /** Current season number */
  season: number;
  /** Current episode number */
  episode: number;
  /** Total episodes in CURRENT season (0 if unknown) */
  totalEps: number;
  /** Total seasons (0 if unknown) */
  totalSeasons: number;
  /** Total episodes across every season of the series */
  seriesTotalEps: number;
  /** Completed episodes across every season (sum of full seasons before current + current episode) */
  seriesCompletedEps: number;
  /** True if user is on the last episode of the last season */
  isAtEnd: boolean;
  /** Human-readable per-season label (e.g. "S3 E1 / 8") */
  label: string;
  /** Human-readable series-wide label (e.g. "19 / 26 eps") */
  seriesLabel: string;
}

/**
 * resolveSeasons — produce a normalized season list (number>0, sorted asc)
 * from any of the supported sources. Returns [] if no data is available.
 *
 * This is the ONE function every consumer routes through. It encodes the
 * fallback chain: cached `m.seasons` → `details.seasons` → legacy `m.totalEps`.
 *
 * The legacy `m.totalEps` fallback is ONLY used when the user is on
 * season 1 — otherwise we can't infer per-season counts from a single
 * number, and progress would be misleading. In that case we return []
 * and the engine reports pct=0 with just an S/E label.
 */
export function resolveSeasons(
  m: WatchlistItem,
  details?: TMDBDetails | null
): CachedSeasonInfo[] {
  // 1. Cached on the item — preferred (no fetch needed)
  if (m.seasons && m.seasons.length > 0) {
    return m.seasons
      .filter((s) => s.number > 0 && s.count > 0)
      .sort((a, b) => a.number - b.number);
  }

  // 2. TMDB details passed in by the caller (Details modal / EpisodeTracker)
  if (details?.seasons && details.seasons.length > 0) {
    return details.seasons
      .filter((s) => s.season_number > 0 && s.episode_count > 0)
      .map((s) => ({ number: s.season_number, count: s.episode_count }))
      .sort((a, b) => a.number - b.number);
  }

  // 3. Legacy `totalEps` — only meaningful when the user is on season 1
  //    (we can't infer per-season counts from a single number). Treat it
  //    as season 1's episode count. For season > 1, return [] so the
  //    engine shows pct=0 rather than a misleading 100%.
  const currentSeason = m.season || 1;
  if (currentSeason === 1 && m.totalEps && m.totalEps > 0) {
    return [{ number: 1, count: m.totalEps }];
  }

  return [];
}

/**
 * getEpisodeProgress — the SINGLE source of truth for progress percentage.
 *
 * Computes SERIES-WIDE completion:
 *
 *   completedEpisodes = sum(season.count for seasons < current) + current episode
 *   totalEpisodes     = sum(season.count for all seasons)
 *   pct               = round(completedEpisodes / totalEpisodes * 100)
 *
 * For movies (no seasons/episodes), returns null — movies don't have
 * episode-based progress; they're either Watching or Completed.
 *
 * Returns null when:
 *   - item is null/undefined
 *   - item is not watchable (status !== "Watching")
 *   - media_type !== "tv" (movies)
 *
 * The returned `pct` is the SAME value used by Dashboard Hero, Continue
 * Watching rail, Vault, Details page EpisodeTracker, Stats, and every
 * progress bar. There is no other formula anywhere.
 */
export function getEpisodeProgress(
  m: WatchlistItem | null | undefined,
  details?: TMDBDetails | null
): EpisodeProgress | null {
  if (!m || !isWatchable(m)) return null;
  if (m.media_type !== "tv") return null;

  const season = m.season || 1;
  const episode = m.episode || 1;
  const seasonList = resolveSeasons(m, details);

  // No season data at all — show a 0% with just the S/E label
  if (seasonList.length === 0) {
    return {
      pct: 0,
      season,
      episode,
      totalEps: 0,
      totalSeasons: 1,
      seriesTotalEps: 0,
      seriesCompletedEps: 0,
      isAtEnd: false,
      label: `S${season} E${episode}`,
      seriesLabel: "—"
    };
  }

  // Total seasons = highest season number in the list
  const totalSeasons = seasonList[seasonList.length - 1].number;

  // Current season's episode count (0 if the user is somehow past the last cached season)
  const currentSeasonData = seasonList.find((s) => s.number === season);
  const totalEps = currentSeasonData?.count || 0;

  // SERIES TOTAL = sum of every season's episode count
  const seriesTotalEps = seasonList.reduce((sum, s) => sum + s.count, 0);

  // SERIES COMPLETED = full count of every season before current + current episode
  //   (clamp current episode to the season's count to avoid >100% if data drifts)
  const seriesCompletedEps = seasonList.reduce((sum, s) => {
    if (s.number < season) return sum + s.count;
    if (s.number === season) return sum + Math.min(episode, s.count);
    return sum;
  }, 0);

  // SERIES-WIDE percentage — the ONE number every consumer uses
  const pct = seriesTotalEps > 0
    ? Math.min(100, Math.max(0, (seriesCompletedEps / seriesTotalEps) * 100))
    : 0;

  // "At end" = on the last episode of the last season
  const lastSeason = seasonList[seasonList.length - 1];
  const isAtEnd =
    lastSeason.count > 0 &&
    season === lastSeason.number &&
    episode >= lastSeason.count;

  // Labels
  const label = totalEps > 0
    ? `S${season} E${episode} / ${totalEps}`
    : `S${season} E${episode}`;
  const seriesLabel = `${seriesCompletedEps} / ${seriesTotalEps} eps`;

  return {
    pct: Math.round(pct),
    season,
    episode,
    totalEps,
    totalSeasons,
    seriesTotalEps,
    seriesCompletedEps,
    isAtEnd,
    label,
    seriesLabel
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
