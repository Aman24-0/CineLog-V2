/**
 * CineLog V2 — Dashboard Recommendation Adapter
 * ---------------------------------------------------------------------
 * Phase 9.1 — Dashboard Architecture Polish
 *
 * Wraps the existing `recommendationEngine.getRecommendation` so it
 * receives its input from the DashboardRepository data (via
 * useDashboardData), NOT from useVault().
 *
 * The recommendation engine is pure computation — it takes a
 * `WatchlistItem[]` and returns a `RecommendationResult`. This adapter
 * just provides the connection point: the DashboardPage passes the
 * `watchlist` from `useDashboardData()` into `getRecommendation`,
 * and the engine does the rest.
 *
 * No Firestore. No useVault. No duplicate fetches.
 */

import { getRecommendation } from "./recommendationEngine";
import type { RecommendationResult } from "./recommendationEngine";
import type { WatchlistItem } from "~/shared/types";

/**
 * Compute a dashboard recommendation from the DashboardRepository's
 * watchlist data.
 *
 * This is a thin wrapper around the existing `getRecommendation`
 * function — it accepts the same inputs and returns the same output.
 * The only difference is that the `watchlist` parameter now comes from
 * `useDashboardData()` instead of `useVault()`.
 *
 * @param watchlist  The full vault items array (from DashboardRepository).
 * @param excludeId  Optional id to exclude (for shuffle).
 * @param seed       Random seed for shuffle variety.
 * @returns RecommendationResult — { item, badge, isResume, canShuffle, context }.
 */
export function getDashboardRecommendation(
  watchlist: WatchlistItem[],
  excludeId: string | null,
  seed: number
): RecommendationResult {
  return getRecommendation(watchlist, excludeId, seed);
}

export type { RecommendationResult };
