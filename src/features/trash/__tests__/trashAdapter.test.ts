// src/features/trash/__tests__/trashAdapter.test.ts
//
// Unit tests for the Trash adapter — the Supabase-facing functions that
// fetch / hard-delete / restore soft-deleted vault items and collections.
//
// Mock strategy: stub `~/lib/supabase/client` with a chainable query
// builder. Stub `~/features/watchlist/vaultReadAdapter` and
// `~/core/tmdb/tmdb` so the adapter's pure logic can be tested in
// isolation.

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---

const { mockFrom, chain, mockFetchTmdbMetadataBatch, mockVaultRowToWatchlistItem, mockRestoreVaultItem, mockRestoreCollection } =
  vi.hoisted(() => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    // Self-referential builder.
    const rebuild = () => {
      const methods = [
        "select", "insert", "update", "upsert", "delete",
        "eq", "neq", "is", "not", "or", "in", "ilike",
        "order", "limit", "range", "lt", "gt", "gte", "lte"
      ];
      for (const m of methods) {
        chain[m] = vi.fn(() => chain);
      }
      // Terminal methods.
      chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
      chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
      // Thenable — awaiting the chain returns the list result.
      chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
      );
      chain.catch = vi.fn(() => Promise.resolve({ data: [], error: null }));
    };
    rebuild();
    return {
      mockFrom: vi.fn(() => chain),
      chain,
      mockFetchTmdbMetadataBatch: vi.fn().mockResolvedValue(new Map()),
      mockVaultRowToWatchlistItem: vi.fn((row: unknown) => ({
        id: String((row as { tmdb_id: number }).tmdb_id),
        media_type: (row as { media_type: "movie" | "tv" }).media_type,
        status: "Planned",
        addedAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        notes: "",
        genresList: [],
        platformsList: []
      })),
      mockRestoreVaultItem: vi.fn().mockResolvedValue(undefined),
      mockRestoreCollection: vi.fn().mockResolvedValue(undefined)
    };
  });

vi.mock("~/lib/supabase/client", () => ({
  getClient: () => ({ from: mockFrom })
}));

vi.mock("~/features/watchlist/vaultReadAdapter", () => ({
  vaultRowToWatchlistItem: mockVaultRowToWatchlistItem
}));

vi.mock("~/core/tmdb/tmdb", () => ({
  fetchTmdbMetadataBatch: mockFetchTmdbMetadataBatch
}));

vi.mock("~/features/watchlist/vaultAdapter", () => ({
  restoreVaultItemInSupabase: mockRestoreVaultItem
}));

vi.mock("~/features/collections/collectionAdapter", () => ({
  restoreCollectionInSupabase: mockRestoreCollection
}));

// --- Import AFTER mocks ---

import {
  fetchTrashedVaultItems,
  fetchTrashedCollections,
  hardDeleteVaultItem,
  hardDeleteCollection,
  clearAllTrash,
  autoPurgeExpired,
  TRASH_RETENTION_MS
} from "../trashAdapter";

