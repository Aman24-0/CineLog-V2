/**
 * CineLog V2 — Vault Adapter (Full Supabase Migration)
 * ---------------------------------------------------------------------
 * Phase 7.2 — Complete Vault Migration
 *
 * The SOLE bridge between the application's `WatchlistItem` shape and
 * the Supabase `vault` table. All Vault reads and writes go through
 * this adapter → VaultRepository → Supabase. There is exactly ONE
 * source of truth: Supabase PostgreSQL.
 *
 * Architecture:
 *   UI → useVault() → vaultAdapter → VaultRepository → Supabase → PostgreSQL
 *
 * No Firestore. No watchlistService. No optimistic workarounds.
 *
 * Field mapping (WatchlistItem ↔ VaultRow):
 *   WatchlistItem.id (string)        ↔ vault.tmdb_id (number)
 *   WatchlistItem.media_type          ↔ vault.media_type (enum)
 *   WatchlistItem.status (Title Case) ↔ vault.status (lowercase enum)
 *   WatchlistItem.rating              ↔ vault.rating
 *   WatchlistItem.notes               ↔ vault.notes
 *   WatchlistItem.watchDate           ↔ vault.watched_on
 *   WatchlistItem.addedAt             ↔ vault.created_at (auto)
 *   WatchlistItem.updatedAt           ↔ vault.updated_at (auto)
 *   (isFavorite — UI computes from favorites shelf)
 *   (isPinned — UI computes from pinned shelf)
 *
 * TMDB metadata fields (title, poster_path, genresList, etc.) are NOT
 * stored in the vault table — the UI fetches them from TMDB. The vault
 * table stores only user-owned state (status, rating, notes, etc.).
 */

import { getVaultRepository } from "~/lib/supabase/repositories";
import type {
  CreateVaultItemPayload,
  VaultIdentity,
  VaultRow,
  VaultStatus,
  VaultUpdate
} from "~/lib/supabase/repositories";
import { enrichWithEpisodeProgressAsync } from "./episodeProgressAdapter";
import type { WatchlistItem } from "~/shared/types";

// ---------------------------------------------------------------------------
// Status mapping: Firestore Title Case ↔ Supabase lowercase enum
// ---------------------------------------------------------------------------

/**
 * Map a Supabase `vault_status_type` enum value to the Firestore Title
 * Case status the UI expects.
 *
 * Supabase: "planned" | "watching" | "completed" | "on_hold" | "dropped"
 * Firestore: "Planned" | "Watching" | "Completed" | "Plan to Watch"
 *
 * "on_hold" and "dropped" have no exact Firestore equivalent — both map
 * to "Plan to Watch" (the closest existing status).
 */
const STATUS_TO_UI: Record<VaultStatus, WatchlistItem["status"]> = {
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  on_hold: "Plan to Watch",
  dropped: "Plan to Watch"
};

/**
 * Reverse map: Firestore Title Case → Supabase lowercase enum.
 * "Plan to Watch" maps to "planned" (the closest Supabase status).
 */
const STATUS_TO_DB: Record<WatchlistItem["status"], VaultStatus> = {
  Planned: "planned",
  Watching: "watching",
  Completed: "completed",
  "Plan to Watch": "planned"
};

// ---------------------------------------------------------------------------
// READ: VaultRow → WatchlistItem
// ---------------------------------------------------------------------------

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
    updatedAt: row.updated_at
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
export async function fetchVaultFromSupabase(userId: string): Promise<WatchlistItem[]> {
  const repo = getVaultRepository();
  const statuses: VaultStatus[] = ["planned", "watching", "completed", "on_hold", "dropped"];

  const results = await Promise.all(
    statuses.map((status) => repo.getVaultByStatus(userId, status, { pagination: { limit: 1000 } }))
  );

  const allRows: VaultRow[] = [];
  for (const result of results) {
    if (result.error) {
      console.error("[vaultAdapter] Error fetching vault status:", result.error);
      continue;
    }
    allRows.push(...result.data);
  }

  // Map to WatchlistItem
  const items = allRows.map(vaultRowToWatchlistItem);

  // Enrich TV items with episode progress (season/episode/watchProgress)
  const enrichedItems = await enrichWithEpisodeProgressAsync(items, allRows);

  // Sort by created_at desc (matching the previous Firestore orderBy)
  enrichedItems.sort((a, b) => {
    const timeA = typeof a.addedAt === "string" ? new Date(a.addedAt).getTime() : 0;
    const timeB = typeof b.addedAt === "string" ? new Date(b.addedAt).getTime() : 0;
    return timeB - timeA;
  });

  return enrichedItems;
}

