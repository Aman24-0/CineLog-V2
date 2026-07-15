// src/lib/supabase/repositories/__tests__/dashboardRepository.test.ts
import { describe, it, expect, vi } from "vitest";
import { DashboardRepository } from "../dashboard/dashboard.repository";
import {
  applyPagination,
  CONTINUE_WATCHING_OR_FILTER,
  VAULT_DASHBOARD_COLUMNS,
  COLLECTION_DASHBOARD_COLUMNS,
  EPISODE_PROGRESS_DASHBOARD_COLUMNS,
} from "../dashboard/dashboard.utils";
import { createMockSupabase, createMockSupabaseError } from "~/__test-fixtures__/mockSupabase";

// Mock vault row shape (matches Tables<"vault">)
const mockVaultRow = {
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
};

describe("DashboardRepository", () => {
  describe("getAllVaultItems", () => {
    it("returns all vault items on success", async () => {
      const { client } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new DashboardRepository(client as never);
      const result = await repo.getAllVaultItems("user-1");
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it("returns empty array when no items", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new DashboardRepository(client as never);
      const result = await repo.getAllVaultItems("user-1");
      expect(result.data).toEqual([]);
    });

    it("returns error on failure", async () => {
      const err = new Error("Query failed");
      const { client } = createMockSupabaseError(err);
      const repo = new DashboardRepository(client as never);
      const result = await repo.getAllVaultItems("user-1");
      expect(result.data).toEqual([]);
      expect(result.error).toBe(err);
    });
  });

  describe("getRecentlyAdded", () => {
    it("returns items ordered by created_at desc", async () => {
      const { client, query } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new DashboardRepository(client as never);
      await repo.getRecentlyAdded("user-1");
      expect(query.order).toHaveBeenCalledWith("created_at", expect.any(Object));
    });

    it("accepts pagination", async () => {
      const { client, query } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new DashboardRepository(client as never);
      await repo.getRecentlyAdded("user-1", { limit: 5, offset: 10 });
      expect(query.range).toHaveBeenCalledWith(10, 14);
    });
  });

  describe("getRecentlyUpdated", () => {
    it("returns items ordered by updated_at desc", async () => {
      const { client, query } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new DashboardRepository(client as never);
      await repo.getRecentlyUpdated("user-1");
      expect(query.order).toHaveBeenCalledWith("updated_at", expect.any(Object));
    });
  });

  describe("getPinnedItems", () => {
    it("filters by is_pinned = true", async () => {
      const { client, query } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new DashboardRepository(client as never);
      await repo.getPinnedItems("user-1");
      expect(query.eq).toHaveBeenCalledWith("is_pinned", true);
    });
  });

  describe("getFavorites", () => {
    it("filters by is_favorite = true", async () => {
      const { client, query } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new DashboardRepository(client as never);
      await repo.getFavorites("user-1");
      expect(query.eq).toHaveBeenCalledWith("is_favorite", true);
    });
  });

  describe("getWatchingNow", () => {
    it("filters by status = watching", async () => {
      const { client, query } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new DashboardRepository(client as never);
      await repo.getWatchingNow("user-1");
      expect(query.eq).toHaveBeenCalledWith("status", "watching");
    });
  });

  describe("getCompletedRecently", () => {
    it("filters by status = completed", async () => {
      const { client, query } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new DashboardRepository(client as never);
      await repo.getCompletedRecently("user-1");
      expect(query.eq).toHaveBeenCalledWith("status", "completed");
    });
  });

  describe("getContinueWatching", () => {
    it("returns enriched items with episode progress for TV", async () => {
      const tvRow = { ...mockVaultRow, id: "v1", media_type: "tv", status: "watching" };
      const { client } = createMockSupabase({ listData: [tvRow] });
      const repo = new DashboardRepository(client as never);
      const result = await repo.getContinueWatching("user-1");
      expect(result.data).toHaveLength(1);
      expect(result.data[0].vault).toEqual(tvRow);
      // latestProgress is null because mock returns null for maybeSingle
      expect(result.data[0].latestProgress).toBeNull();
    });

    it("returns movies with latestProgress = null (no progress lookup)", async () => {
      const movieRow = { ...mockVaultRow, media_type: "movie", status: "watching" };
      const { client } = createMockSupabase({ listData: [movieRow] });
      const repo = new DashboardRepository(client as never);
      const result = await repo.getContinueWatching("user-1");
      expect(result.data[0].latestProgress).toBeNull();
    });

    it("returns empty array when no watching items", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new DashboardRepository(client as never);
      const result = await repo.getContinueWatching("user-1");
      expect(result.data).toEqual([]);
    });

    it("uses the Continue Watching OR filter", async () => {
      const { client, query } = createMockSupabase({ listData: [] });
      const repo = new DashboardRepository(client as never);
      await repo.getContinueWatching("user-1");
      expect(query.or).toHaveBeenCalledWith(CONTINUE_WATCHING_OR_FILTER);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Dashboard utils tests
// ─────────────────────────────────────────────────────────────────────

describe("dashboard.utils", () => {
  describe("applyPagination", () => {
    it("returns query unchanged when pagination is undefined", () => {
      const query = { range: vi.fn().mockReturnThis() };
      const result = applyPagination(query, undefined);
      expect(result).toBe(query);
      expect(query.range).not.toHaveBeenCalled();
    });

    it("applies range with offset=0 when offset is undefined", () => {
      const query = { range: vi.fn().mockReturnThis() };
      applyPagination(query, { limit: 10 });
      expect(query.range).toHaveBeenCalledWith(0, 9);
    });

    it("applies range with offset", () => {
      const query = { range: vi.fn().mockReturnThis() };
      applyPagination(query, { limit: 20, offset: 40 });
      expect(query.range).toHaveBeenCalledWith(40, 59);
    });
  });

  describe("CONTINUE_WATCHING_OR_FILTER", () => {
    it("is the correct PostgREST OR expression", () => {
      expect(CONTINUE_WATCHING_OR_FILTER).toBe("watched_on.is.null,completed_at.is.null");
    });
  });

  describe("VAULT_DASHBOARD_COLUMNS", () => {
    it("contains id and user_id", () => {
      expect(VAULT_DASHBOARD_COLUMNS).toContain("id");
      expect(VAULT_DASHBOARD_COLUMNS).toContain("user_id");
    });

    it("includes notes and season_dates (needed by UI)", () => {
      // notes + season_dates + rewatch fields are now included so the
      // edit form's season date pickers, the notes preview, and the
      // rewatch badge all work without a second fetch.
      expect(VAULT_DASHBOARD_COLUMNS).toContain("notes");
      expect(VAULT_DASHBOARD_COLUMNS).toContain("season_dates");
      expect(VAULT_DASHBOARD_COLUMNS).toContain("rewatch_dates");
      expect(VAULT_DASHBOARD_COLUMNS).toContain("season_rewatch_dates");
    });
  });

  describe("COLLECTION_DASHBOARD_COLUMNS", () => {
    it("contains id and name", () => {
      expect(COLLECTION_DASHBOARD_COLUMNS).toContain("id");
      expect(COLLECTION_DASHBOARD_COLUMNS).toContain("name");
    });
  });

  describe("EPISODE_PROGRESS_DASHBOARD_COLUMNS", () => {
    it("contains vault_id and season_number", () => {
      expect(EPISODE_PROGRESS_DASHBOARD_COLUMNS).toContain("vault_id");
      expect(EPISODE_PROGRESS_DASHBOARD_COLUMNS).toContain("season_number");
    });
  });
});
