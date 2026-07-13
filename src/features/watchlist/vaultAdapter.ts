// src/features/watchlist/vaultAdapter.ts
/**
 * CineLog V2 — Vault Adapter (Full Supabase Migration)
 * ---------------------------------------------------------------------
 * Phase 7.2 — Complete Vault Migration
 *
 * The SOLE bridge between the application's `WatchlistItem` shape and
 * the Supabase `vault` table. All Vault reads and writes go through
 * this adapter → VaultRepository → Supabase → PostgreSQL.
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
 *
 * TMDB metadata fields (title, poster_path, genresList, etc.) are NOT
 * stored in the vault table — the UI fetches them from TMDB. The vault
 * table stores only user-owned state.
 *
 * READ operations live in `vaultReadAdapter.ts`. This file owns WRITE
 * operations (update / toggle / delete / restore).
 */
import { getVaultRepository } from "~/lib/supabase/repositories";
import type {
  VaultIdentity,
  VaultStatus,
  VaultUpdate,
} from "~/lib/supabase/repositories";
import { STATUS_TO_DB } from "~/shared/utils/vaultStatus";
import type { WatchlistItem } from "~/shared/types";

// Re-export READ operations so existing consumers can keep importing
// everything from vaultAdapter.ts.
export {
  vaultRowToWatchlistItem,
  fetchVaultFromSupabase,
  vaultIdentity,
  createVaultItemInSupabase,
} from "./vaultReadAdapter";

// ---------------------------------------------------------------------------
// WRITE: WatchlistItem → VaultRow operations
// ---------------------------------------------------------------------------

/** Update a vault item's status in Supabase. */
export async function updateStatusInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  status: string,
): Promise<void> {
  const repo = getVaultRepository();
  const vaultStatus = (STATUS_TO_DB[status as WatchlistItem["status"]] ?? "planned") as VaultStatus;
  const { error } = await repo.updateStatus(
    { userId, tmdbId: Number(itemId), mediaType },
    vaultStatus,
  );
  if (error) throw error;
}

/** Update a vault item's rating in Supabase. */
export async function updateRatingInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  rating: number,
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateRating(
    { userId, tmdbId: Number(itemId), mediaType },
    rating,
  );
  if (error) throw error;
}

/** Update a vault item's notes in Supabase. */
export async function updateNotesInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  notes: string,
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateNotes(
    { userId, tmdbId: Number(itemId), mediaType },
    notes,
  );
  if (error) throw error;
}

/** Update a vault item's watch date in Supabase (maps to `watched_on`). */
export async function updateWatchDateInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  watchDate: string,
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    { watched_on: watchDate },
  );
  if (error) throw error;
}

/** Update a vault item's progress (minutes) in Supabase (movies only). */
export async function updateProgressInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  progressMinutes: number,
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateProgress(
    { userId, tmdbId: Number(itemId), mediaType },
    progressMinutes,
  );
  if (error) throw error;
}

/** Toggle the `is_favorite` flag on a vault item. */
export async function toggleFavoriteInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  currentValue: boolean,
): Promise<void> {
  const repo = getVaultRepository();
  const update: VaultUpdate = { is_favorite: !currentValue };
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    update,
  );
  if (error) throw error;
}

/** Toggle the `is_pinned` flag on a vault item. */
export async function togglePinnedInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  currentValue: boolean,
): Promise<void> {
  const repo = getVaultRepository();
  const update: VaultUpdate = { is_pinned: !currentValue };
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    update,
  );
  if (error) throw error;
}

/** Soft-delete a vault item in Supabase (sets `deleted_at`).
 *
 * ALSO cascades: hard-deletes every `collection_entries` row that
 * references this vault item. Without this cascade, those rows
 * would become orphans — invisible in the UI (filtered out by the
 * `is("deleted_at", null)` clause in fetchEntriesForCollection)
 * but lingering in the DB. Worse, if the user re-adds the same
 * title to their vault later, the soft-deleted vault row gets
 * un-deleted and the orphaned collection_entries rows reappear
 * as "blank cards" pointing at stale data.
 *
 * The cascade is best-effort: if it fails, the vault deletion
 * still succeeds (the title is removed from the watchlist), and
 * the error is logged. The orphaned entries will be cleaned up
 * next time the user removes another title, or never — they're
 * invisible anyway.
 */
export async function deleteVaultItemInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
): Promise<void> {
  const repo = getVaultRepository();

  // Resolve the vault UUID first so we can cascade-delete collection
  // entries. If this lookup fails (e.g. already deleted), we skip
  // the cascade — there's nothing to clean up.
  let vaultUuid: string | null = null;
  try {
    const { data: vaultRow } = await repo.getVaultByTmdbId(userId, Number(itemId), mediaType);
    vaultUuid = vaultRow?.id ?? null;
  } catch (err) {
    // Non-fatal — proceed with the vault deletion. The cascade
    // just won't happen this time.
    console.warn("[vaultAdapter] Could not resolve vault UUID for cascade delete:", err);
  }

  // Soft-delete the vault row (existing behavior).
  const { error } = await repo.deleteVaultItem({
    userId,
    tmdbId: Number(itemId),
    mediaType,
  });
  if (error) throw error;

  // Cascade: hard-delete collection_entries referencing this vault.
  // This MUST happen after the vault soft-delete so RLS policies
  // (which may check vault.deleted_at) see the updated state.
  if (vaultUuid) {
    try {
      const { removeVaultItemFromAllCollections } = await import(
        "~/features/collections/collectionEntryAdapter"
      );
      await removeVaultItemFromAllCollections(userId, vaultUuid);
    } catch (err) {
      // Non-fatal — the vault deletion already succeeded. The
      // orphaned entries are invisible (filtered out by
      // fetchEntriesForCollection) and will be cleaned up if the
      // user re-adds and re-removes the title.
      console.warn("[vaultAdapter] Cascade delete of collection_entries failed:", err);
    }
  }
}

/** Restore a soft-deleted vault item in Supabase (clears `deleted_at`). */
export async function restoreVaultItemInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.restoreVaultItem({
    userId,
    tmdbId: Number(itemId),
    mediaType,
  });
  if (error) throw error;
}

/** General-purpose vault item update (for fields not covered by targeted updaters). */
export async function updateVaultItemInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  update: VaultUpdate,
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    update,
  );
  if (error) throw error;
}

// Re-export the identity type so callers can import it from here.
export type { VaultIdentity };
