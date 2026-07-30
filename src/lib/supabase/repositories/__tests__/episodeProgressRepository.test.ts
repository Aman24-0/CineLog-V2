// src/lib/supabase/repositories/__tests__/episodeProgressRepository.test.ts
import { describe, it, expect } from "vitest";
import { EpisodeProgressRepository } from "../episodeProgress/episodeProgress.repository";
import {
  toInsert,
  toCompletedUpdate
} from "../episodeProgress/episodeProgress.utils";
import type {
  EpisodeProgressRow,
  UpsertEpisodeProgressPayload
} from "../episodeProgress/episodeProgress.types";
import {
  createMockSupabase,
  createMockSupabaseError
} from "~/__test-fixtures__/mockSupabase";

const mockRow: EpisodeProgressRow = {
  id: "ep-1",
  vault_id: "vault-1",
  season_number: 1,
  episode_number: 5,
  is_completed: false,
  progress_minutes: 30,
  watched_at: "2024-06-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z"
} as unknown as EpisodeProgressRow;

describe("EpisodeProgressRepository", () => {
  describe("getEpisodeProgressForVaultItem", () => {
    it("returns list of progress records", async () => {
      const { client } = createMockSupabase({ listData: [mockRow] });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.getEpisodeProgressForVaultItem("vault-1");
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it("returns empty array when no records", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.getEpisodeProgressForVaultItem("vault-1");
      expect(result.data).toEqual([]);
    });

    it("returns error on failure", async () => {
      const err = new Error("Query failed");
      const { client } = createMockSupabaseError(err);
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.getEpisodeProgressForVaultItem("vault-1");
      expect(result.data).toEqual([]);
      expect(result.error).toBe(err);
    });
  });

  describe("getLatestEpisodeProgress", () => {
    it("returns the latest record", async () => {
      const { client } = createMockSupabase({ singleData: mockRow });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.getLatestEpisodeProgress("vault-1");
      expect(result.data).toEqual(mockRow);
    });

    it("returns null when no records", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.getLatestEpisodeProgress("vault-1");
      expect(result.data).toBeNull();
    });
  });

  describe("getLatestEpisodeProgressBatch", () => {
    it("returns empty Map for empty input", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.getLatestEpisodeProgressBatch([]);
      expect(result.data.size).toBe(0);
      expect(result.error).toBeNull();
    });

    it("returns Map keyed by vault_id", async () => {
      const row1 = { ...mockRow, vault_id: "v1" };
      const row2 = { ...mockRow, vault_id: "v2", id: "ep-2" };
      const { client } = createMockSupabase({ listData: [row1, row2] });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.getLatestEpisodeProgressBatch(["v1", "v2"]);
      expect(result.data.size).toBe(2);
      expect(result.data.get("v1")).toEqual(row1);
      expect(result.data.get("v2")).toEqual(row2);
    });

    it("keeps only the first (latest) row per vault_id", async () => {
      // Input is ordered by watched_at desc, so first row per vault_id is latest
      const row1 = { ...mockRow, vault_id: "v1", watched_at: "2024-06-02" };
      const row2 = {
        ...mockRow,
        vault_id: "v1",
        watched_at: "2024-06-01",
        id: "ep-2"
      };
      const { client } = createMockSupabase({ listData: [row1, row2] });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.getLatestEpisodeProgressBatch(["v1"]);
      expect(result.data.size).toBe(1);
      expect(result.data.get("v1")?.watched_at).toBe("2024-06-02");
    });

    it("returns error on failure", async () => {
      const err = new Error("Batch failed");
      const { client } = createMockSupabaseError(err);
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.getLatestEpisodeProgressBatch(["v1"]);
      expect(result.data.size).toBe(0);
      expect(result.error).toBe(err);
    });
  });

  describe("getCompletedEpisodeCount", () => {
    it("returns count on success", async () => {
      // Count queries use head:true, so we mock the listData as empty
      // but the count comes from a different path. For now, this returns
      // 0 because our mock doesn't support count.
      const { client } = createMockSupabase({ listData: [] });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.getCompletedEpisodeCount("vault-1");
      expect(result.count).toBe(0); // mock returns count=0
      expect(result.error).toBeNull();
    });
  });

  describe("upsertEpisodeProgress", () => {
    it("returns the upserted row on success", async () => {
      const { client } = createMockSupabase({ singleData: mockRow });
      const repo = new EpisodeProgressRepository(client as never);
      const payload: UpsertEpisodeProgressPayload = {
        vaultId: "vault-1",
        seasonNumber: 1,
        episodeNumber: 5
      };
      const result = await repo.upsertEpisodeProgress(payload);
      expect(result.data).toEqual(mockRow);
    });

    it("returns error on failure", async () => {
      const err = new Error("Upsert failed");
      const { client } = createMockSupabaseError(err);
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.upsertEpisodeProgress({
        vaultId: "vault-1",
        seasonNumber: 1,
        episodeNumber: 5
      });
      expect(result.error).toBe(err);
    });

    it("calls upsert with onConflict option", async () => {
      const { client, query } = createMockSupabase({ singleData: mockRow });
      const repo = new EpisodeProgressRepository(client as never);
      await repo.upsertEpisodeProgress({
        vaultId: "vault-1",
        seasonNumber: 1,
        episodeNumber: 5
      });
      expect(query.upsert).toHaveBeenCalledWith(expect.any(Object), {
        onConflict: "vault_id,season_number,episode_number"
      });
    });
  });

  describe("markEpisodeCompleted", () => {
    it("returns no error on success", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.markEpisodeCompleted("vault-1", 1, 5);
      expect(result.error).toBeNull();
    });

    it("returns error on failure", async () => {
      const err = new Error("Update failed");
      const { client } = createMockSupabaseError(err);
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.markEpisodeCompleted("vault-1", 1, 5);
      expect(result.error).toBe(err);
    });
  });

  describe("clearEpisodeProgress", () => {
    it("returns no error on success", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.clearEpisodeProgress("vault-1");
      expect(result.error).toBeNull();
    });

    it("returns error on failure", async () => {
      const err = new Error("Delete failed");
      const { client } = createMockSupabaseError(err);
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.clearEpisodeProgress("vault-1");
      expect(result.error).toBe(err);
    });
  });
});

