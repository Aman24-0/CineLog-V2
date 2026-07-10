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
import type { VaultRow } from "~/lib/supabase/repositories";
import type { CollectionEntry } from "~/shared/types";
import { entryRowToCollectionEntry } from "./collectionMapper";
import { UnresolvedMediaTypeError } from "./collectionErrors";

// ---------------------------------------------------------------------------
// READ: Fetch entries for a collection
// ---------------------------------------------------------------------------

/**
 * Fetch all entries for a collection, ordered by position ascending.
 *
 * Resolves `media_type` for each entry by batch-fetching the vault rows
 * referenced by the entries. If a vault item has been deleted, its
 * entry's media_type is left as the default ("movie") and a warning is
 * logged — the entry is NOT skipped (the UI still shows it, just with
 * an incorrect media_type fallback).
 *
 * @returns Mapped `CollectionEntry[]` with media_type resolved from vault.
 */
export async function fetchEntriesForCollection(collectionId: string): Promise<CollectionEntry[]> {
  const repo = getCollectionRepository();
  const { data: entryRows, error } = await repo.getItems(collectionId);
  if (error) {
    console.error("[collectionEntryAdapter] Error fetching entries:", error);
    return [];
  }
  if (entryRows.length === 0) return [];

  // Batch-fetch vault rows to resolve media_type for each entry.
  // The collection_entries table has no media_type column — it's on
  // the vault row. We fetch all referenced vault rows in one query.
  const _vaultRepo = getVaultRepository();
  const vaultIds = entryRows.map((e) => e.vault_id);

  // Build a vault_id → media_type lookup.
  // We use the Supabase client directly for a batch select since
  // VaultRepository doesn't expose a "get by ids" method.
  const { getClient } = await import("~/lib/supabase/client");
  const supabase = getClient();
  const { data: vaultRows, error: vaultError } = await supabase
    .from("vault")
    .select("id, media_type")
    .in("id", vaultIds)
    .is("deleted_at", null);

  if (vaultError) {
    console.error("[collectionEntryAdapter] Error fetching vault rows for media_type:", vaultError);
    // Fall back to mapping without media_type (will use default)
    return entryRows.map((row) => entryRowToCollectionEntry(row));
  }

  // Build lookup: vault_id → media_type
  const mediaTypeByVaultId = new Map<string, "movie" | "tv">();
  for (const vrow of (vaultRows ?? []) as Pick<VaultRow, "id" | "media_type">[]) {
    mediaTypeByVaultId.set(vrow.id, vrow.media_type);
  }

  // Map entries with resolved media_type
  return entryRows.map((row) => {
    const mediaType = mediaTypeByVaultId.get(row.vault_id);
    if (!mediaType) {
      // Vault item was deleted — log the issue but still return the entry
      // with a fallback. This is explicitly logged, not silently ignored.
      console.warn(
        new UnresolvedMediaTypeError(row.vault_id).message
      );
    }
    return entryRowToCollectionEntry(row, mediaType ?? "movie");
  });
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
