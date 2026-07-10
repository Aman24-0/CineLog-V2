// src/shared/hooks/__tests__/userLibraryAdapter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/lib/supabase/repositories", () => ({
  getDashboardRepository: vi.fn(),
  getEpisodeProgressRepository: vi.fn(),
}));

vi.mock("~/shared/hooks/useAuth", () => ({
  getCurrentUid: vi.fn(),
}));

import { vaultRowToWatchlistItem, fetchUserLibrary, getUserId } from "../userLibraryAdapter";
import { getDashboardRepository, getEpisodeProgressRepository } from "~/lib/supabase/repositories";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import type { VaultRow, EpisodeProgressRow } from "~/lib/supabase/repositories";

const mockVaultRow = {
  id: "vault-1",
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

const mockProgressRow: EpisodeProgressRow = {
  id: "ep-1",
  vault_id: "vault-tv-1",
  season_number: 2,
  episode_number: 5,
  is_completed: false,
  progress_minutes: 30,
  watched_at: "2024-06-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z",
} as unknown as EpisodeProgressRow;

describe("userLibraryAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("vaultRowToWatchlistItem", () => {
    it("maps a movie VaultRow to WatchlistItem (no progress)", () => {
      const result = vaultRowToWatchlistItem(mockVaultRow);
      expect(result.id).toBe("123");
      expect(result.media_type).toBe("movie");
      expect(result.status).toBe("Planned");
      expect(result.season).toBeUndefined();
      expect(result.watchProgress).toBeUndefined();
    });

    it("maps a TV VaultRow with episode progress", () => {
      const tvRow = { ...mockVaultRow, id: "vault-tv-1", media_type: "tv" as const, status: "watching" as const };
      const result = vaultRowToWatchlistItem(tvRow, mockProgressRow);
      expect(result.media_type).toBe("tv");
      expect(result.status).toBe("Watching");
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
      expect(result.watchProgress).toBeDefined();
      expect(result.watchProgress!.season).toBe(2);
      expect(result.watchProgress!.episode).toBe(5);
      expect(result.watchProgress!.updatedAt).toBe("2024-06-01T00:00:00Z");
    });

    it("ignores progress for movies (media_type !== 'tv')", () => {
      const result = vaultRowToWatchlistItem(mockVaultRow, mockProgressRow);
      expect(result.season).toBeUndefined();
      expect(result.watchProgress).toBeUndefined();
    });

    it("handles null progress gracefully", () => {
      const result = vaultRowToWatchlistItem(mockVaultRow, null);
      expect(result.season).toBeUndefined();
    });

    it("maps rating from number", () => {
      const row = { ...mockVaultRow, rating: 8.5 };
      const result = vaultRowToWatchlistItem(row);
      expect(result.rating).toBe(8.5);
    });

    it("maps null rating to undefined", () => {
      const result = vaultRowToWatchlistItem(mockVaultRow);
      expect(result.rating).toBeUndefined();
    });

    it("maps watched_on to watchDate", () => {
      const row = { ...mockVaultRow, watched_on: "2024-06-15" };
      const result = vaultRowToWatchlistItem(row);
      expect(result.watchDate).toBe("2024-06-15");
    });

    it("uses watched_at for progress.updatedAt when available", () => {
      const tvRow = { ...mockVaultRow, media_type: "tv" as const };
      const progress = { ...mockProgressRow, watched_at: "2024-06-01T12:00:00Z" };
      const result = vaultRowToWatchlistItem(tvRow, progress);
      expect(result.watchProgress!.updatedAt).toBe("2024-06-01T12:00:00Z");
    });

    it("falls back to updated_at when watched_at is null", () => {
      const tvRow = { ...mockVaultRow, media_type: "tv" as const };
      const progress = { ...mockProgressRow, watched_at: null };
      const result = vaultRowToWatchlistItem(tvRow, progress);
      expect(result.watchProgress!.updatedAt).toBe("2024-06-01T00:00:00Z"); // updated_at
    });
  });

  describe("fetchUserLibrary", () => {
    it("fetches vault items and enriches TV items with progress", async () => {
      const movieRow = { ...mockVaultRow, id: "v1", tmdb_id: 1, media_type: "movie" as const };
      const tvRow = { ...mockVaultRow, id: "v2", tmdb_id: 2, media_type: "tv", status: "watching" as const };

      const mockDashRepo = {
        getAllVaultItems: vi.fn().mockResolvedValue({ data: [movieRow, tvRow], error: null }),
      };
      const mockProgRepo = {
        getLatestEpisodeProgressBatch: vi.fn().mockResolvedValue({
          data: new Map([["v2", mockProgressRow]]),
          error: null,
        }),
      };
      vi.mocked(getDashboardRepository).mockReturnValue(mockDashRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(mockProgRepo as never);

      const result = await fetchUserLibrary("user-1");
      expect(result).toHaveLength(2);
      // Movie — no progress
      expect(result[0].media_type).toBe("movie");
      expect(result[0].season).toBeUndefined();
      // TV — enriched with progress
      expect(result[1].media_type).toBe("tv");
      expect(result[1].season).toBe(2);
      expect(result[1].episode).toBe(5);
    });

    it("returns empty array when vault is empty", async () => {
      const mockDashRepo = {
        getAllVaultItems: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.mocked(getDashboardRepository).mockReturnValue(mockDashRepo as never);

      const result = await fetchUserLibrary("user-1");
      expect(result).toEqual([]);
    });

    it("skips episode progress fetch when no TV items", async () => {
      const movieRow = { ...mockVaultRow, media_type: "movie" as const };
      const mockDashRepo = {
        getAllVaultItems: vi.fn().mockResolvedValue({ data: [movieRow], error: null }),
      };
      const mockProgRepo = {
        getLatestEpisodeProgressBatch: vi.fn(),
      };
      vi.mocked(getDashboardRepository).mockReturnValue(mockDashRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(mockProgRepo as never);

      await fetchUserLibrary("user-1");
      expect(mockProgRepo.getLatestEpisodeProgressBatch).not.toHaveBeenCalled();
    });

    it("returns items even when episode progress fetch fails", async () => {
      const tvRow = { ...mockVaultRow, id: "v1", media_type: "tv" as const };
      const mockDashRepo = {
        getAllVaultItems: vi.fn().mockResolvedValue({ data: [tvRow], error: null }),
      };
      const mockProgRepo = {
        getLatestEpisodeProgressBatch: vi.fn().mockResolvedValue({
          data: new Map(),
          error: new Error("Progress fetch failed"),
        }),
      };
      vi.mocked(getDashboardRepository).mockReturnValue(mockDashRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(mockProgRepo as never);

      const result = await fetchUserLibrary("user-1");
      expect(result).toHaveLength(1);
      expect(result[0].season).toBeUndefined(); // no progress data
    });

    it("returns empty array when vault fetch fails", async () => {
      const mockDashRepo = {
        getAllVaultItems: vi.fn().mockResolvedValue({ data: null, error: new Error("Fail") }),
      };
      vi.mocked(getDashboardRepository).mockReturnValue(mockDashRepo as never);

      const result = await fetchUserLibrary("user-1");
      expect(result).toEqual([]);
    });
  });

  describe("getUserId", () => {
    it("returns the current user's uid", () => {
      vi.mocked(getCurrentUid).mockReturnValue("user-1");
      expect(getUserId()).toBe("user-1");
    });

    it("returns null when not signed in", () => {
      vi.mocked(getCurrentUid).mockReturnValue(null);
      expect(getUserId()).toBeNull();
    });
  });
});
