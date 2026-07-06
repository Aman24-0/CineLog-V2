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
 * Behavior:
 *  - Picks a random movie or series from the entire Vault.
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

  // Defensive: filter out any future "Archived" soft-delete flag without
  // narrowing the literal union type today. Cast through string so TS allows
  // the comparison even though "Archived" isn't in the current union.
  const isArchived = (m: WatchlistItem) => (m.status as string) === "Archived";

  const eligible = watchlist.filter(
    (m) => !isArchived(m) && (excludeId ? m.id !== excludeId : true)
  );

  // If exclusion empties the pool (single-item vault), fall back to full list.
  const pool = eligible.length > 0 ? eligible : watchlist;

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

  return {
    item,
    badge: item ? "FEATURED PICK" : "",
    isResume: false, // Continue Watching is now a separate section
    canShuffle: watchlist.length > 1
  };
}
