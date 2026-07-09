/**
 * CineLog V2 — User Library Adapter (Shared)
 * ---------------------------------------------------------------------
 * Phase 10.2 — Shared User Library Layer
 *
 * The SOLE vault-fetching logic in the application. Both Dashboard and
 * Discover consume this via `useUserLibrary()`. No feature-to-feature
 * dependency. No duplicate fetches.
 *
 * Architecture:
 *   Dashboard → useUserLibrary → userLibraryAdapter → DashboardRepository → Supabase
 *   Discover  → useUserLibrary → userLibraryAdapter → DashboardRepository → Supabase
 *
 * This adapter lives in `src/shared/` (not in any feature folder) because
 * it is shared infrastructure — it loads the user's vault and enriches it
 * with episode progress. It contains NO feature-specific logic (no
 * dashboard stats, no discover taste profiles, no TMDB calls).
 *
 * Uses DashboardRepository.getAllVaultItems (1 query) + EpisodeProgressRepository
 * batch fetch (1 query) = 2 queries total. This is the most efficient vault
 * fetch path in the codebase.
 */

import { getDashboardRepository } from "~/lib/supabase/repositories";
import { getEpisodeProgressRepository } from "~/lib/supabase/repositories";
import type { VaultRow, EpisodeProgressRow } from "~/lib/supabase/repositories";
import { STATUS_TO_UI } from "~/shared/utils/vaultStatus";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import type { WatchlistItem, WatchProgress } from "~/shared/types";

// ---------------------------------------------------------------------------
// VaultRow → WatchlistItem (with optional episode progress)
// ---------------------------------------------------------------------------

/**
 * Map a single VaultRow to a WatchlistItem. If episode progress is
 * provided (TV only), populates season/episode/watchProgress.
 */
export function vaultRowToWatchlistItem(
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
    return {
      ...base,
      season: progress.season_number,
      episode: progress.episode_number,
      watchProgress: wp
    };
  }
  return base;
}

// ---------------------------------------------------------------------------
// fetchUserLibrary — the single vault-fetch function
// ---------------------------------------------------------------------------

/**
 * Fetch the user's complete vault (all non-deleted items) with episode
 * progress enrichment for TV titles.
 *
 * Uses DashboardRepository.getAllVaultItems (1 query — the most efficient
 * path, selects all non-deleted rows for the user in a single request)
 * + EpisodeProgressRepository.getLatestEpisodeProgressBatch (1 batch
 * query for all TV items).
 *
 * Total: 2 queries. No duplicate fetches.
 *
 * @returns Array of WatchlistItem (empty if no items or error).
 */
export async function fetchUserLibrary(userId: string): Promise<WatchlistItem[]> {
  const repo = getDashboardRepository();

  // 1. Fetch all vault items (single query)
  const { data: vaultRows, error: vaultError } = await repo.getAllVaultItems(userId);
  if (vaultError) {
    console.error("[userLibraryAdapter] Error fetching vault items:", vaultError);
  }

  const rows = vaultRows ?? [];

  // 2. Batch-fetch episode progress for TV items (single query)
  const tvVaultIds = rows.filter((r) => r.media_type === "tv").map((r) => r.id);
  let progressMap = new Map<string, EpisodeProgressRow>();

  if (tvVaultIds.length > 0) {
    const progressRepo = getEpisodeProgressRepository();
    const { data: pMap, error: pError } = await progressRepo.getLatestEpisodeProgressBatch(tvVaultIds);
    if (pError) {
      console.error("[userLibraryAdapter] Error fetching episode progress:", pError);
    } else {
      progressMap = pMap;
    }
  }

  // 3. Map to WatchlistItem with episode progress enrichment
  return rows.map((row) => {
    const progress = progressMap.get(row.id);
    return vaultRowToWatchlistItem(row, progress);
  });
}

/**
 * Get the current user's uid. Returns null if not signed in.
 */
export function getUserId(): string | null {
  return getCurrentUid();
}
