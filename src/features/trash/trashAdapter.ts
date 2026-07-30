// src/features/trash/trashAdapter.ts
/**
 * CineLog V2 — Trash Adapter
 * ---------------------------------------------------------------------
 * The Trash feature is a recycle bin for soft-deleted vault items and
 * collections. Items soft-deleted (via deleteVaultItemInSupabase or
 * deleteCollectionInSupabase) are kept for 30 days and can be restored.
 *
 * This adapter provides:
 *   - fetchTrashedVaultItems: load all soft-deleted vault rows for a user
 *   - fetchTrashedCollections: load all soft-deleted collection rows
 *   - hardDeleteVaultItem: permanently delete a soft-deleted vault row
 *   - hardDeleteCollection: permanently delete a soft-deleted collection row
 *   - restoreVaultItem: re-export of restoreVaultItemInSupabase (clears deleted_at)
 *   - restoreCollection: re-export of restoreCollectionInSupabase (clears deleted_at)
 *   - clearAllTrash: hard-delete ALL soft-deleted vault + collection rows
 *   - autoPurgeExpired: hard-delete items with deleted_at older than 30 days
 *
 * Auto-purge is called on Trash page load. Since we don't have a server
 * cron, this client-side sweep ensures items don't linger past 30 days
 * (as long as the user visits the Trash page at least once after expiry).
 *
 * Architecture:
 *   TrashPage → trashAdapter → Supabase (vault + collections tables)
 */
import { getClient } from "~/lib/supabase/client";
import type { VaultRow, CollectionRow } from "~/lib/supabase/repositories";
import { restoreVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";
import { restoreCollectionInSupabase } from "~/features/collections/collectionAdapter";
import type { WatchlistItem } from "~/shared/types";
import { vaultRowToWatchlistItem } from "~/features/watchlist/vaultReadAdapter";
import { fetchTmdbMetadataBatch } from "~/core/tmdb/tmdb";

/** 30 days in milliseconds. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface TrashedVaultItem extends WatchlistItem {
  /** ISO timestamp when the item was soft-deleted. */
  deletedAt: string;
  /** ISO timestamp when the item will be permanently purged (deletedAt + 30d). */
  expiresAt: string;
}

export interface TrashedCollection {
  id: string;
  name: string;
  collectionType: string;
  deletedAt: string;
  expiresAt: string;
  entryCount: number;
}

/**
 * Fetch all soft-deleted vault items for a user.
 * Ordered by deleted_at desc (most recently deleted first).
 *
 * ENRICHMENT (v2.4):
 *   The vault table doesn't store TMDB display fields (title, name,
 *   poster_path, backdrop_path) — only the user-owned state. Without
 *   enrichment, the Trash page would show blank posters and "Untitled".
 *   So after loading the trashed rows, we batch-fetch TMDB metadata for
 *   each item and merge the display fields in. Failures are silent —
 *   if TMDB can't be reached, the item still appears with a fallback
 *   poster (icon) and "Untitled" title (the TrashPage already handles
 *   those cases gracefully).
 */
export async function fetchTrashedVaultItems(
  userId: string
): Promise<TrashedVaultItem[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("vault")
    .select()
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    console.error("[trashAdapter] Error fetching trashed vault items:", error);
    return [];
  }
  if (!data || data.length === 0) return [];

  const rows = data as VaultRow[];

  // Build the base trashed items (no TMDB display fields yet).
  const baseItems = rows.map((row) => {
    const base = vaultRowToWatchlistItem(row);
    const deletedAt = row.deleted_at ?? new Date().toISOString();
    const expiresAt = new Date(
      new Date(deletedAt).getTime() + TRASH_RETENTION_MS
    ).toISOString();
    return { ...base, deletedAt, expiresAt };
  });

  // Batch-fetch TMDB metadata so we can show title + poster in the
  // trash list. One parallel batch — if any single title fails, the
  // others still succeed (Promise.allSettled inside the batch helper).
  try {
    const tmdbMap = await fetchTmdbMetadataBatch(
      baseItems.map((it) => ({
        mediaType: it.media_type,
        tmdbId: it.id
      }))
    );
    // Merge display fields from TMDB into each trashed item.
    return baseItems.map((it) => {
      const tmdb = tmdbMap.get(`${it.media_type}/${it.id}`);
      if (!tmdb) return it;
      return {
        ...it,
        title: tmdb.title ?? tmdb.name ?? it.title,
        name: tmdb.name ?? tmdb.title ?? it.name,
        poster_path: tmdb.poster_path ?? it.poster_path ?? null,
        backdrop_path: tmdb.backdrop_path ?? it.backdrop_path ?? null
      } as TrashedVaultItem;
    });
  } catch (err) {
    console.warn(
      "[trashAdapter] TMDB enrichment failed (returning unenriched items):",
      err
    );
    return baseItems;
  }
}

/**
 * Fetch all soft-deleted collections for a user.
 * Ordered by deleted_at desc. Includes entry count for each folder.
 */
