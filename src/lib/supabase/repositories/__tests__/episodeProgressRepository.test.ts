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
  rating: null,
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

  // ── Phase 6 Task 2: per-episode rating ────────────────────────────
  describe("updateEpisodeRating", () => {
    it("returns no error on success when setting a rating (row exists)", async () => {
      // count: 1 simulates "1 row was updated by the UPDATE step" —
      // so the INSERT fallback should NOT fire.
      const { client } = createMockSupabase({ listData: [], count: 1 });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.updateEpisodeRating("vault-1", 1, 5, 8);
      expect(result.error).toBeNull();
    });

    it("returns no error when clearing the rating (null)", async () => {
      const { client } = createMockSupabase({ listData: [], count: 1 });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.updateEpisodeRating("vault-1", 1, 5, null);
      expect(result.error).toBeNull();
    });

    it("returns error on failure", async () => {
      const err = new Error("Rating update failed");
      const { client } = createMockSupabaseError(err);
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.updateEpisodeRating("vault-1", 1, 5, 8);
      expect(result.error).toBe(err);
    });

    // ── BUGFIX: rating persistence when the episode_progress row is
    // missing. Before the fix, `updateEpisodeRating` was a plain UPDATE
    // that silently no-op'd on missing rows — so ratings vanished on
    // the next page refresh. The fix is a two-step upsert: UPDATE first;
    // if zero rows affected, INSERT with watched-episode defaults. ──

    it("INSERTS a new row when the UPDATE affects zero rows (row missing) and rating is non-null", async () => {
      // count: 0 simulates "the UPDATE matched zero rows" — the
      // episode_progress row doesn't exist yet (e.g. the tracker
      // jumped past this episode). The fix should fall back to INSERT.
      const { client, query } = createMockSupabase({ listData: [], count: 0 });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.updateEpisodeRating("vault-1", 1, 5, 8);
      expect(result.error).toBeNull();
      // Verify the INSERT path fired: upsert should have been called
      // with a payload that includes the rating + watched-episode defaults.
      expect(query.upsert).toHaveBeenCalledTimes(1);
      const upsertArg = query.upsert.mock.calls[0][0];
      expect(upsertArg).toMatchObject({
        vault_id: "vault-1",
        season_number: 1,
        episode_number: 5,
        rating: 8,
        is_completed: true,
        progress_minutes: 0
      });
      // watched_at should be a valid ISO string (set to now()).
      expect(typeof upsertArg.watched_at).toBe("string");
      expect(new Date(upsertArg.watched_at).getTime()).not.toBeNaN();
    });

    it("does NOT insert when the row is missing AND rating is null (nothing to clear)", async () => {
      // count: 0 + rating: null → the row doesn't exist and we're
      // trying to clear a rating. There's nothing to clear, so we
      // should NOT create a row just to store NULL.
      const { client, query } = createMockSupabase({ listData: [], count: 0 });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.updateEpisodeRating("vault-1", 1, 5, null);
      expect(result.error).toBeNull();
      // The INSERT/upsert path should NOT have fired.
      expect(query.upsert).not.toHaveBeenCalled();
    });

    it("does NOT insert when the UPDATE succeeds (count > 0)", async () => {
      // count: 1 → the UPDATE matched an existing row, so the INSERT
      // fallback should be skipped.
      const { client, query } = createMockSupabase({ listData: [], count: 1 });
      const repo = new EpisodeProgressRepository(client as never);
      const result = await repo.updateEpisodeRating("vault-1", 1, 5, 8);
      expect(result.error).toBeNull();
      // The UPDATE path should have fired (update called with { rating }).
      expect(query.update).toHaveBeenCalledTimes(1);
      expect(query.update.mock.calls[0][0]).toEqual({ rating: 8 });
      // The INSERT/upsert path should NOT have fired.
      expect(query.upsert).not.toHaveBeenCalled();
    });

    it("scopes the UPDATE to the target row via eq filters", async () => {
      // Verify the UPDATE is filtered to the right vault_id + season + episode
      // so we never accidentally update a different episode's rating.
      const { client, query } = createMockSupabase({ listData: [], count: 1 });
      const repo = new EpisodeProgressRepository(client as never);
      await repo.updateEpisodeRating("vault-1", 2, 3, 5);
      // eq should have been called for vault_id, season_number, episode_number.
      const eqCalls = query.eq.mock.calls.map((c) => c[0]);
      expect(eqCalls).toContain("vault_id");
      expect(eqCalls).toContain("season_number");
      expect(eqCalls).toContain("episode_number");
    });
  });

  describe("updateEpisodeFeedback", () => {
    it("updates rating and reaction together without inserting when the row exists", async () => {
      const { client, query } = createMockSupabase({ listData: [], count: 1 });
      const repo = new EpisodeProgressRepository(client as never);

      const result = await repo.updateEpisodeFeedback(
        "vault-1",
        2,
        3,
        9,
        "wow"
      );

      expect(result.error).toBeNull();
      expect(query.update).toHaveBeenCalledWith(
        { rating: 9, reaction: "wow" },
        { count: "exact" }
      );
      expect(query.upsert).not.toHaveBeenCalled();
    });

    it("upserts reaction feedback when the episode row is missing", async () => {
      const { client, query } = createMockSupabase({ listData: [], count: 0 });
      const repo = new EpisodeProgressRepository(client as never);

      const result = await repo.updateEpisodeFeedback(
        "vault-1",
        1,
        4,
        null,
        "love" as never
      );

      expect(result.error).toBeNull();
      expect(query.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          vault_id: "vault-1",
          season_number: 1,
          episode_number: 4,
          rating: null,
          reaction: "love",
          is_completed: true
        }),
        { onConflict: "vault_id,season_number,episode_number" }
      );
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

    // Phase 6 Task 2 — rating field
    it("defaults rating to null when not provided", () => {
      const result = toInsert({
        vaultId: "v1",
        seasonNumber: 1,
        episodeNumber: 1
      });
      expect(result.rating).toBeNull();
    });

    it("passes rating through when provided", () => {
      const result = toInsert({
        vaultId: "v1",
        seasonNumber: 1,
        episodeNumber: 1,
        rating: 8
      });
      expect(result.rating).toBe(8);
    });

    it("passes null rating through (explicit clear)", () => {
      const result = toInsert({
        vaultId: "v1",
        seasonNumber: 1,
        episodeNumber: 1,
        rating: null
      });
      expect(result.rating).toBeNull();
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
