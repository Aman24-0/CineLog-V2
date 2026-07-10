// src/__tests__/regression/criticalFlows.test.ts
//
// Regression tests for critical user flows. These verify the full
// adapter → repository → Supabase call chain using mocked repositories,
// ensuring the contracts between layers stay intact.
//
// Covered flows:
//   1. Add to Vault
//   2. Remove from Vault
//   3. Create Collection
//   4. Delete Collection
//   5. Create Preset
//   6. Delete Preset
//   7. Dashboard stats derivation
//   8. Continue Watching selection
//   9. Discover vault membership check

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all repository singletons
vi.mock("~/lib/supabase/repositories", () => ({
  getVaultRepository: vi.fn(),
  getCollectionRepository: vi.fn(),
  getPresetRepository: vi.fn(),
  getDashboardRepository: vi.fn(),
  getEpisodeProgressRepository: vi.fn(),
}));

vi.mock("~/shared/hooks/useAuth", () => ({
  getCurrentUid: vi.fn().mockReturnValue("user-1"),
}));

// Mock the collection entry adapter so fetchCollectionsFromSupabase
// doesn't need a full CollectionRepository.getItems mock
vi.mock("~/features/collections/collectionEntryAdapter", () => ({
  fetchEntriesForCollection: vi.fn().mockResolvedValue([]),
  addEntryToCollection: vi.fn(),
  removeEntryFromCollection: vi.fn(),
  reorderEntriesInCollection: vi.fn(),
}));

import { getVaultRepository, getCollectionRepository, getPresetRepository } from "~/lib/supabase/repositories";
import { getCurrentUid } from "~/shared/hooks/useAuth";

// Adapters
import { createVaultItemInSupabase, deleteVaultItemInSupabase, fetchVaultFromSupabase } from "~/features/watchlist/vaultAdapter";
import { createCollectionInSupabase, deleteCollectionInSupabase, fetchCollectionsFromSupabase } from "~/features/collections/collectionAdapter";
import { createPresetInSupabase, deletePresetFromSupabase, fetchPresetsFromSupabase } from "~/features/watchlist/presetAdapter";
import { getRecommendation } from "~/features/dashboard/recommendationEngine";

// Fixtures
import { makeMovie, makeTVSeries, makeVaultFilters } from "~/__test-fixtures__/factories";
import type { VaultRow, CollectionRow, PresetRow } from "~/lib/supabase/repositories";

const mockVaultRow: VaultRow = {
  id: "vault-1",
  user_id: "user-1",
  tmdb_id: 123,
  media_type: "movie",
  status: "planned",
  is_favorite: false,
  is_pinned: false,
  rating: null,
  notes: null,
  rewatch_count: 0,
  progress_minutes: null,
  watched_on: null,
  started_at: null,
  completed_at: null,
  last_activity_at: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  deleted_at: null,
} as unknown as VaultRow;

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

const mockPresetRow: PresetRow = {
  id: "preset-1",
  user_id: "user-1",
  name: "My Preset",
  filters: makeVaultFilters() as unknown as PresetRow["filters"],
  created_at: "2024-01-01T00:00:00Z",
} as unknown as PresetRow;