describe("episodeProgress.utils", () => {
  describe("toInsert", () => {
    it("maps payload to insert shape with defaults", () => {
      const result = toInsert({
        vaultId: "v1",
        seasonNumber: 2,
        episodeNumber: 3
      });
      expect(result.vault_id).toBe("v1");
      expect(result.season_number).toBe(2);
      expect(result.episode_number).toBe(3);
      expect(result.is_completed).toBe(false); // default
      expect(result.progress_minutes).toBe(0); // default
      expect(result.watched_at).toBeDefined(); // auto-set to ISO string
    });

    it("uses provided values over defaults", () => {
      const result = toInsert({
        vaultId: "v1",
        seasonNumber: 1,
        episodeNumber: 1,
        isCompleted: true,
        progressMinutes: 45,
        watchedAt: "2024-01-01T00:00:00Z"
      });
      expect(result.is_completed).toBe(true);
      expect(result.progress_minutes).toBe(45);
      expect(result.watched_at).toBe("2024-01-01T00:00:00Z");
    });

    it("handles null watchedAt (falls back to now)", () => {
      const result = toInsert({
        vaultId: "v1",
        seasonNumber: 1,
        episodeNumber: 1,
        watchedAt: null
      });
      expect(result.watched_at).toBeDefined();
    });
  });

  describe("toCompletedUpdate", () => {
    it("returns { is_completed: true, watched_at: <now> }", () => {
      const result = toCompletedUpdate();
      expect(result.is_completed).toBe(true);
      expect(result.watched_at).toBeDefined();
      // Verify it's a valid ISO string
      expect(new Date(result.watched_at as string).getTime()).not.toBeNaN();
    });
  });
});
