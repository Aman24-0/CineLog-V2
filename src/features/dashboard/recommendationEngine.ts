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

export function getRecommendation(
  watchlist: WatchlistItem[],
  forcedPlannedId: string | null
): RecommendationResult {
  if (watchlist.length === 0) {
    return { item: null, badge: "", isResume: false, canShuffle: false };
  }

  const plannedList = watchlist.filter(
    (m) => m.status === "Planned" || m.status === "Plan to Watch"
  );
  const canShuffle = plannedList.length > 0;

  // 1. Continue Watching
  const continueWatchingItem = pickContinueWatching(watchlist);
  if (continueWatchingItem) {
    return {
      item: continueWatchingItem,
      badge: "CONTINUE WATCHING",
      isResume: true,
      canShuffle: false // Hide shuffle during Continue Watching
    };
  }

  // 2. Random Planned Pick
  if (plannedList.length > 0) {
    const plannedItem = pickRandomPlanned(watchlist, forcedPlannedId);
    if (plannedItem) {
      return {
        item: plannedItem,
        badge: "RECOMMENDED",
        isResume: false,
        canShuffle
      };
    }
  }

  // 3. Highest Rated
  const highestRated = pickHighestRated(watchlist);
  if (highestRated) {
    return {
      item: highestRated,
      badge: "RECOMMENDED",
      isResume: false,
      canShuffle: false
    };
  }

  // 4. Recently Added
  const recentlyAdded = pickRecentlyAdded(watchlist);
  return {
    item: recentlyAdded,
    badge: "RECENTLY ADDED",
    isResume: false,
    canShuffle: false
  };
}
