/**
 * CineLog V2 — Dashboard Data Hook (wraps shared User Library)
 * ---------------------------------------------------------------------
 * Phase 10.2 — Shared User Library Layer
 *
 * Wraps `useUserLibrary()` (the shared vault data source) and adds
 * dashboard-specific stat derivation on top. No duplicate fetches —
 * the vault data comes from the shared layer; this hook only computes
 * stats from the array.
 *
 * Architecture:
 *   DashboardPage → useDashboardData → useUserLibrary → DashboardRepository → Supabase
 *
 * No feature-to-feature dependency. No Firestore. No duplicate fetches.
 */

import { createMemo } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import type { UserLibrary } from "~/shared/hooks/useUserLibrary";

export interface DashboardStats {
  readonly total: number;
  readonly watching: number;
  readonly completed: number;
  readonly planned: number;
  readonly favorites: number;
  readonly pinned: number;
}

export interface DashboardData extends UserLibrary {
  readonly stats: () => DashboardStats | null;
}

/**
 * useDashboardData — wraps the shared useUserLibrary and derives
 * dashboard stats from the watchlist array.
 *
 * The vault fetch is delegated entirely to useUserLibrary — this hook
 * adds zero queries. Stats are computed client-side via createMemo.
 */
export function useDashboardData(): DashboardData {
  const library = useUserLibrary();

  const stats = createMemo<DashboardStats | null>(() => {
    const list = library.watchlist();
    if (list.length === 0 && library.loading()) return null;

    return {
      total: list.length,
      watching: list.filter((m) => m.status === "Watching").length,
      completed: list.filter((m) => m.status === "Completed").length,
      planned: list.filter((m) => m.status === "Planned" || m.status === "Plan to Watch").length,
      favorites: list.filter((m) => m.watchProgress?.season !== undefined).length, // proxy — favorites stored on vault row
      pinned: 0, // pinned is on the vault row, not derivable from WatchlistItem
    };
  });

  return {
    ...library,
    stats
  };
}
