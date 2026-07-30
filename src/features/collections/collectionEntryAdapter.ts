/**
 * CineLog V2 — Collection Entry Adapter
 * ---------------------------------------------------------------------
 * Bridges the application's `CollectionEntry` type to the Supabase
 * `collection_entries` table via CollectionRepository.
 *
 * DATA FLOW (the normalization layer):
 *
 *   collection_entries table (vault_id + position)
 *     ↓
 *   vault table (id, media_type, tmdb_id)
 *     ↓
 *   TMDB API (title, poster_path, backdrop_path, release_date, etc.)
 *     ↓
 *   NormalizedCollectionEntry (used everywhere in the UI)
 *
 * The collection_entries table stores ONLY the relationship:
 *   (collection_id, vault_id, position)
 *
 * Display metadata (title, poster, etc.) is NOT stored — it's hydrated
 * from TMDB via the vault's tmdb_id. This is the SINGLE normalization
 * point: every UI component (card, timeline, detail, header) reads
 * from the same hydrated CollectionEntry.
 */

import { getCollectionRepository } from "~/lib/supabase/repositories";
import { getVaultRepository } from "~/lib/supabase/repositories";
import type { VaultRow } from "~/lib/supabase/repositories";
import type { CollectionEntry } from "~/shared/types";
import type { TMDBTitle } from "~/shared/types";
import { entryRowToCollectionEntry } from "./collectionMapper";

// ---------------------------------------------------------------------------
// READ: Fetch entries for a collection (with TMDB hydration)
// ---------------------------------------------------------------------------

/**
 * Fetch all entries for a collection, ordered by position ascending.
 *
 * This is the SINGLE normalization point for collection entries:
 *   1. Fetch collection_entries rows (vault_id + position)
 *   2. Batch-fetch vault rows (id, media_type, tmdb_id)
 *   3. Batch-fetch TMDB metadata (title, poster_path, backdrop_path, etc.)
 *   4. Merge into NormalizedCollectionEntry
 *
 * The returned entries have ALL fields populated:
 *   id (TMDB id as string), media_type, title, poster_path,
 *   backdrop_path, release_date, first_air_date, order
 *
 * If TMDB fetch fails for an entry, it still appears in the list
 * with whatever metadata is available (title may be undefined →
 * UI shows "Untitled" as a genuine fallback, not a data bug).
 *
 * @returns Hydrated CollectionEntry[] with TMDB metadata.
 */
export async function fetchEntriesForCollection(
  collectionId: string
): Promise<CollectionEntry[]> {
  const repo = getCollectionRepository();
  const { data: entryRows, error } = await repo.getItems(collectionId);
  if (error) {
    console.error("[collectionEntryAdapter] Error fetching entries:", error);
    return [];
  }
  if (entryRows.length === 0) return [];

  // Step 1: Batch-fetch vault rows to get tmdb_id + media_type.
  // We fetch ALL needed fields in one query — no N+1.
  const vaultIds = entryRows.map((e) => e.vault_id);
  const { getClient } = await import("~/lib/supabase/client");
  const supabase = getClient();
  const { data: vaultRows, error: vaultError } = await supabase
    .from("vault")
    .select("id, media_type, tmdb_id")
    .in("id", vaultIds)
    .is("deleted_at", null);

  if (vaultError) {
    console.error(
      "[collectionEntryAdapter] Error fetching vault rows:",
      vaultError
    );
    // Fall back to mapping without TMDB metadata
    return entryRows.map((row) => entryRowToCollectionEntry(row));
  }

  // Build lookup: vault_id → { media_type, tmdb_id }
  const vaultInfoByVaultId = new Map<
    string,
    { mediaType: "movie" | "tv"; tmdbId: number }
  >();
  for (const vrow of (vaultRows ?? []) as Pick<
    VaultRow,
    "id" | "media_type" | "tmdb_id"
  >[]) {
    vaultInfoByVaultId.set(vrow.id, {
      mediaType: vrow.media_type,
      tmdbId: vrow.tmdb_id
    });
  }

  // Step 2: Batch-fetch TMDB metadata for all entries.
  // Build the list of { mediaType, tmdbId } pairs for the batch fetch.
  const tmdbItems: { mediaType: "movie" | "tv"; tmdbId: number }[] = [];
  for (const row of entryRows) {
    const info = vaultInfoByVaultId.get(row.vault_id);
    if (info) {
      tmdbItems.push({ mediaType: info.mediaType, tmdbId: info.tmdbId });
    }
  }

  // Use the shared TMDB batch fetch (cached via apiCache).
  let tmdbMap = new Map<string, TMDBTitle>();
  if (tmdbItems.length > 0) {
    try {
      const { fetchTmdbMetadataBatch } = await import("~/core/tmdb/tmdb");
      tmdbMap = await fetchTmdbMetadataBatch(tmdbItems);
    } catch (err) {
      console.error("[collectionEntryAdapter] TMDB batch fetch failed:", err);
      // Continue with empty map — entries will have undefined title/poster
    }
  }

  // Step 3: Merge everything into hydrated CollectionEntry[].
  // IMPORTANT: Skip orphaned entries (vault item was deleted).
  // Previously, when a vault item was soft-deleted, the
  // collection_entries row still existed but the vault lookup failed —
  // the entry was rendered as a blank card (no title, no poster) which,
  // when clicked, opened the wrong movie's detail modal. This caused
  // the "two blank cards in Favourites" bug.
  //
  // The proper fix is two-pronged:
  //   1. Skip orphaned entries here (so they never reach the UI).
  //   2. Cascade-delete collection_entries when a vault item is
  //      soft-deleted (see vaultAdapter.deleteVaultItemInSupabase) —
  //      so the orphaned rows are also removed at the data layer.
  return entryRows
    .map((row) => {
      const info = vaultInfoByVaultId.get(row.vault_id);
      if (!info) {
        // Vault item was deleted — skip this entry (don't render blank).
        console.warn(
          `[collectionEntryAdapter] Vault item ${row.vault_id} not found (deleted?) — skipping orphaned collection entry.`
        );
        return null;
      }

      // Look up TMDB metadata
      const tmdbKey = `${info.mediaType}/${info.tmdbId}`;
      const tmdb = tmdbMap.get(tmdbKey) ?? null;

      // Build the fully hydrated entry
      return entryRowToCollectionEntry(row, info.mediaType, tmdb, info.tmdbId);
    })
    .filter((e): e is CollectionEntry => e !== null);
}

