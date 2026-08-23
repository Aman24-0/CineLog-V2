// src/features/watchlist/__tests__/episodeProgressAdapter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/lib/supabase/repositories", () => ({
  getVaultRepository: vi.fn(),
  getEpisodeProgressRepository: vi.fn()
}));

import {
  enrichWithEpisodeProgress,
  enrichWithEpisodeProgressAsync,
  updateSeasonEpisodeInSupabase,
  updateWatchProgressInSupabase,
  markEpisodeCompletedInSupabase,
  unmarkEpisodeInSupabase,
  updateEpisodeFeedbackInSupabase,
  updateEpisodeRatingInSupabase
} from "../episodeProgressAdapter";
import {
  getVaultRepository,
  getEpisodeProgressRepository
} from "~/lib/supabase/repositories";
import type { VaultRow, EpisodeProgressRow } from "~/lib/supabase/repositories";
import { makeMovie, makeTVSeries } from "~/__test-fixtures__/factories";

const mockVaultRow = {
  id: "vault-uuid-1",
  user_id: "user-1",
  tmdb_id: 123,
  media_type: "tv" as const,
  status: "watching" as const,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z"
} as unknown as VaultRow;

const mockProgress: EpisodeProgressRow = {
  id: "ep-1",
  vault_id: "vault-uuid-1",
  season_number: 2,
  episode_number: 5,
  is_completed: false,
  progress_minutes: 30,
  rating: null,
  watched_at: "2024-06-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z"
} as unknown as EpisodeProgressRow;

