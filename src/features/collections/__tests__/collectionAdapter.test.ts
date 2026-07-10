// src/features/collections/__tests__/collectionAdapter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/lib/supabase/repositories", () => ({
  getCollectionRepository: vi.fn(),
}));

vi.mock("../collectionEntryAdapter", () => ({
  fetchEntriesForCollection: vi.fn().mockResolvedValue([]),
  addEntryToCollection: vi.fn(),
  removeEntryFromCollection: vi.fn(),
  reorderEntriesInCollection: vi.fn(),
}));

import {
  fetchCollectionsFromSupabase,
  createCollectionInSupabase,
  deleteCollectionInSupabase,
  restoreCollectionInSupabase,
} from "../collectionAdapter";
import { getCollectionRepository } from "~/lib/supabase/repositories";
import type { CollectionRow } from "~/lib/supabase/repositories";
import { fetchEntriesForCollection } from "../collectionEntryAdapter";

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

describe("collectionAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchCollectionsFromSupabase", () => {
    it("returns collections with entries on success", async () => {
      const mockRepo = {
        getCollections: vi.fn().mockResolvedValue({ data: [mockCollectionRow], error: null }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);
      vi.mocked(fetchEntriesForCollection).mockResolvedValue([]);

      const result = await fetchCollectionsFromSupabase("user-1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("col-1");
      expect(result[0].name).toBe("My Collection");
      expect(result[0].entries).toEqual([]);
    });

    it("returns empty array on error", async () => {
      const mockRepo = {
        getCollections: vi.fn().mockResolvedValue({ data: [], error: new Error("Fail") }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      const result = await fetchCollectionsFromSupabase("user-1");
      expect(result).toEqual([]);
    });

    it("returns empty array when no collections", async () => {
      const mockRepo = {
        getCollections: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      const result = await fetchCollectionsFromSupabase("user-1");
      expect(result).toEqual([]);
    });

    it("sorts Favorites first", async () => {
      const favoritesRow = {
        ...mockCollectionRow,
        id: "favorites",
        name: "Favorites",
        collection_type: "user",
      };
      // The isFavorites flag is derived from the name "Favorites" in the mapper
      const otherRow = { ...mockCollectionRow, id: "col-2", name: "Other" };
      const mockRepo = {
        getCollections: vi.fn().mockResolvedValue({ data: [otherRow, favoritesRow], error: null }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);
      vi.mocked(fetchEntriesForCollection).mockResolvedValue([]);

      const result = await fetchCollectionsFromSupabase("user-1");
      // Favorites should bubble to the top
      expect(result[0].name).toBe("Favorites");
    });
  });

  describe("createCollectionInSupabase", () => {
    it("returns collection id on success", async () => {
      const mockRepo = {
        createCollection: vi.fn().mockResolvedValue({ data: mockCollectionRow, error: null }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      const result = await createCollectionInSupabase("user-1", "New Collection");
      expect(result).toBe("col-1");
      expect(mockRepo.createCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          name: "New Collection",
        }),
      );
    });

    it("returns null on error", async () => {
      const mockRepo = {
        createCollection: vi.fn().mockResolvedValue({ data: null, error: new Error("Fail") }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      const result = await createCollectionInSupabase("user-1", "New");
      expect(result).toBeNull();
    });

    it("returns null when name is empty (validation)", async () => {
      const mockRepo = {
        createCollection: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("name must be non-empty"),
        }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      const result = await createCollectionInSupabase("user-1", "");
      expect(result).toBeNull();
    });
  });

  describe("deleteCollectionInSupabase", () => {
    it("completes without error on success", async () => {
      const mockRepo = {
        deleteCollection: vi.fn().mockResolvedValue({ data: mockCollectionRow, error: null }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      await expect(deleteCollectionInSupabase("col-1")).resolves.toBeUndefined();
      expect(mockRepo.deleteCollection).toHaveBeenCalledWith("col-1");
    });

    it("throws on error", async () => {
      const mockRepo = {
        deleteCollection: vi.fn().mockResolvedValue({ data: null, error: new Error("Delete fail") }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      await expect(deleteCollectionInSupabase("col-1")).rejects.toThrow("Delete fail");
    });
  });

  describe("restoreCollectionInSupabase", () => {
    it("completes without error on success", async () => {
      const mockRepo = {
        restoreCollection: vi.fn().mockResolvedValue({ data: mockCollectionRow, error: null }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      await expect(restoreCollectionInSupabase("col-1")).resolves.toBeUndefined();
      expect(mockRepo.restoreCollection).toHaveBeenCalledWith("col-1");
    });

    it("throws on error", async () => {
      const mockRepo = {
        restoreCollection: vi.fn().mockResolvedValue({ data: null, error: new Error("Restore fail") }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      await expect(restoreCollectionInSupabase("col-1")).rejects.toThrow("Restore fail");
    });
  });
});
