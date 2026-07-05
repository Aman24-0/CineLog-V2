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

export function getRecommendation(
  watchlist: WatchlistItem[],
  shuffleTick: number
): RecommendationResult {
  if (watchlist.length === 0) {
    return { item: null, badge: "", isResume: false, canShuffle: false };
  }

  // 1. Continue Watching
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

  const plannedList = watchlist.filter(
    (m) => m.status === "Planned" || m.status === "Plan to Watch"
  );

  const canShuffle = plannedList.length > 0;

  // If user clicked shuffle, force pick from planned list
  if (shuffleTick > 0 && plannedList.length > 0) {
    // Use tick to pseudo-randomly select, avoiding immediate repeats if > 1 item
    const index = plannedList.length > 1 ? shuffleTick % plannedList.length : 0;
    return {
      item: plannedList[index],
      badge: "PICK FOR TONIGHT",
      isResume: false,
      canShuffle
    };
  }

  if (continueWatching.length > 0) {
    return {
      item: continueWatching[0],
      badge: "CONTINUE WATCHING",
      isResume: true,
      canShuffle
    };
  }

  if (plannedList.length > 0) {
    // Initial random pick on load
    const index = Math.floor(Math.random() * plannedList.length);
    return {
      item: plannedList[index],
      badge: "RECOMMENDED",
      isResume: false,
      canShuffle
    };
  }

  // 3. Highly Rated Unwatched
  const highlyRated = watchlist
    .filter((m) => m.status !== "Completed" && (m.rating || 0) > 0)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));

  if (highlyRated.length > 0) {
    return {
      item: highlyRated[0],
      badge: "RECOMMENDED",
      isResume: false,
      canShuffle: false
    };
  }

  // 4. Recently Added
  const recentlyAdded = [...watchlist].sort(
    (a, b) => getAddedAtTime(b.addedAt) - getAddedAtTime(a.addedAt)
  );

  return {
    item: recentlyAdded[0] || watchlist[0],
    badge: "RECENTLY ADDED",
    isResume: false,
    canShuffle: false
  };
}