// Reset the chain between tests so each test can install fresh return values.
function resetChain(): void {
  for (const m of Object.values(chain)) {
    if (typeof m === "function" && "mockClear" in m) {
      (m as ReturnType<typeof vi.fn>).mockClear();
    }
  }
  // Restore default thenable behavior.
  chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve)
  );
  chain.catch = vi.fn(() => Promise.resolve({ data: [], error: null }));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetChain();
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("TRASH_RETENTION_MS", () => {
  it("is 30 days in milliseconds", () => {
    expect(TRASH_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(TRASH_RETENTION_MS).toBe(2_592_000_000);
  });
});

// ---------------------------------------------------------------------------
// fetchTrashedVaultItems
// ---------------------------------------------------------------------------

describe("fetchTrashedVaultItems", () => {
  it("returns [] when Supabase returns an error", async () => {
    chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: new Error("network") }).then(resolve)
    );
    const result = await fetchTrashedVaultItems("user-1");
    expect(result).toEqual([]);
  });

  it("returns [] when Supabase returns an empty array", async () => {
    chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve)
    );
    const result = await fetchTrashedVaultItems("user-1");
    expect(result).toEqual([]);
  });

  it("maps each VaultRow to a TrashedVaultItem with deletedAt + expiresAt", async () => {
    const deletedAt = "2026-01-01T00:00:00.000Z";
    const row = {
      id: "vault-uuid-1",
      user_id: "user-1",
      tmdb_id: 123,
      media_type: "movie",
      status: "planned",
      deleted_at: deletedAt,
      created_at: deletedAt,
      updated_at: deletedAt
    };
    chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [row], error: null }).then(resolve)
    );

    const result = await fetchTrashedVaultItems("user-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("123");
    expect(result[0].deletedAt).toBe(deletedAt);
    // expiresAt = deletedAt + 30 days.
    const expectedExpires = new Date(
      new Date(deletedAt).getTime() + TRASH_RETENTION_MS
    ).toISOString();
    expect(result[0].expiresAt).toBe(expectedExpires);
  });

  it("enriches items with TMDB metadata when batch fetch succeeds", async () => {
    const row = {
      id: "vault-1",
      user_id: "user-1",
      tmdb_id: 123,
      media_type: "movie",
      status: "planned",
      deleted_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z"
    };
    chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [row], error: null }).then(resolve)
    );
    const tmdbMap = new Map([
      ["movie/123", { title: "Enriched Title", poster_path: "/p.jpg", backdrop_path: "/b.jpg" }]
    ]);
    mockFetchTmdbMetadataBatch.mockResolvedValueOnce(tmdbMap);

    const result = await fetchTrashedVaultItems("user-1");
    expect(result[0].title).toBe("Enriched Title");
    expect(result[0].poster_path).toBe("/p.jpg");
    expect(result[0].backdrop_path).toBe("/b.jpg");
  });

  it("returns unenriched items when TMDB batch fetch throws", async () => {
    const row = {
      id: "vault-1",
      user_id: "user-1",
      tmdb_id: 123,
      media_type: "movie",
      status: "planned",
      deleted_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z"
    };
    chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [row], error: null }).then(resolve)
    );
    mockFetchTmdbMetadataBatch.mockRejectedValueOnce(new Error("tmdb down"));

    const result = await fetchTrashedVaultItems("user-1");
    // Item still returned, just without TMDB enrichment.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("123");
  });
});

// ---------------------------------------------------------------------------
// fetchTrashedCollections
// ---------------------------------------------------------------------------