export async function fetchTrashedCollections(
  userId: string
): Promise<TrashedCollection[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("collections")
    .select()
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    console.error("[trashAdapter] Error fetching trashed collections:", error);
    return [];
  }
  if (!data || data.length === 0) return [];

  // Fetch entry counts for each trashed collection in parallel.
  // collection_entries don't have deleted_at — when a collection is
  // soft-deleted, its entries remain (so they can be restored).
  const rows = data as CollectionRow[];
  const counts = await Promise.all(
    rows.map(async (row) => {
      const { count, error: countErr } = await supabase
        .from("collection_entries")
        .select("id", { count: "exact", head: true })
        .eq("collection_id", row.id);
      if (countErr) {
        console.warn(
          `[trashAdapter] Failed to count entries for collection ${row.id}:`,
          countErr
        );
        return 0;
      }
      return count ?? 0;
    })
  );

  return rows.map((row, i) => {
    const deletedAt = row.deleted_at ?? new Date().toISOString();
    const expiresAt = new Date(
      new Date(deletedAt).getTime() + TRASH_RETENTION_MS
    ).toISOString();
    return {
      id: row.id,
      name: row.name,
      collectionType: row.collection_type,
      deletedAt,
      expiresAt,
      entryCount: counts[i] ?? 0
    };
  });
}

/**
 * Permanently delete a soft-deleted vault item (hard delete).
 * Only works on rows that have deleted_at set.
 */
export async function hardDeleteVaultItem(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"]
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("vault")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_id", Number(itemId))
    .eq("media_type", mediaType)
    .not("deleted_at", "is", null);
  if (error) throw error;
}

/**
 * Permanently delete a soft-deleted collection (hard delete).
 * Cascades to collection_entries (hard-deleted explicitly).
 */
export async function hardDeleteCollection(
  collectionId: string
): Promise<void> {
  const supabase = getClient();
  // First hard-delete all entries in this collection
  const { error: entriesErr } = await supabase
    .from("collection_entries")
    .delete()
    .eq("collection_id", collectionId);
  if (entriesErr) {
    console.warn(
      `[trashAdapter] Failed to cascade-delete entries for collection ${collectionId}:`,
      entriesErr
    );
  }
  // Then hard-delete the collection row itself
  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", collectionId)
    .not("deleted_at", "is", null);
  if (error) throw error;
}

/**
 * Clear ALL trash — hard-delete every soft-deleted vault item and
 * collection for the user. Used by the "Clear Trash" button.
 */
export async function clearAllTrash(
  userId: string
): Promise<{ vault: number; collections: number }> {
  const supabase = getClient();

  const { data: deletedVault, error: vaultErr } = await supabase
    .from("vault")
    .delete()
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .select("id");
  if (vaultErr) {
    console.error("[trashAdapter] Error clearing vault trash:", vaultErr);
    throw vaultErr;
  }

  const { data: trashedCols, error: colFetchErr } = await supabase
    .from("collections")
    .select("id")
    .eq("user_id", userId)
    .not("deleted_at", "is", null);
  if (colFetchErr) {
    console.error(
      "[trashAdapter] Error fetching trashed collections for clear:",
      colFetchErr
    );
    throw colFetchErr;
  }
  const colIds = (trashedCols ?? []).map((r: { id: string }) => r.id);
  if (colIds.length > 0) {
    const { error: entriesErr } = await supabase
      .from("collection_entries")
      .delete()
      .in("collection_id", colIds);
    if (entriesErr) {
      console.warn(
        "[trashAdapter] Failed to cascade-delete entries during clear:",
        entriesErr
      );
    }
    const { error: colDelErr } = await supabase
      .from("collections")
      .delete()
      .in("id", colIds);
    if (colDelErr) throw colDelErr;
  }

  return {
    vault: deletedVault?.length ?? 0,
    collections: colIds.length
  };
}

/**
 * Auto-purge expired trash — hard-delete any soft-deleted vault items
 * or collections whose deleted_at is older than 30 days.
 *
 * Called on Trash page mount. Silent cleanup (no user toast).
 */
export async function autoPurgeExpired(
  userId: string
): Promise<{ vault: number; collections: number }> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS).toISOString();
  const supabase = getClient();

  const { data: purgedVault, error: vaultErr } = await supabase
    .from("vault")
    .delete()
    .eq("user_id", userId)
    .lt("deleted_at", cutoff)
    .select("id");
  if (vaultErr) {
    console.error("[trashAdapter] Error auto-purging vault:", vaultErr);
  }

  const { data: expiredCols, error: colFetchErr } = await supabase
    .from("collections")
    .select("id")
    .eq("user_id", userId)
    .lt("deleted_at", cutoff);
  if (colFetchErr) {
    console.error(
      "[trashAdapter] Error fetching expired collections:",
      colFetchErr
    );
  }
  const colIds = (expiredCols ?? []).map((r: { id: string }) => r.id);
  if (colIds.length > 0) {
    const { error: entriesErr } = await supabase
      .from("collection_entries")
      .delete()
      .in("collection_id", colIds);
    if (entriesErr)
      console.warn(
        "[trashAdapter] Failed to cascade-delete entries during purge:",
        entriesErr
      );
    const { error: colDelErr } = await supabase
      .from("collections")
      .delete()
      .in("id", colIds);
    if (colDelErr)
      console.error(
        "[trashAdapter] Error auto-purging collections:",
        colDelErr
      );
  }

  return {
    vault: purgedVault?.length ?? 0,
    collections: colIds.length
  };
}

// Re-export restore operations for convenience
export { restoreVaultItemInSupabase, restoreCollectionInSupabase };