describe("Critical Flow Regression Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUid).mockReturnValue("user-1");
  });

  // ───────────────────────────────────────────────────────────────────
  // 1. Add to Vault
  // ───────────────────────────────────────────────────────────────────
  describe("Add to Vault flow", () => {
    it("creates a vault item via createVaultItemInSupabase", async () => {
      const mockRepo = {
        createVaultItem: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      const item = makeMovie({ id: "123", title: "Inception" });
      const result = await createVaultItemInSupabase("user-1", item);

      expect(result.id).toBe("123");
      expect(result.title).toBe("Inception");
      expect(mockRepo.createVaultItem).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          tmdbId: 123,
          mediaType: "movie",
          status: "planned",
        }),
      );
    });

    it("propagates errors when creation fails", async () => {
      const mockRepo = {
        createVaultItem: vi.fn().mockResolvedValue({ data: null, error: new Error("Duplicate") }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await expect(
        createVaultItemInSupabase("user-1", makeMovie({ id: "123" })),
      ).rejects.toThrow("Duplicate");
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 2. Remove from Vault
  // ───────────────────────────────────────────────────────────────────
  describe("Remove from Vault flow", () => {
    it("soft-deletes a vault item via deleteVaultItemInSupabase", async () => {
      const mockRepo = {
        deleteVaultItem: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await deleteVaultItemInSupabase("user-1", "123", "movie");

      expect(mockRepo.deleteVaultItem).toHaveBeenCalledWith({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie",
      });
    });

    it("throws on delete failure", async () => {
      const mockRepo = {
        deleteVaultItem: vi.fn().mockResolvedValue({ data: null, error: new Error("Not found") }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await expect(
        deleteVaultItemInSupabase("user-1", "123", "movie"),
      ).rejects.toThrow("Not found");
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 3. Create Collection
  // ───────────────────────────────────────────────────────────────────
  describe("Create Collection flow", () => {
    it("creates a collection and returns its id", async () => {
      const mockRepo = {
        createCollection: vi.fn().mockResolvedValue({ data: mockCollectionRow, error: null }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      const result = await createCollectionInSupabase("user-1", "My Collection");
      expect(result).toBe("col-1");
      expect(mockRepo.createCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          name: "My Collection",
        }),
      );
    });

    it("returns null on failure", async () => {
      const mockRepo = {
        createCollection: vi.fn().mockResolvedValue({ data: null, error: new Error("Fail") }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      const result = await createCollectionInSupabase("user-1", "My Collection");
      expect(result).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 4. Delete Collection
  // ───────────────────────────────────────────────────────────────────
  describe("Delete Collection flow", () => {
    it("soft-deletes a collection", async () => {
      const mockRepo = {
        deleteCollection: vi.fn().mockResolvedValue({ data: mockCollectionRow, error: null }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      await deleteCollectionInSupabase("col-1");
      expect(mockRepo.deleteCollection).toHaveBeenCalledWith("col-1");
    });

    it("throws on failure", async () => {
      const mockRepo = {
        deleteCollection: vi.fn().mockResolvedValue({ data: null, error: new Error("Not found") }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      await expect(deleteCollectionInSupabase("col-1")).rejects.toThrow("Not found");
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 5. Create Preset
  // ───────────────────────────────────────────────────────────────────
  describe("Create Preset flow", () => {
    it("creates a preset and returns true", async () => {
      const mockRepo = {
        createPreset: vi.fn().mockResolvedValue({ data: mockPresetRow, error: null }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await createPresetInSupabase("user-1", "My Preset", makeVaultFilters());
      expect(result).toBe(true);
      expect(mockRepo.createPreset).toHaveBeenCalledWith({
        userId: "user-1",
        name: "My Preset",
        filters: makeVaultFilters(),
      });
    });

    it("returns false on validation error (empty name)", async () => {
      const mockRepo = {
        createPreset: vi.fn().mockResolvedValue({ data: null, error: new Error("non-empty") }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await createPresetInSupabase("user-1", "", makeVaultFilters());
      expect(result).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 6. Delete Preset
  // ───────────────────────────────────────────────────────────────────
  describe("Delete Preset flow", () => {
    it("deletes a preset and returns true", async () => {
      const mockRepo = {
        deletePreset: vi.fn().mockResolvedValue({ error: null }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await deletePresetFromSupabase("preset-1");
      expect(result).toBe(true);
      expect(mockRepo.deletePreset).toHaveBeenCalledWith("preset-1");
    });

    it("returns false on failure", async () => {
      const mockRepo = {
        deletePreset: vi.fn().mockResolvedValue({ error: new Error("Not found") }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await deletePresetFromSupabase("preset-1");
      expect(result).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 7. Dashboard stats derivation
  // ───────────────────────────────────────────────────────────────────
  describe("Dashboard stats derivation", () => {
    it("fetches vault items across all 5 statuses", async () => {
      const mockRepo = {
        getVaultByStatus: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await fetchVaultFromSupabase("user-1");
      // 5 statuses: planned, watching, completed, on_hold, dropped
      expect(mockRepo.getVaultByStatus).toHaveBeenCalledTimes(5);
      const statuses = mockRepo.getVaultByStatus.mock.calls.map((c) => c[1]);
      expect(statuses).toContain("planned");
      expect(statuses).toContain("watching");
      expect(statuses).toContain("completed");
      expect(statuses).toContain("on_hold");
      expect(statuses).toContain("dropped");
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 8. Continue Watching selection
  // ───────────────────────────────────────────────────────────────────
  describe("Continue Watching selection", () => {
    it("picks the most recently watched Watching item", () => {
      const watchlist = [
        makeTVSeries({ id: "old", status: "Watching", watchProgress: { updatedAt: "2024-01-01T00:00:00Z" } as never }),
        makeTVSeries({ id: "new", status: "Watching", watchProgress: { updatedAt: "2024-06-01T00:00:00Z" } as never }),
        makeMovie({ id: "planned", status: "Planned" }),
      ];
      const result = getRecommendation(watchlist, null, 0);
      expect(result.context).toBe("continue");
      expect(result.item?.id).toBe("new");
      expect(result.isResume).toBe(true);
    });

    it("falls back to Tonight's Pick when no Watching items", () => {
      const watchlist = [
        makeMovie({ id: "1", status: "Planned" }),
        makeMovie({ id: "2", status: "Planned" }),
      ];
      const result = getRecommendation(watchlist, null, 0);
      expect(result.context).toBe("tonight");
      expect(result.badge).toBe("TONIGHT'S PICK");
    });

    it("returns empty context for empty vault", () => {
      const result = getRecommendation([], null, 0);
      expect(result.context).toBe("empty");
      expect(result.item).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 9. Fetch collections (Discover membership check)
  // ───────────────────────────────────────────────────────────────────
  describe("Fetch collections flow", () => {
    it("fetches user collections with entries", async () => {
      const mockRepo = {
        getCollections: vi.fn().mockResolvedValue({ data: [mockCollectionRow], error: null }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      const result = await fetchCollectionsFromSupabase("user-1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("col-1");
    });

    it("returns empty array on error", async () => {
      const mockRepo = {
        getCollections: vi.fn().mockResolvedValue({ data: [], error: new Error("Fail") }),
      };
      vi.mocked(getCollectionRepository).mockReturnValue(mockRepo as never);

      const result = await fetchCollectionsFromSupabase("user-1");
      expect(result).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 10. Preset fetch flow
  // ───────────────────────────────────────────────────────────────────
  describe("Preset fetch flow", () => {
    it("fetches presets and maps them to FilterPreset", async () => {
      const mockRepo = {
        listPresets: vi.fn().mockResolvedValue({ data: [mockPresetRow], error: null }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await fetchPresetsFromSupabase("user-1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("preset-1");
      expect(result[0].name).toBe("My Preset");
    });
  });
});