describe("fetchTrashedCollections", () => {
  it("returns [] on Supabase error", async () => {
    chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: new Error("fail") }).then(resolve)
    );
    const result = await fetchTrashedCollections("user-1");
    expect(result).toEqual([]);
  });

  it("returns [] when there are no trashed collections", async () => {
    chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve)
    );
    const result = await fetchTrashedCollections("user-1");
    expect(result).toEqual([]);
  });

  it("fetches entry counts for each trashed collection in parallel", async () => {
    const rows = [
      {
        id: "col-1",
        user_id: "user-1",
        name: "Favorites",
        collection_type: "user",
        deleted_at: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "col-2",
        user_id: "user-1",
        name: "Watchlist",
        collection_type: "user",
        deleted_at: "2026-01-02T00:00:00.000Z"
      }
    ];
    // First thenable = list of collections.
    // Then for each row, the count query is called via .select("id", {count, head}).
    // That chain is also thenable.
    let callIndex = 0;
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      callIndex++;
      if (callIndex === 1) {
        // The collections list query.
        Promise.resolve({ data: rows, error: null }).then(resolve);
      } else {
        // The count queries (one per collection).
        Promise.resolve({ count: 5, error: null }).then(resolve);
      }
    });

    const result = await fetchTrashedCollections("user-1");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("col-1");
    expect(result[0].name).toBe("Favorites");
    expect(result[0].entryCount).toBe(5);
    expect(result[1].entryCount).toBe(5);
    // expiresAt is set to deletedAt + 30 days.
    const expectedExpires0 = new Date(
      new Date("2026-01-01T00:00:00.000Z").getTime() + TRASH_RETENTION_MS
    ).toISOString();
    expect(result[0].expiresAt).toBe(expectedExpires0);
  });

  it("treats a count query error as 0 entries", async () => {
    const rows = [
      {
        id: "col-1",
        user_id: "user-1",
        name: "X",
        collection_type: "user",
        deleted_at: "2026-01-01T00:00:00.000Z"
      }
    ];
    let callIndex = 0;
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      callIndex++;
      if (callIndex === 1) {
        Promise.resolve({ data: rows, error: null }).then(resolve);
      } else {
        Promise.resolve({ count: null, error: new Error("count fail") }).then(resolve);
      }
    });

    const result = await fetchTrashedCollections("user-1");
    expect(result[0].entryCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// hardDeleteVaultItem
// ---------------------------------------------------------------------------

describe("hardDeleteVaultItem", () => {
  it("builds a delete query filtered by user_id + tmdb_id + media_type + deleted_at NOT NULL", async () => {
    chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve)
    );
    await hardDeleteVaultItem("user-1", "123", "movie");
    expect(mockFrom).toHaveBeenCalledWith("vault");
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(chain.eq).toHaveBeenCalledWith("tmdb_id", 123);
    expect(chain.eq).toHaveBeenCalledWith("media_type", "movie");
    expect(chain.not).toHaveBeenCalledWith("deleted_at", "is", null);
  });

  it("throws on Supabase error", async () => {
    chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: new Error("delete failed") }).then(resolve)
    );
    await expect(
      hardDeleteVaultItem("user-1", "123", "movie")
    ).rejects.toThrow("delete failed");
  });
});

// ---------------------------------------------------------------------------
// hardDeleteCollection
// ---------------------------------------------------------------------------

describe("hardDeleteCollection", () => {
  it("deletes entries first, then the collection row", async () => {
    // The function makes two separate from() calls: collection_entries
    // then collections. Each returns its own thenable.
    let _callIndex = 0;
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      _callIndex++;
      Promise.resolve({ error: null }).then(resolve);
    });

    await hardDeleteCollection("col-1");

    // First from() call is for collection_entries.
    expect(mockFrom).toHaveBeenNthCalledWith(1, "collection_entries");
    // Second from() call is for collections.
    expect(mockFrom).toHaveBeenNthCalledWith(2, "collections");
    expect(chain.delete).toHaveBeenCalledTimes(2);
  });

  it("continues with the collection delete even if entries delete fails", async () => {
    let callIndex = 0;
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      callIndex++;
      if (callIndex === 1) {
        Promise.resolve({ error: new Error("entries delete failed") }).then(resolve);
      } else {
        Promise.resolve({ error: null }).then(resolve);
      }
    });

    // Should NOT throw — entries delete errors are warned, not thrown.
    await expect(hardDeleteCollection("col-1")).resolves.toBeUndefined();
  });

  it("throws when the collection delete fails", async () => {
    let callIndex = 0;
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      callIndex++;
      if (callIndex === 1) {
        Promise.resolve({ error: null }).then(resolve);
      } else {
        Promise.resolve({ error: new Error("col delete failed") }).then(resolve);
      }
    });

    await expect(hardDeleteCollection("col-1")).rejects.toThrow("col delete failed");
  });
});

// ---------------------------------------------------------------------------
// clearAllTrash
// ---------------------------------------------------------------------------

