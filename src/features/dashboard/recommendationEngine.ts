// src/features/dashboard/recommendationEngine.ts
import type { WatchlistItem } from "~/shared/types";
import {getContinueWatchingList} from "~/shared/utils/progress";

export interface RecommendationResult {
  item: WatchlistItem | null;
  badge: string;
  isResume: boolean;
  canShuffle: boolean;
  /** Context label for the hero — drives the "what should I watch today?" answer */
  context: "continue" | "tonight" | "history" | "empty" | "guest";
}

const getAddedAtTime = (date: WatchlistItem["addedAt"]): number => {
  if (!date) return 0;
  if (date instanceof Date) return date.getTime();
  if (typeof date === "string") return new Date(date).getTime();
  if (typeof date === "object" && date.seconds) return date.seconds * 1000;
  return 0;
};

/**
 * pickContinueWatching — the most recently watched Watching title.
 *
 * Uses the shared progress engine (isWatchable gate). Only status === "Watching"
 * titles are considered — no legacy V1 progress data can leak in.
 */
export function pickContinueWatching(watchlist: WatchlistItem[]): WatchlistItem | null {
  return getContinueWatchingList(watchlist)[0] || null;
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

export function pickRandomFeatured(
  watchlist: WatchlistItem[],
  excludeId: string | null,
  seed: number
): WatchlistItem | null {
  if (watchlist.length === 0) return null;

  const isArchived = (m: WatchlistItem) => (m.status as string) === "Archived";
  const notExcluded = (m: WatchlistItem) => (excludeId ? m.id !== excludeId : true);

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

  let pool: WatchlistItem[];

  if (planned.length > 0) {
    pool = planned;
  } else if (watching.length > 0) {
    pool = watching;
  } else if (completed.length > 0) {
    pool = completed;
  } else {
    pool = watchlist.filter((m) => !isArchived(m));
    if (pool.length === 0) return null;
  }

  const idx = Math.abs(seed | 0) % pool.length;
  return pool[idx];
}

/**
 * Context-Aware Hero Recommendation.
 *
 * 1. CONTINUE — most recently watched Watching title (isWatchable gate)
 * 2. TONIGHT — random planned title
 * 3. HISTORY — fallback to completed
 * 4. EMPTY
 */
export function getRecommendation(
  watchlist: WatchlistItem[],
  excludeId: string | null,
  seed: number
): RecommendationResult {
  if (watchlist.length === 0) {
    return { item: null, badge: "", isResume: false, canShuffle: false, context: "empty" };
  }

  // 1. CONTINUE — most recently watched Watching title
  const continueItem = pickContinueWatching(watchlist);
  if (continueItem) {
    return {
      item: continueItem,
      badge: "CONTINUE WATCHING",
      isResume: true,
      canShuffle: false,
      context: "continue"
    };
  }

  // 2. TONIGHT — random planned pick
  const plannedItem = pickRandomFeatured(watchlist, excludeId, seed);
  if (plannedItem && (plannedItem.status === "Planned" || plannedItem.status === "Plan to Watch")) {
    return {
      item: plannedItem,
      badge: "TONIGHT'S PICK",
      isResume: false,
      canShuffle: watchlist.length > 1,
      context: "tonight"
    };
  }

  // 3. HISTORY — fallback
  if (plannedItem) {
    const s = plannedItem.status;
    return {
      item: plannedItem,
      badge: s === "Watching" ? "NOW WATCHING" : "FROM YOUR HISTORY",
      isResume: false,
      canShuffle: watchlist.length > 1,
      context: s === "Watching" ? "tonight" : "history"
    };
  }

  return { item: null, badge: "", isResume: false, canShuffle: false, context: "empty" };
}
