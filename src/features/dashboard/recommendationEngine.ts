// src/features/dashboard/recommendationEngine.ts
import type { WatchlistItem } from "~/shared/types";

export interface RecommendationResult {
  item: WatchlistItem | null;
  badge: string;
  isResume: boolean;
  canShuffle: boolean;
}

const getAddedAtTime = (date: WatchlistItem["addedAt"]): number => {
  if (!date) return 0;
  if (date instanceof Date) return date.getTime();
  if (typeof date === "string") return new Date(date).getTime();
  if (typeof date === "object" && date.seconds) return date.seconds * 1000;
  return 0;
};

export function pickContinueWatching(watchlist: WatchlistItem[]): WatchlistItem | null {
  const continueWatching = watchlist
    .filter(
      (m) =>
        m.watchProgress &&
        m.watchProgress.currentTime > 0 &&
        m.status !== "Completed"
    )
    .sort((a, b) => {
      const tA = a.watchProgress?.updatedAt ? new Date(a.watchProgress.updatedAt).getTime() : 0;
      const tB = b.watchProgress?.updatedAt ? new Date(b.watchProgress.updatedAt).getTime() : 0;
      return tB - tA;
    });
  return continueWatching[0] || null;
}

export function pickRandomPlanned(watchlist: WatchlistItem[], forcedPlannedId: string | null): WatchlistItem | null {
  const plannedList = watchlist.filter(
    (m) => m.status === "Planned" || m.status === "Plan to Watch"
  );
  if (plannedList.length === 0) return null;
  
  if (forcedPlannedId) {
    const forced = plannedList.find((m) => m.id === forcedPlannedId);
    if (forced) return forced;
  }
  
  // Fallback to first planned if no forced ID
  return plannedList[0];
}

export function pickHighestRated(watchlist: WatchlistItem[]): WatchlistItem | null {
  const rated = watchlist
    .filter((m) => m.status !== "Completed")
    .sort((a, b) => {
      const imdbA = parseFloat(a.imdbRating || "0") || 0;
      const imdbB = parseFloat(b.imdbRating || "0") || 0;
      if (imdbB !== imdbA) return imdbB - imdbA;
      
      const userA = a.rating || 0;
      const userB = b.rating || 0;
      return userB - userA;
    });
  return rated[0] || null;
}

export function pickRecentlyAdded(watchlist: WatchlistItem[]): WatchlistItem | null {
  const recentlyAdded = [...watchlist].sort(
    (a, b) => getAddedAtTime(b.addedAt) - getAddedAtTime(a.addedAt)
  );
  return recentlyAdded[0] || watchlist[0] || null;
}

/**
 * Random Featured Pick for the Hero banner.
 *
 * Priority order (per Phase 2.1 Sprint 2 spec):
 *   1. Planned  (status === "Planned" || "Plan to Watch")
 *   2. Watching (status === "Watching")
 *   3. Completed (only if no Planned or Watching items exist)
 *
 * Do NOT randomly suggest Completed content by default — Completed items
 * are only used as a last-resort fallback so the hero is never empty on a
 * vault that contains only completed titles.
 *
 * Behavior:
 *  - Excludes the previously shown hero (`excludeId`) so shuffle never repeats.
 *  - Deterministic given (watchlist, excludeId, seed) — this lets createMemo
 *    recompute safely on Firestore snapshots without re-rolling the pick.
 *    The seed is bumped explicitly by the user (shuffle button) or randomized
 *    once per fresh app load (see DashboardPage onMount).
 *  - Excludes any item whose status is "Archived" (defensive — type currently
 *    has no Archived status, but this guards against future soft-delete flags).
 */
export function pickRandomFeatured(
  watchlist: WatchlistItem[],
  excludeId: string | null,
  seed: number
): WatchlistItem | null {
  if (watchlist.length === 0) return null;

  const isArchived = (m: WatchlistItem) => (m.status as string) === "Archived";
  const notExcluded = (m: WatchlistItem) => (excludeId ? m.id !== excludeId : true);

  // Build priority pools
  const planned = watchlist.filter(
    (m) => !isArchived(m) && notExcluded(m) &&
      (m.status === "Planned" || m.status === "Plan to Watch")
  );
  const watching = watchlist.filter(
    (m) => !isArchived(m) && notExcluded(m) && m.status === "Watching"
  );
  const completed = watchlist.filter(
    (m) => !isArchived(m) && notExcluded(m) && m.status === "Completed"
  );

  // Priority: Planned → Watching → Completed (fallback only)
  let pool: WatchlistItem[];

  if (planned.length > 0) {
    pool = planned;
  } else if (watching.length > 0) {
    pool = watching;
  } else if (completed.length > 0) {
    pool = completed;
  } else {
    // All items excluded (e.g. single-item vault + excludeId set) — fall back
    // to the full list so the hero is never empty.
    pool = watchlist.filter((m) => !isArchived(m));
    if (pool.length === 0) return null;
  }

  const idx = Math.abs(seed | 0) % pool.length;
  return pool[idx];
}

export function getRecommendation(
  watchlist: WatchlistItem[],
  excludeId: string | null,
  seed: number
): RecommendationResult {
  if (watchlist.length === 0) {
    return { item: null, badge: "", isResume: false, canShuffle: false };
  }

  const item = pickRandomFeatured(watchlist, excludeId, seed);

  // Determine badge based on the picked item's status (mirrors priority logic)
  const badge = (() => {
    if (!item) return "";
    const s = item.status;
    if (s === "Planned" || s === "Plan to Watch") return "FEATURED PICK";
    if (s === "Watching") return "NOW WATCHING";
    if (s === "Completed") return "FROM YOUR HISTORY";
    return "FEATURED PICK";
  })();

  return {
    item,
    badge,
    isResume: false, // Continue Watching is a separate section
    canShuffle: watchlist.length > 1
  };
}
