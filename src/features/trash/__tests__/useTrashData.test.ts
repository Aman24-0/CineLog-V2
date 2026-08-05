// src/features/trash/__tests__/useTrashData.test.ts
//
// Tests for the useTrashData Solid hook.
//
// Strategy: use createRoot to provide a reactive owner, then drive the
// hook with a mutable uid accessor. Mock the trashAdapter module so
// each test controls what the Supabase-facing layer returns.
//
// We test:
//   • Initial load (with auto-purge on first load only)
//   • Subsequent refetch (skips auto-purge)
//   • Mutators (restore / hard-delete / clear-all) update local state
//     optimistically on success
//   • busy guard prevents concurrent mutations
//   • groupedItems buckets by Today / Yesterday / This Week / Older
//   • totalCount sums vault + collection counts
//   • No-op when uid is null

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, createSignal } from "solid-js";

// --- Hoisted mock for the trashAdapter ---

const {
  mockFetchTrashedVaultItems,
  mockFetchTrashedCollections,
  mockHardDeleteVaultItem,
  mockHardDeleteCollection,
  mockClearAllTrash,
  mockAutoPurgeExpired,
  mockRestoreVaultItem,
  mockRestoreCollection
} = vi.hoisted(() => ({
  mockFetchTrashedVaultItems: vi.fn().mockResolvedValue([]),
  mockFetchTrashedCollections: vi.fn().mockResolvedValue([]),
  mockHardDeleteVaultItem: vi.fn().mockResolvedValue(undefined),
  mockHardDeleteCollection: vi.fn().mockResolvedValue(undefined),
  mockClearAllTrash: vi.fn().mockResolvedValue({ vault: 0, collections: 0 }),
  mockAutoPurgeExpired: vi.fn().mockResolvedValue({ vault: 0, collections: 0 }),
  mockRestoreVaultItem: vi.fn().mockResolvedValue(undefined),
  mockRestoreCollection: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("~/features/trash/trashAdapter", () => ({
  fetchTrashedVaultItems: mockFetchTrashedVaultItems,
  fetchTrashedCollections: mockFetchTrashedCollections,
  hardDeleteVaultItem: mockHardDeleteVaultItem,
  hardDeleteCollection: mockHardDeleteCollection,
  clearAllTrash: mockClearAllTrash,
  autoPurgeExpired: mockAutoPurgeExpired,
  restoreVaultItemInSupabase: mockRestoreVaultItem,
  restoreCollectionInSupabase: mockRestoreCollection,
  // Re-export the type for compile-time only.
  TRASH_RETENTION_MS: 30 * 24 * 60 * 60 * 1000
}));

// --- Import the hook AFTER mocks ---

import { useTrashData } from "../hooks/useTrashData";
import type { TrashedVaultItem, TrashedCollection } from "../trashAdapter";

// ---------------------------------------------------------------------------
// Helpers — build trashed items with sensible defaults.
// ---------------------------------------------------------------------------

function makeTrashedVault(overrides: Partial<TrashedVaultItem> = {}): TrashedVaultItem {
  return {
    id: "1",
    media_type: "movie",
    title: "Test Movie",
    status: "Planned",
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    notes: "",
    genresList: [],
    platformsList: [],
    deletedAt: new Date().toISOString(), // today by default
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides
  } as TrashedVaultItem;
}

function makeTrashedCollection(
  overrides: Partial<TrashedCollection> = {}
): TrashedCollection {
  return {
    id: "col-1",
    name: "Test Collection",
    collectionType: "user",
    deletedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    entryCount: 0,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default resolved values after each test.
  mockFetchTrashedVaultItems.mockResolvedValue([]);
  mockFetchTrashedCollections.mockResolvedValue([]);
  mockHardDeleteVaultItem.mockResolvedValue(undefined);
  mockHardDeleteCollection.mockResolvedValue(undefined);
  mockClearAllTrash.mockResolvedValue({ vault: 0, collections: 0 });
  mockAutoPurgeExpired.mockResolvedValue({ vault: 0, collections: 0 });
  mockRestoreVaultItem.mockResolvedValue(undefined);
  mockRestoreCollection.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper: run the hook inside a reactive root + flush onMount microtasks.
// ---------------------------------------------------------------------------

async function mountHook(
  uid: () => string | null,
  cb: (api: ReturnType<typeof useTrashData>) => Promise<void>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    createRoot(async (dispose) => {
      try {
        const api = useTrashData(uid);
        // Flush onMount + the resulting async load.
        await new Promise((r) => setTimeout(r, 0));
        await cb(api);
        dispose();
        resolve();
      } catch (err) {
        dispose();
        reject(err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Initial load + auto-purge
// ---------------------------------------------------------------------------

describe("useTrashData — initial load", () => {
  it("calls autoPurgeExpired on the initial load", async () => {
    await mountHook(() => "user-1", async (api) => {
      expect(mockAutoPurgeExpired).toHaveBeenCalledWith("user-1");
      expect(api.loading()).toBe(false);
    });
  });

  it("loads vault items + collections in parallel after purge", async () => {
    mockFetchTrashedVaultItems.mockResolvedValueOnce([makeTrashedVault({ id: "1" })]);
    mockFetchTrashedCollections.mockResolvedValueOnce([
      makeTrashedCollection({ id: "col-1" })
    ]);

    await mountHook(() => "user-1", async (api) => {
      expect(mockFetchTrashedVaultItems).toHaveBeenCalledWith("user-1");
      expect(mockFetchTrashedCollections).toHaveBeenCalledWith("user-1");
      expect(api.vaultItems()).toHaveLength(1);
      expect(api.collections()).toHaveLength(1);
      expect(api.totalCount()).toBe(2);
    });
  });

  it("sets error when load throws", async () => {
    mockFetchTrashedVaultItems.mockRejectedValueOnce(new Error("network down"));

    await mountHook(() => "user-1", async (api) => {
      expect(api.error()).toBeInstanceOf(Error);
      expect(api.error()?.message).toBe("network down");
      expect(api.loading()).toBe(false);
    });
  });

  it("skips auto-purge + fetch when uid is null", async () => {
    await mountHook(() => null, async (api) => {
      expect(mockAutoPurgeExpired).not.toHaveBeenCalled();
      expect(mockFetchTrashedVaultItems).not.toHaveBeenCalled();
      expect(api.loading()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// refetch (skips auto-purge on subsequent loads)
// ---------------------------------------------------------------------------

describe("useTrashData — refetch", () => {
  it("skips autoPurgeExpired on subsequent refetch() calls", async () => {
    await mountHook(() => "user-1", async (api) => {
      expect(mockAutoPurgeExpired).toHaveBeenCalledTimes(1);
      await api.refetch();
      expect(mockAutoPurgeExpired).toHaveBeenCalledTimes(1); // still 1
      expect(mockFetchTrashedVaultItems).toHaveBeenCalledTimes(2); // 2 fetches
    });
  });
});

// ---------------------------------------------------------------------------
// restoreVaultItem
// ---------------------------------------------------------------------------

describe("useTrashData — restoreVaultItem", () => {
  it("removes the item from the local list on success", async () => {
    const item1 = makeTrashedVault({ id: "1" });
    const item2 = makeTrashedVault({ id: "2" });
    mockFetchTrashedVaultItems.mockResolvedValueOnce([item1, item2]);

    await mountHook(() => "user-1", async (api) => {
      expect(api.vaultItems()).toHaveLength(2);
      const ok = await api.restoreVaultItem(item1);
      expect(ok).toBe(true);
      expect(api.vaultItems()).toHaveLength(1);
      expect(api.vaultItems()[0].id).toBe("2");
    });
  });

  it("returns false + leaves item in list on failure", async () => {
    const item = makeTrashedVault({ id: "1" });
    mockFetchTrashedVaultItems.mockResolvedValueOnce([item]);
    mockRestoreVaultItem.mockRejectedValueOnce(new Error("restore failed"));

    await mountHook(() => "user-1", async (api) => {
      const ok = await api.restoreVaultItem(item);
      expect(ok).toBe(false);
      expect(api.vaultItems()).toHaveLength(1); // still there
    });
  });

  it("returns false when uid is null", async () => {
    const item = makeTrashedVault();
    await mountHook(() => null, async (api) => {
      const ok = await api.restoreVaultItem(item);
      expect(ok).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// restoreCollection
// ---------------------------------------------------------------------------

describe("useTrashData — restoreCollection", () => {
  it("removes the collection from the local list on success", async () => {
    const col1 = makeTrashedCollection({ id: "col-1" });
    const col2 = makeTrashedCollection({ id: "col-2" });
    mockFetchTrashedCollections.mockResolvedValueOnce([col1, col2]);

    await mountHook(() => "user-1", async (api) => {
      expect(api.collections()).toHaveLength(2);
      const ok = await api.restoreCollection(col1);
      expect(ok).toBe(true);
      expect(api.collections()).toHaveLength(1);
      expect(api.collections()[0].id).toBe("col-2");
    });
  });

  it("returns false on failure", async () => {
    const col = makeTrashedCollection({ id: "col-1" });
    mockFetchTrashedCollections.mockResolvedValueOnce([col]);
    mockRestoreCollection.mockRejectedValueOnce(new Error("restore failed"));

    await mountHook(() => "user-1", async (api) => {
      const ok = await api.restoreCollection(col);
      expect(ok).toBe(false);
      expect(api.collections()).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// restoreAll
// ---------------------------------------------------------------------------

describe("useTrashData — restoreAll", () => {
  it("restores every vault item + collection sequentially and clears the lists", async () => {
    mockFetchTrashedVaultItems.mockResolvedValueOnce([
      makeTrashedVault({ id: "1" }),
      makeTrashedVault({ id: "2" })
    ]);
    mockFetchTrashedCollections.mockResolvedValueOnce([
      makeTrashedCollection({ id: "col-1" })
    ]);

    await mountHook(() => "user-1", async (api) => {
      const counts = await api.restoreAll();
      expect(counts).toEqual({ vault: 2, collections: 1 });
      expect(api.vaultItems()).toHaveLength(0);
      expect(api.collections()).toHaveLength(0);
    });
  });

  it("counts partial successes when some restores fail", async () => {
    mockFetchTrashedVaultItems.mockResolvedValueOnce([
      makeTrashedVault({ id: "1" }),
      makeTrashedVault({ id: "2" })
    ]);
    mockFetchTrashedCollections.mockResolvedValueOnce([]);
    mockRestoreVaultItem
      .mockResolvedValueOnce(undefined) // success
      .mockRejectedValueOnce(new Error("fail")); // fail

    await mountHook(() => "user-1", async (api) => {
      const counts = await api.restoreAll();
      expect(counts).toEqual({ vault: 1, collections: 0 });
    });
  });

  it("returns zeros when uid is null", async () => {
    await mountHook(() => null, async (api) => {
      const counts = await api.restoreAll();
      expect(counts).toEqual({ vault: 0, collections: 0 });
    });
  });
});

// ---------------------------------------------------------------------------
// deleteVaultItemPermanently
// ---------------------------------------------------------------------------

describe("useTrashData — deleteVaultItemPermanently", () => {
  it("removes the item from the local list on success", async () => {
    const item = makeTrashedVault({ id: "1" });
    mockFetchTrashedVaultItems.mockResolvedValueOnce([item]);

    await mountHook(() => "user-1", async (api) => {
      const ok = await api.deleteVaultItemPermanently(item);
      expect(ok).toBe(true);
      expect(mockHardDeleteVaultItem).toHaveBeenCalledWith("user-1", "1", "movie");
      expect(api.vaultItems()).toHaveLength(0);
    });
  });

  it("returns false + leaves item on failure", async () => {
    const item = makeTrashedVault({ id: "1" });
    mockFetchTrashedVaultItems.mockResolvedValueOnce([item]);
    mockHardDeleteVaultItem.mockRejectedValueOnce(new Error("delete failed"));

    await mountHook(() => "user-1", async (api) => {
      const ok = await api.deleteVaultItemPermanently(item);
      expect(ok).toBe(false);
      expect(api.vaultItems()).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// deleteCollectionPermanently
// ---------------------------------------------------------------------------

describe("useTrashData — deleteCollectionPermanently", () => {
  it("removes the collection from the local list on success", async () => {
    const col = makeTrashedCollection({ id: "col-1" });
    mockFetchTrashedCollections.mockResolvedValueOnce([col]);

    await mountHook(() => "user-1", async (api) => {
      const ok = await api.deleteCollectionPermanently(col);
      expect(ok).toBe(true);
      expect(mockHardDeleteCollection).toHaveBeenCalledWith("col-1");
      expect(api.collections()).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// clearAll
// ---------------------------------------------------------------------------

describe("useTrashData — clearAll", () => {
  it("clears both lists and returns counts on success", async () => {
    mockFetchTrashedVaultItems.mockResolvedValueOnce([makeTrashedVault()]);
    mockFetchTrashedCollections.mockResolvedValueOnce([makeTrashedCollection()]);
    mockClearAllTrash.mockResolvedValueOnce({ vault: 1, collections: 1 });

    await mountHook(() => "user-1", async (api) => {
      expect(api.totalCount()).toBe(2);
      const counts = await api.clearAll();
      expect(counts).toEqual({ vault: 1, collections: 1 });
      expect(api.totalCount()).toBe(0);
    });
  });

  it("returns zeros on failure but does NOT clear lists", async () => {
    mockFetchTrashedVaultItems.mockResolvedValueOnce([makeTrashedVault()]);
    mockFetchTrashedCollections.mockResolvedValueOnce([]);
    mockClearAllTrash.mockRejectedValueOnce(new Error("clear failed"));

    await mountHook(() => "user-1", async (api) => {
      const counts = await api.clearAll();
      expect(counts).toEqual({ vault: 0, collections: 0 });
      // The lists are NOT cleared on failure — items still in trash.
      expect(api.vaultItems()).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// busy guard
// ---------------------------------------------------------------------------

describe("useTrashData — busy guard", () => {
  it("prevents concurrent mutations (subsequent calls return early)", async () => {
    const item = makeTrashedVault({ id: "1" });
    mockFetchTrashedVaultItems.mockResolvedValueOnce([item]);
    // Make the first call slow.
    let resolveFirst: (() => void) | null = null;
    mockRestoreVaultItem.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        resolveFirst = resolve;
      })
    );

    await mountHook(() => "user-1", async (api) => {
      // Kick off the first restore.
      const firstPromise = api.restoreVaultItem(item);
      // Wait a tick so the first call sets busy=true.
      await new Promise((r) => setTimeout(r, 0));

      // While busy, a second restore should return false immediately.
      const secondResult = await api.restoreVaultItem(item);
      expect(secondResult).toBe(false);

      // Also test clearAll while busy.
      const clearResult = await api.clearAll();
      expect(clearResult).toEqual({ vault: 0, collections: 0 });

      // Resolve the first call.
      resolveFirst?.();
      const firstResult = await firstPromise;
      expect(firstResult).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// groupedItems (date bucketing)
// ---------------------------------------------------------------------------

describe("useTrashData — groupedItems", () => {
  it("returns [] when there are no items", async () => {
    await mountHook(() => "user-1", async (api) => {
      expect(api.groupedItems()).toEqual([]);
    });
  });

  it("buckets items into Today / Yesterday / This Week / Older", async () => {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const thisWeek = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    const older = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    mockFetchTrashedVaultItems.mockResolvedValueOnce([
      makeTrashedVault({ id: "1", deletedAt: today.toISOString() }),
      makeTrashedVault({ id: "2", deletedAt: yesterday.toISOString() }),
      makeTrashedVault({ id: "3", deletedAt: thisWeek.toISOString() }),
      makeTrashedVault({ id: "4", deletedAt: older.toISOString() })
    ]);

    await mountHook(() => "user-1", async (api) => {
      const groups = api.groupedItems();
      expect(groups).toHaveLength(4);
      expect(groups[0].key).toBe("today");
      expect(groups[0].vaultItems).toHaveLength(1);
      expect(groups[1].key).toBe("yesterday");
      expect(groups[2].key).toBe("this_week");
      expect(groups[3].key).toBe("older");
    });
  });

  it("skips empty buckets (only non-empty groups appear)", async () => {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const older = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    mockFetchTrashedVaultItems.mockResolvedValueOnce([
      makeTrashedVault({ id: "1", deletedAt: today.toISOString() })
    ]);
    mockFetchTrashedCollections.mockResolvedValueOnce([
      makeTrashedCollection({ id: "col-1", deletedAt: older.toISOString() })
    ]);

    await mountHook(() => "user-1", async (api) => {
      const groups = api.groupedItems();
      // Only "today" and "older" should appear — yesterday + this_week
      // are empty and should be filtered out.
      expect(groups).toHaveLength(2);
      expect(groups[0].key).toBe("today");
      expect(groups[0].vaultItems).toHaveLength(1);
      expect(groups[1].key).toBe("older");
      expect(groups[1].collections).toHaveLength(1);
    });
  });

  it("preserves most-recent-first ordering within each bucket", async () => {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const todayItemA = makeTrashedVault({
      id: "1",
      deletedAt: new Date(today.getTime() + 1000).toISOString()
    });
    const todayItemB = makeTrashedVault({
      id: "2",
      deletedAt: new Date(today.getTime() + 2000).toISOString()
    });

    mockFetchTrashedVaultItems.mockResolvedValueOnce([todayItemA, todayItemB]);

    await mountHook(() => "user-1", async (api) => {
      const groups = api.groupedItems();
      expect(groups[0].vaultItems[0].id).toBe("1");
      expect(groups[0].vaultItems[1].id).toBe("2");
    });
  });
});

// ---------------------------------------------------------------------------
// totalCount
// ---------------------------------------------------------------------------

describe("useTrashData — totalCount", () => {
  it("sums vault items + collections", async () => {
    mockFetchTrashedVaultItems.mockResolvedValueOnce([
      makeTrashedVault(),
      makeTrashedVault({ id: "2" }),
      makeTrashedVault({ id: "3" })
    ]);
    mockFetchTrashedCollections.mockResolvedValueOnce([
      makeTrashedCollection(),
      makeTrashedCollection({ id: "col-2" })
    ]);

    await mountHook(() => "user-1", async (api) => {
      expect(api.totalCount()).toBe(5);
    });
  });
});
