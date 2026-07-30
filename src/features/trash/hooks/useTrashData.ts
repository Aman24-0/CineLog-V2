// src/features/trash/hooks/useTrashData.ts
//
// useTrashData — fetches, manages, and exposes the user's trashed
// vault items and collections.
//
// The hook owns the fetch state (loading / error / data) and exposes
// imperative mutators that perform the actual restore / hard-delete /
// clear-all operations. Each mutator returns true on success and false
// on error so the caller can show a toast of the right variant. The
// mutator ALSO updates the local data signals optimistically-on-success
// (removing the item from the list) so the UI updates instantly
// without waiting for a full refetch.
//
// Auto-purge: on first load, expired items (deleted_at > 30 days ago)
// are hard-deleted silently before the list is shown. This keeps the
// Trash page honest — items past their retention window never appear.
//
// Architecture:
//   TrashPage → useTrashData → trashAdapter → Supabase
//

import { createSignal, onMount, createMemo, type Accessor } from "solid-js";
import {
  fetchTrashedVaultItems,
  fetchTrashedCollections,
  hardDeleteVaultItem,
  hardDeleteCollection,
  clearAllTrash,
  autoPurgeExpired,
  restoreVaultItemInSupabase,
  restoreCollectionInSupabase,
  type TrashedVaultItem,
  type TrashedCollection,
} from "~/features/trash/trashAdapter";

export interface UseTrashDataResult {
  /** Trashed vault items (titles), most recently deleted first. */
  vaultItems: Accessor<TrashedVaultItem[]>;
  /** Trashed collections (folders), most recently deleted first. */
  collections: Accessor<TrashedCollection[]>;
  /** All trashed items grouped by deletion date bucket. */
  groupedItems: Accessor<TrashGroup[]>;
  /** True while the initial load is in flight. */
  loading: Accessor<boolean>;
  /** Error from the last load attempt (null on success). */
  error: Accessor<Error | null>;
  /** True while any mutation is in flight (restore / delete / clear). */
  busy: Accessor<boolean>;
  /** Total count of trashed items (vault + collections). */
  totalCount: Accessor<number>;

  /** Re-run the full fetch (auto-purge + load). */
  refetch: () => Promise<void>;

  /** Restore a single vault item. Returns true on success. */
  restoreVaultItem: (item: TrashedVaultItem) => Promise<boolean>;
  /** Restore a single collection. Returns true on success. */
  restoreCollection: (col: TrashedCollection) => Promise<boolean>;
  /** Restore every trashed item. Returns counts. */
  restoreAll: () => Promise<{ vault: number; collections: number }>;
  /** Permanently delete a single vault item. Returns true on success. */
  deleteVaultItemPermanently: (item: TrashedVaultItem) => Promise<boolean>;
  /** Permanently delete a single collection. Returns true on success. */
  deleteCollectionPermanently: (col: TrashedCollection) => Promise<boolean>;
  /** Permanently delete every trashed item. Returns counts. */
  clearAll: () => Promise<{ vault: number; collections: number }>;
}

export type TrashGroupKey = "today" | "yesterday" | "this_week" | "older";

export interface TrashGroup {
  key: TrashGroupKey;
  label: string;
  vaultItems: TrashedVaultItem[];
  collections: TrashedCollection[];
}

