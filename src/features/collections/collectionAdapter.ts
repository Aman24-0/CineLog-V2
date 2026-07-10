/**
 * CineLog V2 — Collection Adapter
 * ---------------------------------------------------------------------
 * Phase 8 — Collections Migration
 *
 * Bridges the application's `Collection` type to the Supabase
 * `collections` + `collection_entries` tables via CollectionRepository.
 *
 * Architecture:
 *   UI → useCollections() → collectionAdapter → CollectionRepository → Supabase
 */

import { getCollectionRepository } from "~/lib/supabase/repositories";
import type { CollectionRow } from "~/lib/supabase/repositories";
import type {Collection} from "~/shared/types";
import { collectionRowToCollection } from "./collectionMapper";
import { fetchEntriesForCollection, addEntryToCollection, removeEntryFromCollection, reorderEntriesInCollection } from "./collectionEntryAdapter";

// ---------------------------------------------------------------------------
// READ: Fetch all collections for a user (with entries)
// ---------------------------------------------------------------------------

/**
 * Load ALL non-deleted collections for a user from Supabase.
 *
 * Fetches the collection rows, then batch-fetches entries for each
 * collection, and merges them into the app's `Collection` shape.
 * Sorted: Favorites first, then by created_at desc.
 *
 * @returns An array of `Collection` objects (empty if none or error).
 */
export async function fetchCollectionsFromSupabase(userId: string): Promise<Collection[]> {
  const repo = getCollectionRepository();
  const { data: rows, error } = await repo.getCollections({
    userId,
    sort: { field: "created_at", direction: "desc" },
    pagination: { limit: 200 }
  });

  if (error) {
    console.error("[collectionAdapter] Error fetching collections:", error);
    return [];
  }
  if (!rows || rows.length === 0) return [];

  // Fetch entries for each collection in parallel
  const collectionsWithEntries = await Promise.all(
    rows.map(async (row: CollectionRow): Promise<Collection> => {
      const entries = await fetchEntriesForCollection(row.id);
      return collectionRowToCollection(row, entries);
    })
  );

  // Sort: Favorites first, then by created_at desc (already sorted by
  // created_at desc from the query, so just bubble Favorites to top)
  collectionsWithEntries.sort((a, b) => {
    if (a.isFavorites && !b.isFavorites) return -1;
    if (!a.isFavorites && b.isFavorites) return 1;
    return 0;
  });

  return collectionsWithEntries;
}

// ---------------------------------------------------------------------------
// WRITE: Collection CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new collection in Supabase.
 * @returns The created collection's id, or null on failure.
 */
export async function createCollectionInSupabase(
  userId: string,
  name: string,
  options?: { collectionType?: "user" | "curated" | "smart"; description?: string }
): Promise<string | null> {
  const repo = getCollectionRepository();
  // Build payload directly — the mapper only handles app CollectionType
  // ("user" | "official" | "curated"), but Supabase also supports "smart".
  // For "smart", we pass it directly; for others, use the mapper.
  const dbType: "user" | "curated" | "smart" =
    options?.collectionType === "smart" ? "smart"
    : options?.collectionType === "curated" ? "curated"
    : "user";

  const { data, error } = await repo.createCollection({
    userId,
    name,
    collectionType: dbType,
    description: options?.description ?? null,
  });
  if (error) {
    console.error("[collectionAdapter] Error creating collection:", error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Rename a collection.
 */
export async function renameCollectionInSupabase(
  collectionId: string,
  newName: string
): Promise<void> {
  const repo = getCollectionRepository();
  const { error } = await repo.updateCollection(collectionId, { name: newName });
  if (error) throw error;
}

/**
 * Update collection metadata (description, cover, banner, color, sort mode, view mode).
 */
export async function updateCollectionMetaInSupabase(
  collectionId: string,
  meta: {
    name?: string;
    description?: string | null;
    coverUrl?: string | null;
    bannerUrl?: string | null;
    color?: string | null;
    sortMode?: import("~/lib/supabase/repositories").SortModeType;
    viewMode?: import("~/lib/supabase/repositories").CollectionViewType;
  }
): Promise<void> {
  const repo = getCollectionRepository();
  const { error } = await repo.updateCollection(collectionId, meta);
  if (error) throw error;
}

/**
 * Soft-delete a collection (sets deleted_at).
 */
export async function deleteCollectionInSupabase(collectionId: string): Promise<void> {
  const repo = getCollectionRepository();
  const { error } = await repo.deleteCollection(collectionId);
  if (error) throw error;
}

/**
 * Restore a soft-deleted collection.
 */
export async function restoreCollectionInSupabase(collectionId: string): Promise<void> {
  const repo = getCollectionRepository();
  const { error } = await repo.restoreCollection(collectionId);
  if (error) throw error;
}

/**
 * Duplicate a collection — creates a new collection with the same name
 * + "(copy)" and copies all entries.
 */
export async function duplicateCollectionInSupabase(
  userId: string,
  collectionId: string
): Promise<void> {
  // 1. Fetch the source collection + its entries
  const repo = getCollectionRepository();
  const { data: source, error: fetchError } = await repo.getCollection(collectionId);
  if (fetchError || !source) throw fetchError ?? new Error("Collection not found");

  const entries = await fetchEntriesForCollection(collectionId);

  // 2. Create the duplicate
  const newId = await createCollectionInSupabase(userId, `${source.name} (copy)`, {
    description: source.description ?? undefined
  });
  if (!newId) throw new Error("Failed to create duplicate collection");

  // 3. Copy entries
  for (const entry of entries) {
    await addEntryToCollection(newId, entry);
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search collections by name (case-insensitive).
 */
export async function searchCollectionsInSupabase(
  userId: string,
  searchTerm: string
): Promise<Collection[]> {
  const repo = getCollectionRepository();
  const { data: rows, error } = await repo.searchCollections({
    userId,
    searchTerm,
    pagination: { limit: 50 }
  });

  if (error || !rows) return [];

  const collectionsWithEntries = await Promise.all(
    rows.map(async (row: CollectionRow): Promise<Collection> => {
      const entries = await fetchEntriesForCollection(row.id);
      return collectionRowToCollection(row, entries);
    })
  );

  return collectionsWithEntries;
}

// ---------------------------------------------------------------------------
// Ensure Favorites exists
// ---------------------------------------------------------------------------

/**
 * Ensure the user has a "Favorites" collection. Creates one if it
 * doesn't exist. Idempotent.
 */
export async function ensureFavoritesExistsInSupabase(userId: string): Promise<void> {
  const repo = getCollectionRepository();
  const { data: existing, error } = await repo.searchCollections({
    userId,
    searchTerm: "Favorites",
    pagination: { limit: 10 }
  });

  if (error) {
    console.error("[collectionAdapter] Error checking Favorites:", error);
    return;
  }

  // Check if any result is exactly "Favorites"
  const hasFavorites = existing?.some((c) => c.name === "Favorites");
  if (!hasFavorites) {
    await createCollectionInSupabase(userId, "Favorites");
  }
}

// Re-export entry operations for the hook
export {
  addEntryToCollection,
  removeEntryFromCollection,
  reorderEntriesInCollection,
  fetchEntriesForCollection
};
