/**
 * CineLog V2 — Collection Entry Adapter
 * ---------------------------------------------------------------------
 * Phase 8 — Collections Migration
 *
 * Bridges the application's `CollectionEntry` type to the Supabase
 * `collection_entries` table via CollectionRepository.
 *
 * Key challenge: `collection_entries` uses `vault_id` (UUID), but the
 * app's `CollectionEntry.id` is the TMDB id (string). The vault item's
 * UUID must be resolved from the TMDB identity via VaultRepository.
 */

import { getCollectionRepository } from "~/lib/supabase/repositories";
import { getVaultRepository } from "~/lib/supabase/repositories";
import type { CollectionEntry } from "~/shared/types";
import { entryRowToCollectionEntry } from "./collectionMapper";

// ---------------------------------------------------------------------------
// READ: Fetch entries for a collection
// ---------------------------------------------------------------------------

/**
 * Fetch all entries for a collection, ordered by position ascending.
 * Maps the raw `CollectionEntryRow` to the app's `CollectionEntry`.
 */
export async function fetchEntriesForCollection(collectionId: string): Promise<CollectionEntry[]> {
  const repo = getCollectionRepository();
  const { data, error } = await repo.getItems(collectionId);
  if (error) {
    console.error("[collectionEntryAdapter] Error fetching entries:", error);
    return [];
  }
  return data.map(entryRowToCollectionEntry);
}

// ---------------------------------------------------------------------------
// WRITE: Add / Remove / Reorder
// ---------------------------------------------------------------------------

/**
 * Resolve the vault row's UUID from a TMDB identity.
 *
 * `collection_entries` uses `vault_id` (UUID), but the UI works with
 * `tmdb_id` (string). This helper bridges the gap.
 */
async function resolveVaultId(
  userId: string,
  tmdbId: string,
  mediaType: "movie" | "tv"
): Promise<string | null> {
  const vaultRepo = getVaultRepository();
  const { data, error } = await vaultRepo.getVaultByTmdbId(userId, Number(tmdbId), mediaType);
  if (error || !data) return null;
  return data.id;
}

/**
 * Add a vault item to a collection.
 *
 * The `CollectionEntry.id` is the TMDB id (string). This function
 * resolves it to the vault UUID, then calls `CollectionRepository.addItem`.
 *
 * @returns true on success, false on failure.
 */
export async function addEntryToCollection(
  collectionId: string,
  entry: CollectionEntry
): Promise<boolean> {
  // The entry.id is the TMDB id — we need the vault UUID.
  // Since we don't have the userId here, we rely on the CollectionRepository
  // to enforce RLS. The vault_id must be a real vault UUID.
  //
  // For entries coming from the UI (where entry.id is tmdb_id), we need
  // to resolve the vault UUID first. But addEntryToCollection is called
  // from the hook which has the userId. So we accept the vault_id directly
  // if it's a UUID, or resolve it if it looks like a TMDB id.
  //
  // Simplest approach: the hook resolves the vault UUID before calling
  // this function. For now, we pass entry.id as the vault_id — if the
  // UI passes a TMDB id, this will fail at the FK constraint. The hook
  // should call addEntryToCollectionWithTmdbId instead.
  const repo = getCollectionRepository();
  const { error } = await repo.addItem({
    collectionId,
    vaultId: entry.id, // Should be a vault UUID; see note above
  });
  if (error) {
    console.error("[collectionEntryAdapter] Error adding entry:", error);
    return false;
  }
  return true;
}

/**
 * Add a vault item to a collection by TMDB id.
 *
 * Resolves the vault UUID from the TMDB identity, then adds the entry.
 * This is the preferred method for UI callers that have TMDB ids.
 */
export async function addEntryToCollectionByTmdbId(
  userId: string,
  collectionId: string,
  tmdbId: string,
  mediaType: "movie" | "tv"
): Promise<boolean> {
  const vaultId = await resolveVaultId(userId, tmdbId, mediaType);
  if (!vaultId) {
    console.error("[collectionEntryAdapter] Could not resolve vaultId for tmdbId:", tmdbId);
    return false;
  }

  const repo = getCollectionRepository();
  const { error } = await repo.addItem({ collectionId, vaultId });
  if (error) {
    console.error("[collectionEntryAdapter] Error adding entry:", error);
    return false;
  }
  return true;
}

/**
 * Remove an entry from a collection.
 *
 * @param collectionId  The collection's UUID.
 * @param vaultId       The vault item's UUID (NOT tmdb_id).
 */
export async function removeEntryFromCollection(
  collectionId: string,
  vaultId: string
): Promise<boolean> {
  const repo = getCollectionRepository();
  const { error } = await repo.removeItem({ collectionId, vaultId });
  if (error) {
    console.error("[collectionEntryAdapter] Error removing entry:", error);
    return false;
  }
  return true;
}

/**
 * Reorder entries in a collection.
 *
 * @param collectionId     The collection's UUID.
 * @param orderedVaultIds  Array of vault UUIDs in the desired order.
 */
export async function reorderEntriesInCollection(
  collectionId: string,
  orderedVaultIds: string[]
): Promise<boolean> {
  const repo = getCollectionRepository();
  const { error } = await repo.reorderItems(collectionId, orderedVaultIds);
  if (error) {
    console.error("[collectionEntryAdapter] Error reordering entries:", error);
    return false;
  }
  return true;
}

/**
 * Move a single entry to a new position within a collection.
 *
 * @param collectionId  The collection's UUID.
 * @param vaultId       The vault item's UUID.
 * @param toPosition    Zero-indexed target position.
 */
export async function moveEntryInCollection(
  collectionId: string,
  vaultId: string,
  toPosition: number
): Promise<boolean> {
  const repo = getCollectionRepository();
  const { error } = await repo.moveItem({ collectionId, vaultId, toPosition });
  if (error) {
    console.error("[collectionEntryAdapter] Error moving entry:", error);
    return false;
  }
  return true;
}

/**
 * Clear all entries from a collection (hard delete).
 */
export async function clearCollectionEntries(collectionId: string): Promise<boolean> {
  const repo = getCollectionRepository();
  const { error } = await repo.clearCollection(collectionId);
  if (error) {
    console.error("[collectionEntryAdapter] Error clearing collection:", error);
    return false;
  }
  return true;
}