const GROUP_LABELS: Record<TrashGroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  older: "Older",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function bucketForDeletedAt(deletedAt: string): TrashGroupKey {
  const now = startOfDay(new Date());
  const d = startOfDay(new Date(deletedAt));
  const diffDays = Math.round(
    (now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 7) return "this_week";
  return "older";
}

/**
 * useTrashData — owns the trash state for the Trash page.
 *
 * @param uid  Accessor returning the current user's uid, or null when
 *             signed out. The hook no-ops while uid is null.
 */
export function useTrashData(uid: Accessor<string | null>): UseTrashDataResult {
  const [vaultItems, setVaultItems] = createSignal<TrashedVaultItem[]>([]);
  const [collections, setCollections] = createSignal<TrashedCollection[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | null>(null);
  const [busy, setBusy] = createSignal(false);

  const load = async () => {
    const userId = uid();
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // Auto-purge expired items silently before listing.
    try {
      await autoPurgeExpired(userId);
    } catch (err) {
      // Auto-purge failures are non-fatal — we still want to show
      // whatever's in the trash. Log and continue.
      console.warn("[useTrashData] Auto-purge failed:", err);
    }

    try {
      const [vItems, cols] = await Promise.all([
        fetchTrashedVaultItems(userId),
        fetchTrashedCollections(userId),
      ]);
      setVaultItems(vItems);
      setCollections(cols);
    } catch (err) {
      console.error("[useTrashData] Failed to load trash:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void load();
  });

  const totalCount = createMemo(
    () => vaultItems().length + collections().length,
  );

  // Group all items by deletion date bucket. Each group preserves the
  // ordering from the underlying signals (most recently deleted first).
  const groupedItems = createMemo<TrashGroup[]>(() => {
    const v = vaultItems();
    const c = collections();
    if (v.length === 0 && c.length === 0) return [];

    const buckets: Record<TrashGroupKey, {
      vaultItems: TrashedVaultItem[];
      collections: TrashedCollection[];
    }> = {
      today: { vaultItems: [], collections: [] },
      yesterday: { vaultItems: [], collections: [] },
      this_week: { vaultItems: [], collections: [] },
      older: { vaultItems: [], collections: [] },
    };

    for (const item of v) {
      buckets[bucketForDeletedAt(item.deletedAt)].vaultItems.push(item);
    }
    for (const col of c) {
      buckets[bucketForDeletedAt(col.deletedAt)].collections.push(col);
    }

    return (Object.keys(buckets) as TrashGroupKey[])
      .filter((k) => buckets[k].vaultItems.length > 0 || buckets[k].collections.length > 0)
      .map((k) => ({
        key: k,
        label: GROUP_LABELS[k],
        vaultItems: buckets[k].vaultItems,
        collections: buckets[k].collections,
      }));
  });

  // ── Mutators ────────────────────────────────────────────────
  // Each mutator sets `busy`, performs the operation, and on success
  // removes the affected item(s) from the local signals so the UI
  // updates instantly. Returns true/false (or counts) so the caller
  // can show the appropriate toast.

  const restoreVaultItem = async (item: TrashedVaultItem): Promise<boolean> => {
    const userId = uid();
    if (!userId || busy()) return false;
    setBusy(true);
    try {
      await restoreVaultItemInSupabase(userId, item.id, item.media_type);
      setVaultItems((prev) => prev.filter((v) => v.id !== item.id));
      return true;
    } catch (err) {
      console.error("[useTrashData] Restore vault item failed:", err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const restoreCollection = async (col: TrashedCollection): Promise<boolean> => {
    if (busy()) return false;
    setBusy(true);
    try {
      await restoreCollectionInSupabase(col.id);
      setCollections((prev) => prev.filter((c) => c.id !== col.id));
      return true;
    } catch (err) {
      console.error("[useTrashData] Restore collection failed:", err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const restoreAll = async (): Promise<{ vault: number; collections: number }> => {
    const userId = uid();
    if (!userId || busy()) return { vault: 0, collections: 0 };
    setBusy(true);
    let vaultOk = 0;
    let colOk = 0;
    try {
      // Sequential restores to avoid Supabase write-rate limits.
      for (const item of vaultItems()) {
        try {
          await restoreVaultItemInSupabase(userId, item.id, item.media_type);
          vaultOk++;
        } catch (err) {
          console.error("[useTrashData] restoreAll: vault item failed:", item.id, err);
        }
      }
      for (const col of collections()) {
        try {
          await restoreCollectionInSupabase(col.id);
          colOk++;
        } catch (err) {
          console.error("[useTrashData] restoreAll: collection failed:", col.id, err);
        }
      }
      // Optimistically clear the lists — every item that succeeded
      // is gone from the trash; the ones that failed are still in
      // Supabase but we'll see them again on next refetch. For UX,
      // clearing is better than leaving stale items visible.
      setVaultItems([]);
      setCollections([]);
      return { vault: vaultOk, collections: colOk };
    } finally {
      setBusy(false);
    }
  };

  const deleteVaultItemPermanently = async (
    item: TrashedVaultItem,
  ): Promise<boolean> => {
    const userId = uid();
    if (!userId || busy()) return false;
    setBusy(true);
    try {
      await hardDeleteVaultItem(userId, item.id, item.media_type);
      setVaultItems((prev) => prev.filter((v) => v.id !== item.id));
      return true;
    } catch (err) {
      console.error("[useTrashData] Hard-delete vault item failed:", err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const deleteCollectionPermanently = async (
    col: TrashedCollection,
  ): Promise<boolean> => {
    if (busy()) return false;
    setBusy(true);
    try {
      await hardDeleteCollection(col.id);
      setCollections((prev) => prev.filter((c) => c.id !== col.id));
      return true;
    } catch (err) {
      console.error("[useTrashData] Hard-delete collection failed:", err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async (): Promise<{ vault: number; collections: number }> => {
    const userId = uid();
    if (!userId || busy()) return { vault: 0, collections: 0 };
    setBusy(true);
    try {
      const counts = await clearAllTrash(userId);
      setVaultItems([]);
      setCollections([]);
      return counts;
    } catch (err) {
      console.error("[useTrashData] Clear all failed:", err);
      return { vault: 0, collections: 0 };
    } finally {
      setBusy(false);
    }
  };

  return {
    vaultItems,
    collections,
    groupedItems,
    loading,
    error,
    busy,
    totalCount,
    refetch: load,
    restoreVaultItem,
    restoreCollection,
    restoreAll,
    deleteVaultItemPermanently,
    deleteCollectionPermanently,
    clearAll,
  };
}
