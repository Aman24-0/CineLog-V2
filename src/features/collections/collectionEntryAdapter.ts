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
export async function fetchEntriesForCollection(collectionId: string): Promise<CollectionEntry[]> {
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
    console.error("[collectionEntryAdapter] Error fetching vault rows:", vaultError);
    // Fall back to mapping without TMDB metadata
    return entryRows.map((row) => entryRowToCollectionEntry(row));
  }

  // Build lookup: vault_id → { media_type, tmdb_id }
  const vaultInfoByVaultId = new Map<string, { mediaType: "movie" | "tv"; tmdbId: number }>();
  for (const vrow of (vaultRows ?? []) as Pick<VaultRow, "id" | "media_type" | "tmdb_id">[]) {
    vaultInfoByVaultId.set(vrow.id, {
      mediaType: vrow.media_type,
      tmdbId: vrow.tmdb_id,
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
  return entryRows.map((row) => {
    const info = vaultInfoByVaultId.get(row.vault_id);
    if (!info) {
      // Vault item was deleted — return entry with defaults
      console.warn(`[collectionEntryAdapter] Vault item ${row.vault_id} not found (deleted?)`);
      return entryRowToCollectionEntry(row);
    }

    // Look up TMDB metadata
    const tmdbKey = `${info.mediaType}/${info.tmdbId}`;
    const tmdb = tmdbMap.get(tmdbKey) ?? null;

    // Build the fully hydrated entry
    return entryRowToCollectionEntry(row, info.mediaType, tmdb, info.tmdbId);
  });
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
  const { data, error } = await vaultRepo.getVaultByTmdbId(userId, Number(tmdbId), mediaType);
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
export async function clearCollectionEntries(collectionId: string): Promise<boolean> {
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
