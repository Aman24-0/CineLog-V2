// src/features/watchlist/vaultReadAdapter.ts
import { getVaultRepository } from "~/lib/supabase/repositories";
import type {
  CreateVaultItemPayload,
  VaultIdentity,
  VaultRow,
  VaultStatus,
} from "~/lib/supabase/repositories";
import { enrichWithEpisodeProgressAsync } from "./episodeProgressAdapter";
import { STATUS_TO_UI, STATUS_TO_DB } from "~/shared/utils/vaultStatus";
import type { WatchlistItem } from "~/shared/types";

/**
 * vaultReadAdapter — READ operations for the Vault adapter.
 *
 * Extracted from vaultAdapter.ts to keep that file under the 250-line
 * limit. Contains:
 *   - vaultRowToWatchlistItem: VaultRow → WatchlistItem mapping
 *   - fetchVaultFromSupabase: load all non-deleted vault items + enrich
 *   - vaultIdentity: build the composite key (userId, tmdbId, mediaType)
 *   - createVaultItemInSupabase: insert a new vault row
 *
 * The status mapping uses the shared STATUS_TO_UI / STATUS_TO_DB tables
 * from ~/shared/utils/vaultStatus (Phase 13.2 dedup).
 */

/**
 * Map a single Supabase `VaultRow` to the application's `WatchlistItem`.
 */
export function vaultRowToWatchlistItem(row: VaultRow): WatchlistItem {
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

/**
 * Load ALL non-deleted vault items for a user from Supabase, ordered by
 * `created_at` desc (matching the previous Firestore `orderBy("addedAt",
 * "desc")`).
 *
 * Calls `VaultRepository.getVaultByStatus` for each of the 5 statuses
 * in parallel, merges the results, then enriches TV items with their
 * latest episode progress (season/episode/watchProgress) via a batch
 * query to the `episode_progress` table.
 */
export async function fetchVaultFromSupabase(
  userId: string,
): Promise<WatchlistItem[]> {
  const repo = getVaultRepository();
  const statuses: VaultStatus[] = [
    "planned",
    "watching",
    "completed",
    "on_hold",
    "dropped",
  ];

  const results = await Promise.all(
    statuses.map((status) =>
      repo.getVaultByStatus(userId, status, { pagination: { limit: 1000 } }),
    ),
  );

  const allRows: VaultRow[] = [];
  for (const result of results) {
    if (result.error) {
      console.error("[vaultAdapter] Error fetching vault status:", result.error);
      continue;
    }
    allRows.push(...result.data);
  }

  const items = allRows.map(vaultRowToWatchlistItem);
  const enrichedItems = await enrichWithEpisodeProgressAsync(items, allRows);

  // Sort by created_at desc (matching the previous Firestore orderBy)
  enrichedItems.sort((a, b) => {
    const timeA = typeof a.addedAt === "string" ? new Date(a.addedAt).getTime() : 0;
    const timeB = typeof b.addedAt === "string" ? new Date(b.addedAt).getTime() : 0;
    return timeB - timeA;
  });

  return enrichedItems;
}

/**
 * Build a `VaultIdentity` from a `WatchlistItem`.
 * The composite key is (user_id, tmdb_id, media_type).
 */
export function vaultIdentity(userId: string, item: WatchlistItem): VaultIdentity {
  return {
    userId,
    tmdbId: Number(item.id),
    mediaType: item.media_type,
  };
}

/**
 * Create a new vault item in Supabase from a `WatchlistItem`.
 *
 * Used by Search, Discover, and Details when a user adds a title to
 * their vault. The `WatchlistItem` carries TMDB metadata (title,
 * poster_path, etc.) which is NOT stored in the vault table — only
 * the user-owned state (status, rating, notes) is persisted.
 *
 * @returns The created `WatchlistItem` (with timestamps from Supabase).
 */
export async function createVaultItemInSupabase(
  userId: string,
  item: WatchlistItem,
): Promise<WatchlistItem> {
  const repo = getVaultRepository();
  const payload: CreateVaultItemPayload = {
    userId,
    tmdbId: Number(item.id),
    mediaType: item.media_type,
    status: (STATUS_TO_DB[item.status ?? "Planned"] ?? "planned") as VaultStatus,
    rating: item.rating,
    notes: item.notes,
    watchedOn: item.watchDate,
  };

  const { data, error } = await repo.createVaultItem(payload);
  if (error) throw error;
  if (!data) throw new Error("[vaultAdapter] createVaultItem returned no data");

  // Return a WatchlistItem that merges the original TMDB metadata with
  // the persisted vault state so the caller's modal state is complete.
  return { ...item, ...vaultRowToWatchlistItem(data) };
}
