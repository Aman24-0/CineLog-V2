// src/features/watchlist/__tests__/vaultAdapter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the repository singletons BEFORE importing the adapters.
vi.mock("~/lib/supabase/repositories", () => ({
  getVaultRepository: vi.fn(),
  getEpisodeProgressRepository: vi.fn(),
}));

import {
  vaultRowToWatchlistItem,
  vaultIdentity,
  createVaultItemInSupabase,
  fetchVaultFromSupabase,
} from "../vaultReadAdapter";
import {
  updateStatusInSupabase,
  updateRatingInSupabase,
  updateNotesInSupabase,
  updateWatchDateInSupabase,
  updateProgressInSupabase,
  toggleFavoriteInSupabase,
  togglePinnedInSupabase,
  deleteVaultItemInSupabase,
  restoreVaultItemInSupabase,
  updateVaultItemInSupabase,
} from "../vaultAdapter";
import { getVaultRepository } from "~/lib/supabase/repositories";
import type { VaultRow } from "~/lib/supabase/repositories";
import {makeMovie} from "~/__test-fixtures__/factories";

const mockVaultRow = {
  id: "vault-uuid-1",
  user_id: "user-1",
  tmdb_id: 123,
  media_type: "movie" as const,
  status: "planned" as const,
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

describe("vaultReadAdapter", () => {
  describe("vaultRowToWatchlistItem", () => {
    it("maps VaultRow to WatchlistItem", () => {
      const result = vaultRowToWatchlistItem(mockVaultRow);
      expect(result.id).toBe("123"); // tmdb_id → string
      expect(result.media_type).toBe("movie");
      expect(result.status).toBe("Planned"); // 'planned' → 'Planned'
      expect(result.addedAt).toBe("2024-01-01T00:00:00Z");
      expect(result.updatedAt).toBe("2024-01-01T00:00:00Z");
    });

    it("maps 'watching' status to 'Watching'", () => {
      const row = { ...mockVaultRow, status: "watching" as const };
      const result = vaultRowToWatchlistItem(row);
      expect(result.status).toBe("Watching");
    });

    it("maps 'completed' status to 'Completed'", () => {
      const row = { ...mockVaultRow, status: "completed" as const };
      const result = vaultRowToWatchlistItem(row);
      expect(result.status).toBe("Completed");
    });

    it("maps 'on_hold' status to 'Plan to Watch'", () => {
      const row = { ...mockVaultRow, status: "on_hold" as const };
      const result = vaultRowToWatchlistItem(row);
      expect(result.status).toBe("Plan to Watch");
    });

    it("maps 'dropped' status to 'Dropped'", () => {
      const row = { ...mockVaultRow, status: "dropped" as const };
      const result = vaultRowToWatchlistItem(row);
      expect(result.status).toBe("Dropped");
    });

    it("defaults unknown status to 'Planned'", () => {
      const row = { ...mockVaultRow, status: "unknown" as never };
      const result = vaultRowToWatchlistItem(row);
      expect(result.status).toBe("Planned");
    });

    it("maps null rating to undefined", () => {
      const result = vaultRowToWatchlistItem(mockVaultRow);
      expect(result.rating).toBeUndefined();
    });

    it("maps non-null rating to number", () => {
      const row = { ...mockVaultRow, rating: 8.5 };
      const result = vaultRowToWatchlistItem(row);
      expect(result.rating).toBe(8.5);
    });

    it("maps null notes to undefined", () => {
      const result = vaultRowToWatchlistItem(mockVaultRow);
      expect(result.notes).toBeUndefined();
    });

    it("maps watched_on to watchDate", () => {
      const row = { ...mockVaultRow, watched_on: "2024-06-01" };
      const result = vaultRowToWatchlistItem(row);
      expect(result.watchDate).toBe("2024-06-01");
    });

    it("maps null watched_on to undefined", () => {
      const result = vaultRowToWatchlistItem(mockVaultRow);
      expect(result.watchDate).toBeUndefined();
    });
  });

  describe("vaultIdentity", () => {
    it("builds identity from userId + WatchlistItem", () => {
      const item = makeMovie({ id: "123" });
      const result = vaultIdentity("user-1", item);
      expect(result).toEqual({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie",
      });
    });
  });

  describe("createVaultItemInSupabase", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("creates vault item and returns merged WatchlistItem", async () => {
      const mockRepo = {
        createVaultItem: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      const item = makeMovie({ id: "123", title: "Inception" });
      const result = await createVaultItemInSupabase("user-1", item);
      expect(result.id).toBe("123");
      expect(result.title).toBe("Inception"); // preserved from original item
      expect(result.status).toBe("Planned"); // from vault row
      expect(mockRepo.createVaultItem).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          tmdbId: 123,
          mediaType: "movie",
        }),
      );
    });

    it("throws on error", async () => {
      const mockRepo = {
        createVaultItem: vi.fn().mockResolvedValue({ data: null, error: new Error("Insert failed") }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await expect(
        createVaultItemInSupabase("user-1", makeMovie({ id: "123" })),
      ).rejects.toThrow("Insert failed");
    });

    it("throws when data is null without error", async () => {
      const mockRepo = {
        createVaultItem: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await expect(
        createVaultItemInSupabase("user-1", makeMovie({ id: "123" })),
      ).rejects.toThrow("no data");
    });
  });

  describe("fetchVaultFromSupabase", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("fetches all statuses and merges results", async () => {
      // Each status returns a different row so we can verify merge + sort
      const plannedRow = { ...mockVaultRow, tmdb_id: 1, created_at: "2024-01-01T00:00:00Z" };
      const watchingRow = { ...mockVaultRow, tmdb_id: 2, created_at: "2024-06-01T00:00:00Z" };
      const completedRow = { ...mockVaultRow, tmdb_id: 3, created_at: "2024-03-01T00:00:00Z" };
      const mockRepo = {
        getVaultByStatus: vi.fn().mockImplementation((_userId, status) => {
          if (status === "planned") return Promise.resolve({ data: [plannedRow], error: null });
          if (status === "watching") return Promise.resolve({ data: [watchingRow], error: null });
          if (status === "completed") return Promise.resolve({ data: [completedRow], error: null });
          return Promise.resolve({ data: [], error: null });
        }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      const result = await fetchVaultFromSupabase("user-1");
      // 5 statuses called in parallel
      expect(mockRepo.getVaultByStatus).toHaveBeenCalledTimes(5);
      expect(result).toHaveLength(3);
      // Sorted by created_at desc → watching (June) first, completed (March), planned (Jan)
      expect(result[0].id).toBe("2"); // watching
      expect(result[1].id).toBe("3"); // completed
      expect(result[2].id).toBe("1"); // planned
    });

    it("skips statuses that return errors", async () => {
      const mockRepo = {
        getVaultByStatus: vi.fn().mockImplementation((_userId, status) => {
          if (status === "watching") {
            return Promise.resolve({ data: [], error: new Error("Fail") });
          }
          // Only planned returns a row; others return empty
          if (status === "planned") {
            return Promise.resolve({ data: [mockVaultRow], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      const result = await fetchVaultFromSupabase("user-1");
      // Only planned succeeded with a row
      expect(result).toHaveLength(1);
    });

    it("returns empty array when all statuses return empty", async () => {
      const mockRepo = {
        getVaultByStatus: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      const result = await fetchVaultFromSupabase("user-1");
      expect(result).toEqual([]);
    });
  });
});

describe("vaultAdapter (writes)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const identity = { userId: "user-1", tmdbId: 123, mediaType: "movie" as const };

  describe("updateStatusInSupabase", () => {
    it("calls repo.updateStatus and throws on error", async () => {
      const mockRepo = {
        updateStatus: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await updateStatusInSupabase("user-1", "123", "movie", "Watching");
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(identity, "watching");
    });

    it("throws on error", async () => {
      const mockRepo = {
        updateStatus: vi.fn().mockResolvedValue({ data: null, error: new Error("Fail") }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await expect(
        updateStatusInSupabase("user-1", "123", "movie", "Watching"),
      ).rejects.toThrow("Fail");
    });
  });

  describe("updateRatingInSupabase", () => {
    it("calls repo.updateRating", async () => {
      const mockRepo = {
        updateRating: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await updateRatingInSupabase("user-1", "123", "movie", 8.5);
      expect(mockRepo.updateRating).toHaveBeenCalledWith(identity, 8.5);
    });
  });

  describe("updateNotesInSupabase", () => {
    it("calls repo.updateNotes", async () => {
      const mockRepo = {
        updateNotes: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await updateNotesInSupabase("user-1", "123", "movie", "Great movie!");
      expect(mockRepo.updateNotes).toHaveBeenCalledWith(identity, "Great movie!");
    });
  });

  describe("updateWatchDateInSupabase", () => {
    it("calls repo.updateVaultItem with { watched_on }", async () => {
      const mockRepo = {
        updateVaultItem: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await updateWatchDateInSupabase("user-1", "123", "movie", "2024-06-01");
      expect(mockRepo.updateVaultItem).toHaveBeenCalledWith(identity, { watched_on: "2024-06-01" });
    });
  });

  describe("updateProgressInSupabase", () => {
    it("calls repo.updateProgress", async () => {
      const mockRepo = {
        updateProgress: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await updateProgressInSupabase("user-1", "123", "movie", 45);
      expect(mockRepo.updateProgress).toHaveBeenCalledWith(identity, 45);
    });
  });

  describe("toggleFavoriteInSupabase", () => {
    it("calls repo.updateVaultItem with toggled is_favorite", async () => {
      const mockRepo = {
        updateVaultItem: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await toggleFavoriteInSupabase("user-1", "123", "movie", false);
      expect(mockRepo.updateVaultItem).toHaveBeenCalledWith(identity, { is_favorite: true });
    });

    it("toggles from true to false", async () => {
      const mockRepo = {
        updateVaultItem: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await toggleFavoriteInSupabase("user-1", "123", "movie", true);
      expect(mockRepo.updateVaultItem).toHaveBeenCalledWith(identity, { is_favorite: false });
    });
  });

  describe("togglePinnedInSupabase", () => {
    it("calls repo.updateVaultItem with toggled is_pinned", async () => {
      const mockRepo = {
        updateVaultItem: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await togglePinnedInSupabase("user-1", "123", "movie", false);
      expect(mockRepo.updateVaultItem).toHaveBeenCalledWith(identity, { is_pinned: true });
    });
  });

  describe("deleteVaultItemInSupabase", () => {
    it("calls repo.deleteVaultItem", async () => {
      const mockRepo = {
        getVaultByTmdbId: vi.fn().mockResolvedValue({ data: { id: "vault-uuid-1" }, error: null }),
        deleteVaultItem: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await deleteVaultItemInSupabase("user-1", "123", "movie");
      expect(mockRepo.deleteVaultItem).toHaveBeenCalledWith(identity);
    });

    it("throws on error", async () => {
      const mockRepo = {
        getVaultByTmdbId: vi.fn().mockResolvedValue({ data: { id: "vault-uuid-1" }, error: null }),
        deleteVaultItem: vi.fn().mockResolvedValue({ data: null, error: new Error("Delete failed") }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await expect(
        deleteVaultItemInSupabase("user-1", "123", "movie"),
      ).rejects.toThrow("Delete failed");
    });
  });

  describe("restoreVaultItemInSupabase", () => {
    it("calls repo.restoreVaultItem", async () => {
      const mockRepo = {
        restoreVaultItem: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      await restoreVaultItemInSupabase("user-1", "123", "movie");
      expect(mockRepo.restoreVaultItem).toHaveBeenCalledWith(identity);
    });
  });

  describe("updateVaultItemInSupabase", () => {
    it("calls repo.updateVaultItem with arbitrary update", async () => {
      const mockRepo = {
        updateVaultItem: vi.fn().mockResolvedValue({ data: mockVaultRow, error: null }),
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockRepo as never);

      const update = { rating: 9, notes: "Updated" };
      await updateVaultItemInSupabase("user-1", "123", "movie", update);
      expect(mockRepo.updateVaultItem).toHaveBeenCalledWith(identity, update);
    });
  });
});
