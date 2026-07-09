/**
 * CineLog V2 — Dashboard Adapter (Single Source)
 * ---------------------------------------------------------------------
 * Phase 9.1 — Dashboard Architecture Polish
 *
 * The SOLE bridge between the DashboardRepository and the Dashboard UI.
 * Fetches ALL vault items in ONE query + batch episode progress, then
 * derives shelves, stats, and the recommendation pool from that single
 * fetch. No useVault(). No duplicate fetches. One source of truth.
 *
 * Architecture:
 *   DashboardPage → useDashboardData → dashboardAdapter → DashboardRepository → Supabase
 */

import { getDashboardRepository } from "~/lib/supabase/repositories";
import { getEpisodeProgressRepository } from "~/lib/supabase/repositories";
import type { VaultRow, EpisodeProgressRow } from "~/lib/supabase/repositories";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import type { WatchlistItem, WatchProgress } from "~/shared/types";

// ---------------------------------------------------------------------------
// Status mapping (lowercase enum → Title Case)
// ---------------------------------------------------------------------------

const STATUS_TO_UI: Record<string, WatchlistItem["status"]> = {
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  on_hold: "Plan to Watch",
  dropped: "Plan to Watch"
};

// ---------------------------------------------------------------------------
// VaultRow → WatchlistItem (with optional episode progress enrichment)
// ---------------------------------------------------------------------------

/**
 * Map a single VaultRow to a WatchlistItem. If episode progress is
 * provided, populates season/episode/watchProgress.
 */
export function vaultRowToItem(
  row: VaultRow,
  progress?: EpisodeProgressRow | null
): WatchlistItem {
  const base: WatchlistItem = {
    id: String(row.tmdb_id),
    media_type: row.media_type,
    status: STATUS_TO_UI[row.status] ?? "Planned",
    rating: row.rating ?? undefined,
    notes: row.notes ?? undefined,
    watchDate: row.watched_on ?? undefined,
    addedAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (progress && row.media_type === "tv") {
    const wp: WatchProgress = {
      currentTime: 0,
      duration: 0,
      server: null,
      updatedAt: progress.watched_at ?? progress.updated_at,
      season: progress.season_number,
      episode: progress.episode_number
    };
    return { ...base, season: progress.season_number, episode: progress.episode_number, watchProgress: wp };
  }
  return base;
}

// ---------------------------------------------------------------------------
// Dashboard data shape (everything the UI needs)
// ---------------------------------------------------------------------------

export interface DashboardDataPayload {
  readonly watchlist: WatchlistItem[];
  readonly stats: {
    total: number;
    watching: number;
    completed: number;
    planned: number;
    favorites: number;
    pinned: number;
  };
  readonly isGuest: boolean;
}

// ---------------------------------------------------------------------------
// fetchDashboardData — SINGLE fetch, derive everything
// ---------------------------------------------------------------------------

/**
 * Fetch ALL dashboard data in a single batch:
 *   1. All vault items (1 query via DashboardRepository.getAllVaultItems)
 *   2. Latest episode progress for TV items (1 batch query)
 *
 * Shelves, stats, and the recommendation pool are ALL derived from
 * these two queries — no duplicate fetches, one source of truth.
 */
export async function fetchDashboardData(userId: string): Promise<DashboardDataPayload> {
  const repo = getDashboardRepository();

  // 1. Fetch all vault items (single query)
  const { data: vaultRows, error: vaultError } = await repo.getAllVaultItems(userId);
  if (vaultError) {
    console.error("[dashboardAdapter] Error fetching vault items:", vaultError);
  }

  const rows = vaultRows ?? [];

  // 2. Batch-fetch episode progress for TV items (single query)
  const tvVaultIds = rows.filter((r) => r.media_type === "tv").map((r) => r.id);
  let progressMap = new Map<string, EpisodeProgressRow>();

  if (tvVaultIds.length > 0) {
    const progressRepo = getEpisodeProgressRepository();
    const { data: pMap, error: pError } = await progressRepo.getLatestEpisodeProgressBatch(tvVaultIds);
    if (pError) {
      console.error("[dashboardAdapter] Error fetching episode progress:", pError);
    } else {
      progressMap = pMap;
    }
  }

  // 3. Map to WatchlistItem with episode progress enrichment
  const watchlist = rows.map((row) => {
    const progress = progressMap.get(row.id);
    return vaultRowToItem(row, progress);
  });

  // 4. Derive stats from the array (no separate count queries needed)
  const stats = {
    total: watchlist.length,
    watching: watchlist.filter((m) => m.status === "Watching").length,
    completed: watchlist.filter((m) => m.status === "Completed").length,
    planned: watchlist.filter((m) => m.status === "Planned" || m.status === "Plan to Watch").length,
    favorites: rows.filter((r) => r.is_favorite).length,
    pinned: rows.filter((r) => r.is_pinned).length,
  };

  return { watchlist, stats, isGuest: false };
}

/**
 * Get the current user's uid for Dashboard queries.
 * Returns null if not signed in.
 */
export function getDashboardUserId(): string | null {
  return getCurrentUid();
}
