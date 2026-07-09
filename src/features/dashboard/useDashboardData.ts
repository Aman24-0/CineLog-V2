/**
 * CineLog V2 — Dashboard Data Hook (Single Source)
 * ---------------------------------------------------------------------
 * Phase 9.1 — Dashboard Architecture Polish
 *
 * The SOLE data source for the Dashboard page. Fetches ALL dashboard
 * data from the DashboardRepository in a single batch, then exposes
 * the watchlist array, stats, loading, isGuest, and refresh.
 *
 * Architecture:
 *   DashboardPage → useDashboardData → dashboardAdapter → DashboardRepository → Supabase
 *
 * No useVault(). No VaultRepository. No duplicate fetches.
 */

import { createSignal, onMount, onCleanup } from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import { fetchDashboardData, getDashboardUserId } from "./dashboardAdapter";
import type { DashboardDataPayload } from "./dashboardAdapter";
import type { WatchlistItem } from "~/shared/types";

export interface DashboardData {
  readonly watchlist: () => WatchlistItem[];
  readonly stats: () => DashboardDataPayload["stats"] | null;
  readonly loading: () => boolean;
  readonly isGuest: () => boolean;
  readonly error: () => string | null;
  readonly refresh: () => Promise<void>;
}

/**
 * useDashboardData — the SINGLE data source for the Dashboard.
 *
 * Fetches all vault items + episode progress from the DashboardRepository
 * in one batch. Derives shelves, stats, and the recommendation pool from
 * that single fetch. Re-fetches on auth state change.
 *
 * Replaces the previous mixed-source architecture (useVault + useDashboardData).
 */
export function useDashboardData(): DashboardData {
  const [watchlist, setWatchlist] = createSignal<WatchlistItem[]>([]);
  const [stats, setStats] = createSignal<DashboardDataPayload["stats"] | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [isGuest, setIsGuest] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  let unsubAuth: (() => void) | null = null;

  const doFetch = async () => {
    const userId = getDashboardUserId();
    if (!userId) {
      setWatchlist([]);
      setStats(null);
      setIsGuest(true);
      setLoading(false);
      return;
    }

    setIsGuest(false);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardData(userId);
      setWatchlist(data.watchlist);
      setStats(data.stats);
      setLoading(false);
    } catch (err) {
      console.error("[useDashboardData] Fetch error:", err);
      setError("Failed to load dashboard data.");
      setLoading(false);
    }
  };

  onMount(() => {
    doFetch();
    const subscription = onSessionChange(() => {
      doFetch();
    });
    unsubAuth = () => subscription.unsubscribe();
  });

  onCleanup(() => {
    if (unsubAuth) unsubAuth();
  });

  return {
    watchlist,
    stats,
    loading,
    isGuest,
    error,
    refresh: doFetch
  };
}
