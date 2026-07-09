/**
 * CineLog V2 — Dashboard Data Hook
 * ---------------------------------------------------------------------
 * Phase 9 — Dashboard Migration
 *
 * Fetches Dashboard data (stats + shelves) from Supabase via the
 * DashboardRepository. Re-fetches when the user changes or when
 * `refresh()` is called.
 *
 * Architecture:
 *   DashboardPage → useDashboardData → dashboardAdapter → DashboardRepository → Supabase
 *
 * The hook does NOT replace `useVault` — the Dashboard still uses
 * `useVault()` for the recommendation engine (which needs the full
 * watchlist array). This hook provides the Supabase-backed stats +
 * shelves that the DashboardRepository specializes in.
 */

import { createSignal, onMount, onCleanup } from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import { fetchDashboardData, getDashboardUserId } from "./dashboardAdapter";
import type { DashboardStatValues } from "./dashboardAdapter";
import type { WatchlistItem } from "~/shared/types";

export interface DashboardData {
  readonly stats: () => DashboardStatValues | null;
  readonly continueWatching: () => WatchlistItem[];
  readonly recentlyAdded: () => WatchlistItem[];
  readonly recentlyUpdated: () => WatchlistItem[];
  readonly favorites: () => WatchlistItem[];
  readonly watchingNow: () => WatchlistItem[];
  readonly completedRecently: () => WatchlistItem[];
  readonly loading: () => boolean;
  readonly error: () => string | null;
  readonly refresh: () => Promise<void>;
}

/**
 * useDashboardData — fetches Dashboard stats + shelves from Supabase.
 *
 * Subscribes to auth session changes and re-fetches on sign-in/sign-out.
 * Call `refresh()` after a vault mutation to re-fetch the latest data.
 */
export function useDashboardData(): DashboardData {
  const [stats, setStats] = createSignal<DashboardStatValues | null>(null);
  const [continueWatching, setContinueWatching] = createSignal<WatchlistItem[]>([]);
  const [recentlyAdded, setRecentlyAdded] = createSignal<WatchlistItem[]>([]);
  const [recentlyUpdated, setRecentlyUpdated] = createSignal<WatchlistItem[]>([]);
  const [favorites, setFavorites] = createSignal<WatchlistItem[]>([]);
  const [watchingNow, setWatchingNow] = createSignal<WatchlistItem[]>([]);
  const [completedRecently, setCompletedRecently] = createSignal<WatchlistItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  let unsubAuth: (() => void) | null = null;

  const doFetch = async () => {
    const userId = getDashboardUserId();
    if (!userId) {
      setStats(null);
      setContinueWatching([]);
      setRecentlyAdded([]);
      setRecentlyUpdated([]);
      setFavorites([]);
      setWatchingNow([]);
      setCompletedRecently([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardData(userId);
      setStats(data.stats);
      setContinueWatching(data.continueWatching);
      setRecentlyAdded(data.recentlyAdded);
      setRecentlyUpdated(data.recentlyUpdated);
      setFavorites(data.favorites);
      setWatchingNow(data.watchingNow);
      setCompletedRecently(data.completedRecently);
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
    stats,
    continueWatching,
    recentlyAdded,
    recentlyUpdated,
    favorites,
    watchingNow,
    completedRecently,
    loading,
    error,
    refresh: doFetch
  };
}
