// src/lib/supabase/repositories/__tests__/collectionRepository.test.ts
import { describe, it, expect, vi } from "vitest";
import { CollectionRepository } from "../collection/collection.repository";
import {
  validateName,
  validatePosition,
  MIN_POSITION,
  toCollectionInsert,
  toCollectionUpdate,
  toCollectionEntryInsert,
  toPositionUpdate,
  applySort,
  applyPagination,
} from "../collection/collection.utils";
import type { CollectionRow, CreateCollectionPayload, UpdateCollectionPayload, AddItemPayload } from "../collection/collection.types";
import { createMockSupabase, createMockSupabaseError } from "~/__test-fixtures__/mockSupabase";

const mockCollectionRow: CollectionRow = {
  id: "col-1",
  user_id: "user-1",
  collection_type: "user",
  name: "My Collection",
  cover_url: null,
  color: null,
  sort_mode: "manual",
  view_mode: "grid",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  deleted_at: null,
} as unknown as CollectionRow;

describe("CollectionRepository", () => {
  describe("getCollection", () => {
    it("returns collection when found", async () => {
      const { client } = createMockSupabase({ singleData: mockCollectionRow });
      const repo = new CollectionRepository(client as never);
      const result = await repo.getCollection("col-1");
      expect(result.data).toEqual(mockCollectionRow);
    });

    it("returns null when not found", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new CollectionRepository(client as never);
      const result = await repo.getCollection("nonexistent");
      expect(result.data).toBeNull();
    });

    it("returns error on failure", async () => {
      const err = new Error("Query failed");
      const { client } = createMockSupabaseError(err);
      const repo = new CollectionRepository(client as never);
      const result = await repo.getCollection("col-1");
      expect(result.error).toBe(err);
    });
  });

  describe("getCollections", () => {
    it("returns list of collections", async () => {
      const { client } = createMockSupabase({ listData: [mockCollectionRow] });
      const repo = new CollectionRepository(client as never);
      const result = await repo.getCollections({ userId: "user-1" });
      expect(result.data).toHaveLength(1);
    });

    it("returns empty array when no collections", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new CollectionRepository(client as never);
      const result = await repo.getCollections({ userId: "user-1" });
      expect(result.data).toEqual([]);
    });
  });

  describe("searchCollections", () => {
    it("returns matching collections", async () => {
      const { client, query } = createMockSupabase({ listData: [mockCollectionRow] });
      const repo = new CollectionRepository(client as never);
      const result = await repo.searchCollections({ userId: "user-1", searchTerm: "My" });
      expect(result.data).toHaveLength(1);
      expect(query.ilike).toHaveBeenCalledWith("name", expect.stringContaining("My"));
    });
  });

  describe("createCollection", () => {
    it("creates collection on success", async () => {
      const { client } = createMockSupabase({ singleData: mockCollectionRow });
      const repo = new CollectionRepository(client as never);
      const payload: CreateCollectionPayload = {
        userId: "user-1",
        name: "My Collection",
        collectionType: "user",
      };
      const result = await repo.createCollection(payload);
      expect(result.data).toEqual(mockCollectionRow);
    });

    it("returns error when name is empty", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new CollectionRepository(client as never);
      const result = await repo.createCollection({
        userId: "user-1",
        name: "",
        collectionType: "user",
      });
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error!.message).toContain("non-empty");
    });
  });

  describe("updateCollection", () => {
    it("updates collection on success", async () => {
      const { client } = createMockSupabase({ singleData: { ...mockCollectionRow, name: "Updated" } });
      const repo = new CollectionRepository(client as never);
      const payload: UpdateCollectionPayload = { name: "Updated" };
      const result = await repo.updateCollection("col-1", payload);
      expect(result.data?.name).toBe("Updated");
    });
  });

  describe("deleteCollection", () => {
    it("returns the deleted row on success", async () => {
      const { client } = createMockSupabase({ singleData: mockCollectionRow });
      const repo = new CollectionRepository(client as never);
      const result = await repo.deleteCollection("col-1");
      expect(result.data).toEqual(mockCollectionRow);
    });

    it("returns error on failure", async () => {
      const err = new Error("Delete failed");
      const { client } = createMockSupabaseError(err);
      const repo = new CollectionRepository(client as never);
      const result = await repo.deleteCollection("col-1");
      expect(result.error).toBe(err);
    });
  });

  describe("restoreCollection", () => {
    it("returns the restored row on success", async () => {
      const { client } = createMockSupabase({ singleData: { ...mockCollectionRow, deleted_at: null } });
      const repo = new CollectionRepository(client as never);
      const result = await repo.restoreCollection("col-1");
      expect(result.data?.deleted_at).toBeNull();
    });
  });

  describe("getItems", () => {
    it("returns list of entries", async () => {
      const mockEntry = { id: "entry-1", collection_id: "col-1", tmdb_id: 123, media_type: "movie", position: 0 };
      const { client } = createMockSupabase({ listData: [mockEntry] });
      const repo = new CollectionRepository(client as never);
      const result = await repo.getItems("col-1");
      expect(result.data).toHaveLength(1);
    });

    it("returns empty array when no entries", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new CollectionRepository(client as never);
      const result = await repo.getItems("col-1");
      expect(result.data).toEqual([]);
    });
  });

  describe("itemExists", () => {
    it("returns true when item exists", async () => {
      const mockEntry = { id: "entry-1" };
      const { client } = createMockSupabase({ singleData: mockEntry });
      const repo = new CollectionRepository(client as never);
      const result = await repo.itemExists({ collectionId: "col-1", vaultId: "vault-1" });
      expect(result.exists).toBe(true);
    });

    it("returns false when item does not exist", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new CollectionRepository(client as never);
      const result = await repo.itemExists({ collectionId: "col-1", vaultId: "vault-1" });
      expect(result.exists).toBe(false);
    });
  });

  describe("addItem", () => {
    it("adds item on success", async () => {
      const mockEntry = { id: "entry-1", collection_id: "col-1", vault_id: "vault-1", position: 0 };
      // itemExists (maybeSingle) returns null → exists=false → proceeds to insert
      // insert+single returns the new entry
      const { client } = createMockSupabase({
        maybeSingleData: null, // item doesn't exist yet
        singleData: mockEntry, // insert returns the new entry
      });
      const repo = new CollectionRepository(client as never);
      const payload: AddItemPayload = {
        collectionId: "col-1",
        vaultId: "vault-1",
      };
      const result = await repo.addItem(payload);
      expect(result.data).toEqual(mockEntry);
    });
  });

  describe("removeItem", () => {
    it("returns no error on success", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new CollectionRepository(client as never);
      const result = await repo.removeItem({ collectionId: "col-1", vaultId: "vault-1" });
      expect(result.error).toBeNull();
    });
  });

  describe("clearCollection", () => {
    it("returns no error on success", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new CollectionRepository(client as never);
      const result = await repo.clearCollection("col-1");
      expect(result.error).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Collection utils tests
// ─────────────────────────────────────────────────────────────────────

describe("collection.utils", () => {
  describe("MIN_POSITION", () => {
    it("is 0", () => {
      expect(MIN_POSITION).toBe(0);
    });
  });

  describe("validateName", () => {
    it("returns null for undefined (optional)", () => {
      expect(validateName(undefined)).toBeNull();
    });
    it("returns null for valid name", () => {
      expect(validateName("My Collection")).toBeNull();
    });
    it("returns Error for empty string", () => {
      expect(validateName("")).toBeInstanceOf(Error);
    });
    it("returns Error for whitespace-only string", () => {
      expect(validateName("  ")).toBeInstanceOf(Error);
    });
  });

  describe("validatePosition", () => {
    it("returns null for undefined (optional)", () => {
      expect(validatePosition(undefined)).toBeNull();
    });
    it("returns null for 0", () => {
      expect(validatePosition(0)).toBeNull();
    });
    it("returns null for positive integer", () => {
      expect(validatePosition(5)).toBeNull();
    });
    it("returns Error for negative", () => {
      expect(validatePosition(-1)).toBeInstanceOf(Error);
    });
    it("returns Error for non-integer", () => {
      expect(validatePosition(1.5)).toBeInstanceOf(Error);
    });
  });

  describe("toCollectionInsert", () => {
    it("maps payload to insert shape", () => {
      const result = toCollectionInsert({
        userId: "u1",
        name: "Test",
        type: "user",
      } as CreateCollectionPayload);
      expect(result.user_id).toBe("u1");
      expect(result.name).toBe("Test");
    });
  });

  describe("toCollectionUpdate", () => {
    it("maps partial payload to update shape", () => {
      const result = toCollectionUpdate({ name: "Updated" } as UpdateCollectionPayload);
      expect(result.name).toBe("Updated");
    });
  });

  describe("toCollectionEntryInsert", () => {
    it("maps entry payload to insert shape", () => {
      const result = toCollectionEntryInsert(
        {
          collectionId: "c1",
          vaultId: "vault-1",
        },
        0, // resolvedPosition
      );
      expect(result.collection_id).toBe("c1");
      expect(result.vault_id).toBe("vault-1");
      expect(result.position).toBe(0);
    });
  });

  describe("toPositionUpdate", () => {
    it("returns { position } update object", () => {
      expect(toPositionUpdate(5)).toEqual({ position: 5 });
    });
  });

  describe("applySort", () => {
    it("returns query unchanged when sort is undefined", () => {
      const query = { order: vi.fn().mockReturnThis() };
      expect(applySort(query, undefined)).toBe(query);
      expect(query.order).not.toHaveBeenCalled();
    });

    it("applies ascending sort", () => {
      const query = { order: vi.fn().mockReturnThis() };
      applySort(query, { field: "name", direction: "asc" });
      expect(query.order).toHaveBeenCalledWith("name", { ascending: true });
    });

    it("applies descending sort", () => {
      const query = { order: vi.fn().mockReturnThis() };
      applySort(query, { field: "created_at", direction: "desc" });
      expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    });
  });

  describe("applyPagination", () => {
    it("returns query unchanged when pagination is undefined", () => {
      const query = { range: vi.fn().mockReturnThis() };
      expect(applyPagination(query, undefined)).toBe(query);
    });

    it("applies range with offset and limit", () => {
      const query = { range: vi.fn().mockReturnThis() };
      applyPagination(query, { limit: 10, offset: 20 });
      expect(query.range).toHaveBeenCalledWith(20, 29);
    });
  });
});