// ---------------------------------------------------------------------------
// WRITE: WatchlistItem → VaultRow operations
// ---------------------------------------------------------------------------

/**
 * Build a `VaultIdentity` from a `WatchlistItem`.
 * The composite key is (user_id, tmdb_id, media_type).
 */
export function vaultIdentity(userId: string, item: WatchlistItem): VaultIdentity {
  return {
    userId,
    tmdbId: Number(item.id),
    mediaType: item.media_type
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
  item: WatchlistItem
): Promise<WatchlistItem> {
  const repo = getVaultRepository();
  const payload: CreateVaultItemPayload = {
    userId,
    tmdbId: Number(item.id),
    mediaType: item.media_type,
    status: STATUS_TO_DB[item.status ?? "Planned"] ?? "planned",
    rating: item.rating,
    notes: item.notes,
    watchedOn: item.watchDate
  };

  const { data, error } = await repo.createVaultItem(payload);
  if (error) throw error;
  if (!data) throw new Error("[vaultAdapter] createVaultItem returned no data");

  // Return a WatchlistItem that merges the original TMDB metadata with
  // the persisted vault state so the caller's modal state is complete.
  return { ...item, ...vaultRowToWatchlistItem(data) };
}

/**
 * Update a vault item's status in Supabase.
 */
export async function updateStatusInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  status: string
): Promise<void> {
  const repo = getVaultRepository();
  const vaultStatus = STATUS_TO_DB[status as WatchlistItem["status"]] ?? "planned";
  const { error } = await repo.updateStatus(
    { userId, tmdbId: Number(itemId), mediaType },
    vaultStatus
  );
  if (error) throw error;
}

/**
 * Update a vault item's rating in Supabase.
 */
export async function updateRatingInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  rating: number
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateRating(
    { userId, tmdbId: Number(itemId), mediaType },
    rating
  );
  if (error) throw error;
}

/**
 * Update a vault item's notes in Supabase.
 */
export async function updateNotesInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  notes: string
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateNotes(
    { userId, tmdbId: Number(itemId), mediaType },
    notes
  );
  if (error) throw error;
}

/**
 * Update a vault item's watch date in Supabase (maps to `watched_on`).
 */
export async function updateWatchDateInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  watchDate: string
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    { watched_on: watchDate }
  );
  if (error) throw error;
}

/**
 * Update a vault item's progress (minutes) in Supabase.
 * Used for movies; TV episode progress lives in `episode_progress`.
 */
export async function updateProgressInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  progressMinutes: number
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateProgress(
    { userId, tmdbId: Number(itemId), mediaType },
    progressMinutes
  );
  if (error) throw error;
}

/**
 * Toggle the `is_favorite` flag on a vault item.
 */
export async function toggleFavoriteInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  currentValue: boolean
): Promise<void> {
  const repo = getVaultRepository();
  const update: VaultUpdate = { is_favorite: !currentValue };
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    update
  );
  if (error) throw error;
}

/**
 * Toggle the `is_pinned` flag on a vault item.
 */
export async function togglePinnedInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  currentValue: boolean
): Promise<void> {
  const repo = getVaultRepository();
  const update: VaultUpdate = { is_pinned: !currentValue };
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    update
  );
  if (error) throw error;
}

/**
 * Soft-delete a vault item in Supabase (sets `deleted_at`).
 */
export async function deleteVaultItemInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"]
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.deleteVaultItem(
    { userId, tmdbId: Number(itemId), mediaType }
  );
  if (error) throw error;
}

/**
 * Restore a soft-deleted vault item in Supabase (clears `deleted_at`).
 */
export async function restoreVaultItemInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"]
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.restoreVaultItem(
    { userId, tmdbId: Number(itemId), mediaType }
  );
  if (error) throw error;
}

/**
 * General-purpose vault item update (for fields not covered by the
 * targeted updaters above).
 */
export async function updateVaultItemInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  update: VaultUpdate
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    update
  );
  if (error) throw error;
}