describe("clearAllTrash", () => {
  it("deletes all trashed vault + collection rows and returns counts", async () => {
    // Call order:
    //   1. vault.delete().select("id") → thenable → { data: [id1, id2], error: null }
    //   2. collections.select("id") → thenable → { data: [{id:"col-1"}], error: null }
    //   3. collection_entries.delete().in(...) → thenable → { error: null }
    //   4. collections.delete().in(...) → thenable → { error: null }
    let callIndex = 0;
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      callIndex++;
      if (callIndex === 1) {
        Promise.resolve({ data: [{ id: "v1" }, { id: "v2" }], error: null }).then(resolve);
      } else if (callIndex === 2) {
        Promise.resolve({ data: [{ id: "col-1" }], error: null }).then(resolve);
      } else {
        Promise.resolve({ error: null }).then(resolve);
      }
    });

    const result = await clearAllTrash("user-1");
    expect(result).toEqual({ vault: 2, collections: 1 });
  });

  it("throws when the vault delete fails", async () => {
    chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: new Error("vault delete fail") }).then(resolve)
    );
    await expect(clearAllTrash("user-1")).rejects.toThrow("vault delete fail");
  });

  it("throws when the collections fetch fails", async () => {
    let callIndex = 0;
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      callIndex++;
      if (callIndex === 1) {
        Promise.resolve({ data: [], error: null }).then(resolve);
      } else {
        Promise.resolve({ data: null, error: new Error("col fetch fail") }).then(resolve);
      }
    });
    await expect(clearAllTrash("user-1")).rejects.toThrow("col fetch fail");
  });

  it("skips entry/collection delete when there are no trashed collections", async () => {
    let callIndex = 0;
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      callIndex++;
      if (callIndex === 1) {
        Promise.resolve({ data: [{ id: "v1" }], error: null }).then(resolve);
      } else {
        Promise.resolve({ data: [], error: null }).then(resolve);
      }
    });
    const result = await clearAllTrash("user-1");
    expect(result).toEqual({ vault: 1, collections: 0 });
  });
});

// ---------------------------------------------------------------------------
// autoPurgeExpired
// ---------------------------------------------------------------------------

describe("autoPurgeExpired", () => {
  it("deletes vault rows with deleted_at < cutoff", async () => {
    let callIndex = 0;
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      callIndex++;
      if (callIndex === 1) {
        Promise.resolve({ data: [{ id: "v1" }, { id: "v2" }], error: null }).then(resolve);
      } else if (callIndex === 2) {
        Promise.resolve({ data: [], error: null }).then(resolve);
      } else {
        Promise.resolve({ error: null }).then(resolve);
      }
    });

    const result = await autoPurgeExpired("user-1");
    expect(result.vault).toBe(2);
    expect(result.collections).toBe(0);
    // Verify the .lt() filter was called with a cutoff date.
    expect(chain.lt).toHaveBeenCalledWith("deleted_at", expect.any(String));
    const cutoff = chain.lt.mock.calls[0][1] as string;
    // Cutoff should be ~30 days ago.
    const cutoffMs = new Date(cutoff).getTime();
    const expectedMs = Date.now() - TRASH_RETENTION_MS;
    expect(Math.abs(cutoffMs - expectedMs)).toBeLessThan(5000);
  });

  it("continues to collections even when vault purge errors", async () => {
    let callIndex = 0;
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      callIndex++;
      if (callIndex === 1) {
        Promise.resolve({ data: null, error: new Error("vault purge fail") }).then(resolve);
      } else {
        Promise.resolve({ data: [], error: null }).then(resolve);
      }
    });

    // Should NOT throw — auto-purge logs and continues.
    const result = await autoPurgeExpired("user-1");
    expect(result.vault).toBe(0);
    expect(result.collections).toBe(0);
  });

  it("purges expired collections when present", async () => {
    let callIndex = 0;
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
      callIndex++;
      if (callIndex === 1) {
        Promise.resolve({ data: [], error: null }).then(resolve);
      } else if (callIndex === 2) {
        Promise.resolve({ data: [{ id: "col-1" }, { id: "col-2" }], error: null }).then(resolve);
      } else {
        Promise.resolve({ error: null }).then(resolve);
      }
    });

    const result = await autoPurgeExpired("user-1");
    expect(result.collections).toBe(2);
  });
});
