/**
 * CineLog V2 — Dashboard Adapter
 * ---------------------------------------------------------------------
 * Phase 9 — Dashboard Migration
 *
 * Bridges the DashboardRepository's typed results to the Dashboard UI's
 * needs. The DashboardRepository returns `VaultRow` (snake_case) and
 * `DashboardStats` (aggregated counts); the UI expects `WatchlistItem`
 * (camelCase) and stat numbers. This adapter does the mapping.
 *
 * Architecture:
 *   UI → useDashboardData → dashboardAdapter → DashboardRepository → Supabase
 */

import type { VaultRow, DashboardStats, ContinueWatchingItem } from "~/lib/supabase/repositories";
import type { WatchlistItem } from "~/shared/types";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { getDashboardRepository } from "~/lib/supabase/repositories";

// ---------------------------------------------------------------------------
// Status mapping (reused from vaultAdapter — same Title Case ↔ lowercase)
// ---------------------------------------------------------------------------

const STATUS_TO_UI: Record<string, WatchlistItem["status"]> = {
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  on_hold: "Plan to Watch",
  dropped: "Plan to Watch"
};

// ---------------------------------------------------------------------------
// Row → WatchlistItem mapping (lighter than vaultAdapter — no episode enrichment)
// ---------------------------------------------------------------------------

/**
 * Map a Supabase `VaultRow` to a `WatchlistItem` for Dashboard display.
 *
 * This is a LIGHT mapping — it doesn't include episode progress (the
 * Dashboard doesn't need per-episode data; the ContinueRail uses the
 * `watchProgress` field from the vault read path). For the full mapping
 * with episode enrichment, see `vaultAdapter.vaultRowToWatchlistItem`.
 */
export function vaultRowToDashboardItem(row: VaultRow): WatchlistItem {
  return {
    id: String(row.tmdb_id),
    media_type: row.media_type,
    status: STATUS_TO_UI[row.status] ?? "Planned",
    rating: row.rating ?? undefined,
    notes: row.notes ?? undefined,
    watchDate: row.watched_on ?? undefined,
    addedAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// ContinueWatchingItem → WatchlistItem (with progress data)
// ---------------------------------------------------------------------------

/**
 * Map a `ContinueWatchingItem` (vault row + latest episode progress) to
 * a `WatchlistItem` with `season`, `episode`, and `watchProgress` populated.
 *
 * Used by the Continue Watching shelf to show progress bars.
 */
export function continueWatchingToWatchlistItem(item: ContinueWatchingItem): WatchlistItem {
  const base = vaultRowToDashboardItem(item.vault);
  if (!item.latestProgress) return base;

  return {
    ...base,
    season: item.latestProgress.season_number,
    episode: item.latestProgress.episode_number,
    watchProgress: {
      currentTime: 0,
      duration: 0,
      server: null,
      updatedAt: item.latestProgress.watched_at ?? item.latestProgress.updated_at,
      season: item.latestProgress.season_number,
      episode: item.latestProgress.episode_number
    }
  };
}

// ---------------------------------------------------------------------------
// DashboardStats → UI stat shape
// ---------------------------------------------------------------------------

/**
 * UI-facing dashboard stats — flat shape for easy rendering in StatCards.
 */
export interface DashboardStatValues {
  readonly total: number;
  readonly watching: number;
  readonly completed: number;
  readonly planned: number;
  readonly favorites: number;
  readonly pinned: number;
  readonly collectionCount: number;
}

/**
 * Map `DashboardStats` (from DashboardRepository) to the flat
 * `DashboardStatValues` shape the UI uses for StatCards.
 */
export function dashboardStatsToUI(stats: DashboardStats): DashboardStatValues {
  return {
    total: stats.vault.total,
    watching: stats.vault.byStatus.watching,
    completed: stats.vault.byStatus.completed,
    planned: stats.vault.byStatus.planned,
    favorites: stats.vault.favorites,
    pinned: stats.vault.pinned,
    collectionCount: stats.collections.total
  };
}

// ---------------------------------------------------------------------------
// Fetch helpers (all via DashboardRepository — no Firestore)
// ---------------------------------------------------------------------------

/**
 * Fetch all Dashboard shelves + stats in one call.
 * Returns the data the Dashboard page needs to render.
 */
export async function fetchDashboardData(userId: string): Promise<{
  stats: DashboardStatValues | null;
  continueWatching: WatchlistItem[];
  recentlyAdded: WatchlistItem[];
  recentlyUpdated: WatchlistItem[];
  favorites: WatchlistItem[];
  watchingNow: WatchlistItem[];
  completedRecently: WatchlistItem[];
}> {
  const repo = getDashboardRepository();

  // Fetch stats + shelves in parallel
  const [statsResult, continueResult, recentResult, updatedResult, favResult, watchingResult, completedResult] =
    await Promise.all([
      repo.getDashboardStats(userId),
      repo.getContinueWatching(userId, { limit: 10 }),
      repo.getRecentlyAdded(userId, { limit: 12 }),
      repo.getRecentlyUpdated(userId, { limit: 12 }),
      repo.getFavorites(userId, { limit: 12 }),
      repo.getWatchingNow(userId, { limit: 12 }),
      repo.getCompletedRecently(userId, { limit: 12 })
    ]);

  return {
    stats: statsResult.data ? dashboardStatsToUI(statsResult.data) : null,
    continueWatching: continueResult.data.map(continueWatchingToWatchlistItem),
    recentlyAdded: recentResult.data.map(vaultRowToDashboardItem),
    recentlyUpdated: updatedResult.data.map(vaultRowToDashboardItem),
    favorites: favResult.data.map(vaultRowToDashboardItem),
    watchingNow: watchingResult.data.map(vaultRowToDashboardItem),
    completedRecently: completedResult.data.map(vaultRowToDashboardItem)
  };
}

/**
 * Get the current user's uid for Dashboard queries.
 * Returns null if not signed in.
 */
export function getDashboardUserId(): string | null {
  return getCurrentUid();
}
