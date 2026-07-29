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
import { fetchEntriesForCollection, addEntryToCollectionByTmdbId, removeEntryFromCollection, reorderEntriesInCollection } from "./collectionEntryAdapter";

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
 * @param userId            The Supabase user id.
 * @param options.includeArchived  When true, archived rows are also
 *                                 returned (default false — only active
 *                                 collections). The caller can split
 *                                 the result on `isArchived` to render
 *                                 them in a separate "Archived" section.
 * @returns An array of `Collection` objects (empty if none or error).
 */
export async function fetchCollectionsFromSupabase(
  userId: string,
  options?: { includeArchived?: boolean }
): Promise<Collection[]> {
  const repo = getCollectionRepository();
  const { data: rows, error } = await repo.getCollections({
    userId,
    sort: { field: "created_at", direction: "desc" },
    pagination: { limit: 200 },
    includeArchived: options?.includeArchived ?? false,
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
// Archive / Unarchive — dedicated operations that bypass the
// generic updateCollection path so they can use the locked predicates
// (only archive if not already archived, only unarchive if archived).
// ---------------------------------------------------------------------------

/**
 * Archive a user collection. Sets `archived_at = NOW()` on the row.
 * The collection is NOT soft-deleted — it remains queryable and can
 * be unarchived later. The Collections grid filters archived rows out
 * by default; the user toggles "Show Archived" to surface them.
 */
export async function archiveCollectionInSupabase(collectionId: string): Promise<void> {
  const repo = getCollectionRepository();
  const { error } = await repo.archiveCollection(collectionId);
  if (error) throw error;
}

/**
 * Unarchive a user collection. Clears `archived_at`. Brings the
 * collection back into the default Collections grid.
 */
export async function unarchiveCollectionInSupabase(collectionId: string): Promise<void> {
  const repo = getCollectionRepository();
  const { error } = await repo.unarchiveCollection(collectionId);
  if (error) throw error;
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
 * Update collection metadata (description, cover, banner, color, sort
 * mode, view mode, archived_at).
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
    /** ISO timestamp to archive; `null` to unarchive. */
    archivedAt?: string | null;
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
): Promise<string | null> {
  // 1. Fetch the source collection + its entries
  const repo = getCollectionRepository();
  const { data: source, error: fetchError } = await repo.getCollection(collectionId);
  if (fetchError || !source) throw fetchError ?? new Error("Collection not found");

  const entries = await fetchEntriesForCollection(collectionId);

  // 2. Create the duplicate — copy ALL supported metadata fields so
  //    the clone is a true visual duplicate (cover, banner, accent
  //    color, description, collection_type, sort/view mode).
  const sourceRow = source as CollectionRow & { color?: string | null };
  const newId = await createCollectionInSupabase(userId, `${source.name} (copy)`, {
    description: source.description ?? undefined,
  });
  if (!newId) throw new Error("Failed to create duplicate collection");

  // Apply the rest of the metadata via updateCollection so we can
  // pass cover/banner/color/sortMode/viewMode in one shot. The
  // createCollectionInSupabase path only accepts name+description+
  // collectionType — the rest have to be patched.
  try {
    await repo.updateCollection(newId, {
      coverUrl: source.cover_url,
      bannerUrl: source.banner_url,
      color: sourceRow.color ?? null,
      sortMode: source.sort_mode,
      viewMode: source.view_mode,
    });
  } catch (err) {
    // Non-fatal — the duplicate still exists with name + description.
    console.warn("[collectionAdapter] Failed to copy metadata on duplicate:", err);
  }

  // 3. Copy entries — preserves the source order via the ordered
  //    add-loop (each addToCollection appends to the end).
  for (const entry of entries) {
    await addEntryToCollectionByTmdbId(userId, newId, entry.id, entry.media_type);
  }

  return newId;
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

// Mutex guard — prevents concurrent ensureFavoritesExists calls from
// both creating a duplicate. Without this, two rapid onSessionChange
// events could both pass the "hasFavorites" check before either creates,
// resulting in two "Favorites" collections.
let ensureFavoritesInFlight = false;

/**
 * Ensure the user has a "Favorites" collection. Creates one if it
 * doesn't exist. Idempotent.
 *
 * Race condition prevention:
 *   A module-level mutex (`ensureFavoritesInFlight`) prevents concurrent
 *   calls from both creating a duplicate. Without this, two rapid
 *   onSessionChange events could both pass the "hasFavorites" check
 *   before either creates, resulting in two "Favorites" collections.
 *
 * Duplicate cleanup:
 *   If duplicates already exist (from the previous bug), the oldest one
 *   is kept and the rest are soft-deleted. This self-heals existing
 *   databases without requiring a manual migration.
 */
export async function ensureFavoritesExistsInSupabase(userId: string): Promise<void> {
  // Mutex — if a previous call is in flight, wait for it to complete
  // by returning early. The next call will find the Favorites collection
  // created by the first call.
  if (ensureFavoritesInFlight) {
    return;
  }
  ensureFavoritesInFlight = true;

  try {
    const repo = getCollectionRepository();
    const { data: existing, error } = await repo.getCollections({
      userId,
      pagination: { limit: 200 }
    });

    if (error) {
      console.error("[collectionAdapter] Error checking Favorites:", error);
      return;
    }

    // Find ALL collections named "Favorites" (case-sensitive exact match).
    const favorites = existing?.filter((c) => c.name === "Favorites") ?? [];

    if (favorites.length === 0) {
      // No Favorites collection — create one.
      await createCollectionInSupabase(userId, "Favorites");
    } else if (favorites.length > 1) {
      // DUPLICATE CLEANUP: Keep the oldest (first created), soft-delete
      // the rest. This self-heals databases that already have duplicates
      // from the previous race condition bug.
      const sorted = [...favorites].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const toDelete = sorted.slice(1); // all except the oldest
      console.warn(
        `[collectionAdapter] Found ${favorites.length} duplicate Favorites collections. ` +
        `Keeping ${sorted[0].id}, deleting ${toDelete.map((c) => c.id).join(", ")}.`
      );
      for (const col of toDelete) {
        try {
          await deleteCollectionInSupabase(col.id);
        } catch (err) {
          console.error(`[collectionAdapter] Failed to delete duplicate Favorites ${col.id}:`, err);
        }
      }
    }
  } finally {
    ensureFavoritesInFlight = false;
  }
}

// Re-export entry operations for the hook
export {
  addEntryToCollectionByTmdbId,
  removeEntryFromCollection,
  reorderEntriesInCollection,
  fetchEntriesForCollection
};