// ---------------------------------------------------------------------------
// WRITE: Add / Remove / Reorder
// ---------------------------------------------------------------------------

/**
 * Resolve the vault row's UUID from a TMDB identity.
 */
async function resolveVaultId(
  userId: string,
  tmdbId: string,
  mediaType: "movie" | "tv"
): Promise<string | null> {
  const vaultRepo = getVaultRepository();
  const { data, error } = await vaultRepo.getVaultByTmdbId(
    userId,
    Number(tmdbId),
    mediaType
  );
  if (error || !data) return null;
  return data.id;
}

/**
 * Add a vault item to a collection by TMDB id.
 *
 * Resolves the vault UUID from the TMDB identity, then adds the entry.
 */
export async function addEntryToCollectionByTmdbId(
  userId: string,
  collectionId: string,
  tmdbId: string,
  mediaType: "movie" | "tv"
): Promise<boolean> {
  const vaultId = await resolveVaultId(userId, tmdbId, mediaType);
  if (!vaultId) {
    console.error(
      "[collectionEntryAdapter] Could not resolve vaultId for tmdbId:",
      tmdbId
    );
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
 * NOTE: `vaultId` here is the vault row's UUID (not a TMDB id).
 * Most callers actually have a TMDB id — use
 * `removeEntryFromCollectionByTmdbId` instead, which resolves the
 * UUID first. Passing a TMDB id to this function silently deletes
 * zero rows (the vault_id column stores UUIDs).
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
 * Remove an entry from a collection by TMDB identity.
 *
 * This is the inverse of `addEntryToCollectionByTmdbId`: it resolves
 * the vault UUID from the (userId, tmdbId, mediaType) tuple, then
 * removes the entry row.
 *
 * Used by every UI surface that toggles collection membership by
 * TMDB id (heart button on MovieCard, AddToFolderSheet, batch
 * remove in collection detail, etc.).
 *
 * Returns true if the row was deleted (or was already absent —
 * idempotent). Returns false only on a real error.
 */
export async function removeEntryFromCollectionByTmdbId(
  userId: string,
  collectionId: string,
  tmdbId: string,
  mediaType: "movie" | "tv"
): Promise<boolean> {
  const vaultId = await resolveVaultId(userId, tmdbId, mediaType);
  if (!vaultId) {
    // Vault item doesn't exist (already deleted, or never added).
    // Treat as success — there's nothing to remove, and callers
    // expect idempotent behavior on the heart button.
    return true;
  }
  return removeEntryFromCollection(collectionId, vaultId);
}

/**
 * Remove a vault item from EVERY collection the user owns.
 *
 * Called after a vault row is deleted (Remove from Watchlist flow)
 * to prevent orphaned collection_entries rows that reference a
 * soft-deleted vault item. Without this, those entries would
 * silently disappear from the UI (filtered out by the
 * `is("deleted_at", null)` clause in fetchEntriesForCollection)
 * but linger in the DB forever, and — worse — would reappear as
 * "blank cards" if the user re-adds the same title to their vault
 * later (the soft-deleted vault row gets un-deleted, and the
 * orphaned collection_entries rows become visible again, pointing
 * at stale data).
 *
 * Implementation: query all of the user's collections' entry rows
 * where vault_id matches, then hard-delete them in one batch.
 */
export async function removeVaultItemFromAllCollections(
  userId: string,
  vaultId: string
): Promise<boolean> {
  try {
    const { getClient } = await import("~/lib/supabase/client");
    const supabase = getClient();
    // First, find all collection_entries rows for this vault item
    // that belong to collections owned by this user. RLS on
    // collection_entries joins through collections → owner_id, so
    // we can safely filter by vault_id alone and RLS will scope
    // the rows to the user's collections.
    const { error } = await supabase
      .from("collection_entries")
      .delete()
      .eq("vault_id", vaultId);
    if (error) {
      console.error(
        "[collectionEntryAdapter] Error cascading collection_entries delete:",
        error
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      "[collectionEntryAdapter] Failed to cascade-delete collection entries:",
      err
    );
    return false;
  }
}

/**
 * Reorder entries in a collection.
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
export async function clearCollectionEntries(
  collectionId: string
): Promise<boolean> {
  const repo = getCollectionRepository();
  const { error } = await repo.clearCollection(collectionId);
  if (error) {
    console.error("[collectionEntryAdapter] Error clearing collection:", error);
    return false;
  }
  return true;
}

// Keep the old addEntryToCollection export for backward compat
export { addEntryToCollectionByTmdbId as addEntryToCollection };