describe("episodeProgressAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("enrichWithEpisodeProgress (sync)", () => {
    it("returns items unchanged when no TV items", () => {
      const items = [makeMovie({ id: "1" })];
      const rows = [
        { ...mockVaultRow, media_type: "movie" as const, tmdb_id: 1 }
      ];
      // The sync version fetches progress via the batch repo method
      const mockProgRepo = {
        getLatestEpisodeProgressBatch: vi
          .fn()
          .mockResolvedValue({ data: new Map(), error: null })
      };
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      // enrichWithEpisodeProgress is sync but may return early if no TV items
      const result = enrichWithEpisodeProgress(items, rows);
      expect(result).toBe(items); // same array, no enrichment needed
    });

    it("returns items unchanged when vault rows is empty", () => {
      const items = [makeTVSeries({ id: "1" })];
      const result = enrichWithEpisodeProgress(items, []);
      expect(result).toBe(items);
    });
  });

  describe("enrichWithEpisodeProgressAsync", () => {
    it("enriches TV items with episode progress", async () => {
      const items = [
        makeTVSeries({ id: "123", season: undefined, episode: undefined }),
        makeMovie({ id: "456" })
      ];
      const rows = [
        {
          ...mockVaultRow,
          id: "vault-uuid-1",
          tmdb_id: 123,
          media_type: "tv" as const
        },
        {
          ...mockVaultRow,
          id: "vault-uuid-2",
          tmdb_id: 456,
          media_type: "movie" as const
        }
      ];

      const mockProgRepo = {
        getLatestEpisodeProgressBatch: vi.fn().mockResolvedValue({
          data: new Map([["vault-uuid-1", mockProgress]]),
          error: null
        })
      };
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await enrichWithEpisodeProgressAsync(items, rows);
      // TV item enriched
      expect(result[0].season).toBe(2);
      expect(result[0].episode).toBe(5);
      expect(result[0].watchProgress).toBeDefined();
      // Movie unchanged
      expect(result[1].season).toBeUndefined();
    });

    it("skips progress fetch when no TV items", async () => {
      const items = [makeMovie({ id: "1" })];
      const rows = [
        { ...mockVaultRow, media_type: "movie" as const, tmdb_id: 1 }
      ];

      const mockProgRepo = {
        getLatestEpisodeProgressBatch: vi.fn()
      };
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      await enrichWithEpisodeProgressAsync(items, rows);
      expect(mockProgRepo.getLatestEpisodeProgressBatch).not.toHaveBeenCalled();
    });

    it("returns items unchanged when progress fetch fails", async () => {
      // Use a TV item that already has season/episode from makeTVSeries defaults
      // but verify the enrichment doesn't override them with progress data
      const items = [makeTVSeries({ id: "123", season: 99, episode: 99 })];
      const rows = [
        { ...mockVaultRow, tmdb_id: 123, media_type: "tv" as const }
      ];

      const mockProgRepo = {
        getLatestEpisodeProgressBatch: vi.fn().mockResolvedValue({
          data: new Map(),
          error: new Error("Fail")
        })
      };
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await enrichWithEpisodeProgressAsync(items, rows);
      // When progress fetch fails, the original season/episode are preserved
      // (the adapter doesn't overwrite them)
      expect(result[0].season).toBe(99); // preserved from original
    });
  });

  describe("updateSeasonEpisodeInSupabase", () => {
    it("resolves vault UUID and upserts episode progress", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        upsertEpisodeProgress: vi
          .fn()
          .mockResolvedValue({ data: mockProgress, error: null })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await updateSeasonEpisodeInSupabase(
        "user-1",
        "123",
        "tv",
        2,
        5
      );
      expect(result).toBe(true);
      expect(mockVaultRepo.getVaultByTmdbId).toHaveBeenCalledWith(
        "user-1",
        123,
        "tv"
      );
      expect(mockProgRepo.upsertEpisodeProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          vaultId: "vault-uuid-1",
          seasonNumber: 2,
          episodeNumber: 5
        })
      );
    });

    it("returns false when vault item not found", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi.fn().mockResolvedValue({ data: null, error: null })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);

      const result = await updateSeasonEpisodeInSupabase(
        "user-1",
        "123",
        "tv",
        1,
        1
      );
      expect(result).toBe(false);
    });

    it("returns false on upsert error", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        upsertEpisodeProgress: vi
          .fn()
          .mockResolvedValue({ data: null, error: new Error("Upsert fail") })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await updateSeasonEpisodeInSupabase(
        "user-1",
        "123",
        "tv",
        1,
        1
      );
      expect(result).toBe(false);
    });
  });

  describe("updateWatchProgressInSupabase", () => {
    it("resolves vault UUID and upserts watch progress", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        upsertEpisodeProgress: vi
          .fn()
          .mockResolvedValue({ data: mockProgress, error: null })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const watchProgress = {
        currentTime: 120,
        duration: 600,
        server: null,
        updatedAt: "2024-06-01T00:00:00Z",
        season: 1,
        episode: 3
      };
      await updateWatchProgressInSupabase("user-1", "123", "tv", watchProgress);

      expect(mockProgRepo.upsertEpisodeProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          vaultId: "vault-uuid-1",
          seasonNumber: 1,
          episodeNumber: 3
        })
      );
    });
  });

  describe("markEpisodeCompletedInSupabase", () => {
    it("resolves vault UUID and marks episode completed", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        markEpisodeCompleted: vi.fn().mockResolvedValue({ error: null })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await markEpisodeCompletedInSupabase(
        "user-1",
        "123",
        "tv",
        2,
        5
      );
      expect(result).toBe(true);
      expect(mockProgRepo.markEpisodeCompleted).toHaveBeenCalledWith(
        "vault-uuid-1",
        2,
        5
      );
    });

    it("returns false on mark error", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        markEpisodeCompleted: vi
          .fn()
          .mockResolvedValue({ error: new Error("Mark fail") })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await markEpisodeCompletedInSupabase(
        "user-1",
        "123",
        "tv",
        2,
        5
      );
      expect(result).toBe(false);
    });

    it("returns false when vault item not found", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi.fn().mockResolvedValue({ data: null, error: null })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);

      const result = await markEpisodeCompletedInSupabase(
        "user-1",
        "123",
        "tv",
        2,
        5
      );
      expect(result).toBe(false);
    });
  });

  describe("unmarkEpisodeInSupabase", () => {
    it("resolves vault UUID and deletes episode progress from the given position onward", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        deleteEpisodeProgressFrom: vi.fn().mockResolvedValue({ error: null })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await unmarkEpisodeInSupabase("user-1", "123", "tv", 2, 5);
      expect(result).toBe(true);
      // Verify the vault UUID was resolved via the TMDB identity.
      expect(mockVaultRepo.getVaultByTmdbId).toHaveBeenCalledWith(
        "user-1",
        123,
        "tv"
      );
      // Verify the delete was called with the correct vault + position.
      expect(mockProgRepo.deleteEpisodeProgressFrom).toHaveBeenCalledWith(
        "vault-uuid-1",
        2,
        5
      );
    });

    it("returns false when vault item not found", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi.fn().mockResolvedValue({ data: null, error: null })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);

      const result = await unmarkEpisodeInSupabase("user-1", "123", "tv", 1, 1);
      expect(result).toBe(false);
    });

    it("returns false on delete error", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        deleteEpisodeProgressFrom: vi
          .fn()
          .mockResolvedValue({ error: new Error("Delete fail") })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await unmarkEpisodeInSupabase("user-1", "123", "tv", 2, 5);
      expect(result).toBe(false);
    });
  });

  // ── Phase 6 Task 2: per-episode rating ────────────────────────────
  describe("updateEpisodeRatingInSupabase", () => {
    it("resolves vault UUID and updates the rating on the episode_progress row", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        updateEpisodeRating: vi.fn().mockResolvedValue({ error: null })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await updateEpisodeRatingInSupabase(
        "user-1",
        "123",
        "tv",
        2,
        5,
        8
      );
      expect(result).toBe(true);
      // Verify the vault UUID was resolved via the TMDB identity.
      expect(mockVaultRepo.getVaultByTmdbId).toHaveBeenCalledWith(
        "user-1",
        123,
        "tv"
      );
      // Verify the rating update was called with the correct vault + position + rating.
      expect(mockProgRepo.updateEpisodeRating).toHaveBeenCalledWith(
        "vault-uuid-1",
        2,
        5,
        8
      );
    });

    it("supports clearing the rating (null)", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        updateEpisodeRating: vi.fn().mockResolvedValue({ error: null })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await updateEpisodeRatingInSupabase(
        "user-1",
        "123",
        "tv",
        2,
        5,
        null
      );
      expect(result).toBe(true);
      expect(mockProgRepo.updateEpisodeRating).toHaveBeenCalledWith(
        "vault-uuid-1",
        2,
        5,
        null
      );
    });

    it("returns false when vault item not found", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi.fn().mockResolvedValue({ data: null, error: null })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);

      const result = await updateEpisodeRatingInSupabase(
        "user-1",
        "123",
        "tv",
        2,
        5,
        8
      );
      expect(result).toBe(false);
    });

    it("returns false on update error", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        updateEpisodeRating: vi
          .fn()
          .mockResolvedValue({ error: new Error("Rating update fail") })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await updateEpisodeRatingInSupabase(
        "user-1",
        "123",
        "tv",
        2,
        5,
        8
      );
      expect(result).toBe(false);
    });
  });

  describe("updateEpisodeFeedbackInSupabase", () => {
    it("resolves the vault UUID and saves rating plus reaction together", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        updateEpisodeFeedback: vi.fn().mockResolvedValue({ error: null })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await updateEpisodeFeedbackInSupabase(
        "user-1",
        "123",
        "tv",
        2,
        5,
        9,
        "love"
      );

      expect(result).toBe(true);
      expect(mockProgRepo.updateEpisodeFeedback).toHaveBeenCalledWith(
        "vault-uuid-1",
        2,
        5,
        9,
        "love"
      );
    });

    it("returns false when the combined feedback write fails", async () => {
      const mockVaultRepo = {
        getVaultByTmdbId: vi
          .fn()
          .mockResolvedValue({ data: mockVaultRow, error: null })
      };
      const mockProgRepo = {
        updateEpisodeFeedback: vi
          .fn()
          .mockResolvedValue({ error: new Error("Feedback update fail") })
      };
      vi.mocked(getVaultRepository).mockReturnValue(mockVaultRepo as never);
      vi.mocked(getEpisodeProgressRepository).mockReturnValue(
        mockProgRepo as never
      );

      const result = await updateEpisodeFeedbackInSupabase(
        "user-1",
        "123",
        "tv",
        2,
        5,
        null,
        "disappointed"
      );

      expect(result).toBe(false);
    });
  });
});
