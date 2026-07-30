// src/lib/supabase/repositories/trash.ts
//
// Trash Repository — the single source of truth for soft-deleted vault
// items and collections. This module is a clean facade over the
// existing trashAdapter (which holds the Supabase query logic), so
// callers can import from the standard ~/lib/supabase/repositories/
// path without us duplicating the underlying queries.
//
// Two retention policies are enforced here:
//   1. Soft-deleted rows keep `deleted_at` set for 30 days.
//   2. After 30 days, rows are auto-purged (hard-deleted) the next
//      time the user opens the Trash page. There is no server cron —
//      autoPurgeExpired runs client-side on page mount.
//
// All functions are RLS-aware (Supabase enforces user_id = auth.uid())
// and never throw — they return [] / 0 / false on error so the UI can
// degrade gracefully when Supabase is unreachable.
//
// Types are re-exported from trashAdapter so consumers don't need to
// know which file holds the actual implementation.

export {
  // Types
  type TrashedVaultItem,
  type TrashedCollection,
  TRASH_RETENTION_MS,
  // Reads
  fetchTrashedVaultItems,
  fetchTrashedCollections,
  // Restores (clear deleted_at)
  restoreVaultItemInSupabase as restoreItem,
  restoreCollectionInSupabase as restoreCollection,
  // Hard deletes
  hardDeleteVaultItem as deletePermanently,
  hardDeleteCollection as deleteCollectionPermanently,
  // Bulk operations
  clearAllTrash,
  autoPurgeExpired,
} from "~/features/trash/trashAdapter";

// Re-export the underlying adapter for callers that need every symbol.
export {
  restoreVaultItemInSupabase,
  restoreCollectionInSupabase,
  hardDeleteVaultItem,
  hardDeleteCollection,
} from "~/features/trash/trashAdapter";

/**
 * Restore all trashed items for a user (vault + collections).
 *
 * Returns the count of items restored. Used by the "Restore All"
 * action in the Trash page action bar.
 *
 * Implementation note: we iterate sequentially rather than
 * Promise.all'ing to avoid hammering Supabase with N concurrent
 * writes (which can trigger rate limits). The trade-off is latency
 * (50ms × N) over throughput — acceptable for an explicit user
 * action that already shows a loading state.
 */
export async function restoreAllTrash(
  userId: string,
  vaultItems: Array<{ id: string; media_type: "movie" | "tv" }>,
  collections: Array<{ id: string }>,
): Promise<{ vault: number; collections: number }> {
  // Lazy import to avoid a circular dependency at module load time
  // (trashAdapter imports from features/watchlist + features/collections).
  const { restoreVaultItemInSupabase, restoreCollectionInSupabase } =
    await import("~/features/trash/trashAdapter");

  let vaultOk = 0;
  let colOk = 0;

  for (const item of vaultItems) {
    try {
      await restoreVaultItemInSupabase(userId, item.id, item.media_type);
      vaultOk++;
    } catch (err) {
      console.error("[trashRepository] restoreAll: vault item failed:", item.id, err);
    }
  }

  for (const col of collections) {
    try {
      await restoreCollectionInSupabase(col.id);
      colOk++;
    } catch (err) {
      console.error("[trashRepository] restoreAll: collection failed:", col.id, err);
    }
  }

  return { vault: vaultOk, collections: colOk };
}
