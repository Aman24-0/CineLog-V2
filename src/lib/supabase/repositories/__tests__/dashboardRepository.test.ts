// src/lib/supabase/repositories/__tests__/dashboardRepository.test.ts
import { describe, it, expect, vi } from "vitest";
import { DashboardRepository } from "../dashboard/dashboard.repository";
import {
  applyPagination,
  CONTINUE_WATCHING_OR_FILTER,
  VAULT_DASHBOARD_COLUMNS,
  COLLECTION_DASHBOARD_COLUMNS,
  EPISODE_PROGRESS_DASHBOARD_COLUMNS
} from "../dashboard/dashboard.utils";
import {
  createMockSupabase,
  createMockSupabaseError
} from "~/__test-fixtures__/mockSupabase";
import { vaultRowToWatchlistItem } from "~/shared/hooks/userLibraryAdapter";
import type { VaultRow } from "~/lib/supabase/repositories";

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
  deleted_at: null
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

    // ── End-to-end production read-path regression (2026-09-02) ──────────
    // The bug: VAULT_DASHBOARD_COLUMNS omitted the 6 activity columns, so
    // the Supabase SELECT projection never returned them even though the
    // vault table had the values. This test verifies the ACTUAL production
    // read path:
    //
    //   DashboardRepository.getAllVaultItems()
    //   → supabase.from("vault").select(VAULT_DASHBOARD_COLUMNS)
    //   → vaultRowToWatchlistItem()
    //
    // It asserts BOTH:
    //   1. The SELECT projection passed to supabase.from("vault").select()
    //      contains every activity column (would fail against the buggy
    //      projection that ended at "tag").
    //   2. A VaultRow containing activity values, when passed through
    //      vaultRowToWatchlistItem, produces a WatchlistItem with the
    //      activity fields preserved (matches the user's SUCCESS CRITERIA).
    it("passes ALL activity columns to supabase.from('vault').select() AND preserves them through vaultRowToWatchlistItem (regression: activity read-back after refresh)", async () => {
      // A VaultRow that has the activity columns populated — simulates
      // what Supabase returns for a row where the user saved activity data
      // via the Edit modal.
      const rowWithActivity: VaultRow = {
        ...mockVaultRow,
        reaction: "loved_it",
        watch_device: "theatre",
        watch_platform: "sonyliv",
        favorite_character_id: "123",
        favorite_character_name: "Test Character",
        favorite_character_profile: "/test.jpg",
        tag: "Theatre"
      } as unknown as VaultRow;

      const { client, query } = createMockSupabase({
        listData: [rowWithActivity]
      });
      const repo = new DashboardRepository(client as never);

      // 1. Production call — supabase.from("vault").select(...) is invoked
      //    with the VAULT_DASHBOARD_COLUMNS string. Verify the SELECT
      //    projection contains every activity column.
      const result = await repo.getAllVaultItems("user-1");
      expect(query.select).toHaveBeenCalledTimes(1);
      const selectArg = query.select.mock.calls[0]![0] as string;
      expect(selectArg).toBe(VAULT_DASHBOARD_COLUMNS);
      expect(selectArg).toContain("reaction");
      expect(selectArg).toContain("watch_device");
      expect(selectArg).toContain("watch_platform");
      expect(selectArg).toContain("favorite_character_id");
      expect(selectArg).toContain("favorite_character_name");
      expect(selectArg).toContain("favorite_character_profile");
      expect(selectArg).toContain("tag");

      // 2. The returned VaultRow, when passed through the production
      //    mapper, produces a WatchlistItem with all activity fields
      //    preserved (matches the user's SUCCESS CRITERIA from the bug
      //    report).
      expect(result.data).toHaveLength(1);
      const watchlistItem = vaultRowToWatchlistItem(result.data![0]!);
      expect(watchlistItem.reaction).toBe("loved_it");
      expect(watchlistItem.watchDevice).toBe("theatre");
      expect(watchlistItem.watchPlatform).toBe("sonyliv");
      expect(watchlistItem.favoriteCharacterId).toBe("123");
      expect(watchlistItem.favoriteCharacterName).toBe("Test Character");
      expect(watchlistItem.favoriteCharacterProfile).toBe("/test.jpg");
    });
  });

  describe("getRecentlyAdded", () => {
    it("returns items ordered by created_at desc", async () => {
      const { client, query } = createMockSupabase({
        listData: [mockVaultRow]
      });
      const repo = new DashboardRepository(client as never);
      await repo.getRecentlyAdded("user-1");
      expect(query.order).toHaveBeenCalledWith(
        "created_at",
        expect.any(Object)
      );
    });

    it("accepts pagination", async () => {
      const { client, query } = createMockSupabase({
        listData: [mockVaultRow]
      });
      const repo = new DashboardRepository(client as never);
      await repo.getRecentlyAdded("user-1", { limit: 5, offset: 10 });
      expect(query.range).toHaveBeenCalledWith(10, 14);
    });
  });

  describe("getRecentlyUpdated", () => {
    it("returns items ordered by updated_at desc", async () => {
      const { client, query } = createMockSupabase({
        listData: [mockVaultRow]
      });
      const repo = new DashboardRepository(client as never);
      await repo.getRecentlyUpdated("user-1");
      expect(query.order).toHaveBeenCalledWith(
        "updated_at",
        expect.any(Object)
      );
    });
  });

  describe("getPinnedItems", () => {
    it("filters by is_pinned = true", async () => {
      const { client, query } = createMockSupabase({
        listData: [mockVaultRow]
      });
      const repo = new DashboardRepository(client as never);
      await repo.getPinnedItems("user-1");
      expect(query.eq).toHaveBeenCalledWith("is_pinned", true);
    });
  });

  describe("getFavorites", () => {
    it("filters by is_favorite = true", async () => {
      const { client, query } = createMockSupabase({
        listData: [mockVaultRow]
      });
      const repo = new DashboardRepository(client as never);
      await repo.getFavorites("user-1");
      expect(query.eq).toHaveBeenCalledWith("is_favorite", true);
    });
  });

  describe("getWatchingNow", () => {
    it("filters by status = watching", async () => {
      const { client, query } = createMockSupabase({
        listData: [mockVaultRow]
      });
      const repo = new DashboardRepository(client as never);
      await repo.getWatchingNow("user-1");
      expect(query.eq).toHaveBeenCalledWith("status", "watching");
    });
  });

  describe("getCompletedRecently", () => {
    it("filters by status = completed", async () => {
      const { client, query } = createMockSupabase({
        listData: [mockVaultRow]
      });
      const repo = new DashboardRepository(client as never);
      await repo.getCompletedRecently("user-1");
      expect(query.eq).toHaveBeenCalledWith("status", "completed");
    });
  });

  describe("getContinueWatching", () => {
    it("returns enriched items with episode progress for TV", async () => {
      const tvRow = {
        ...mockVaultRow,
        id: "v1",
        media_type: "tv",
        status: "watching"
      };
      const { client } = createMockSupabase({ listData: [tvRow] });
      const repo = new DashboardRepository(client as never);
      const result = await repo.getContinueWatching("user-1");
      expect(result.data).toHaveLength(1);
      expect(result.data[0].vault).toEqual(tvRow);
      // latestProgress is null because mock returns null for maybeSingle
      expect(result.data[0].latestProgress).toBeNull();
    });

    it("returns movies with latestProgress = null (no progress lookup)", async () => {
      const movieRow = {
        ...mockVaultRow,
        media_type: "movie",
        status: "watching"
      };
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
      expect(CONTINUE_WATCHING_OR_FILTER).toBe(
        "watched_on.is.null,completed_at.is.null"
      );
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

    // ── Activity columns regression test (2026-09-02) ───────────────────
    // The vault table has 6 activity columns that are written by the
    // Details/Edit modal's save flow and read by vaultRowToWatchlistItem
    // in userLibraryAdapter.ts. If ANY of these columns is missing from
    // VAULT_DASHBOARD_COLUMNS, the Supabase SELECT projection omits them,
    // the mapper receives undefined, and the WatchlistItem's activity
    // fields collapse to null — the Edit modal's Activity section is
    // always blank after a hard refresh even though Supabase has the
    // values. This test asserts every activity column is present.
    it("includes ALL activity columns needed by the Edit modal (regression: activity read-back after refresh)", () => {
      // Sanity: confirm the test would have failed against the previous
      // (buggy) projection by checking that the buggy projection did
      // NOT contain these columns. This guards against accidental
      // regression if someone re-introduces the omission.
      const buggyProjection =
        "id,user_id,tmdb_id,media_type,status,is_favorite,is_pinned,rating,notes,rewatch_count,rewatch_dates,progress_minutes,watched_on,started_at,completed_at,last_activity_at,created_at,updated_at,deleted_at,season_dates,season_rewatch_count,season_rewatch_dates,tag";
      expect(buggyProjection).not.toContain("reaction");
      expect(buggyProjection).not.toContain("watch_device");
      expect(buggyProjection).not.toContain("watch_platform");
      expect(buggyProjection).not.toContain("favorite_character_id");
      expect(buggyProjection).not.toContain("favorite_character_name");
      expect(buggyProjection).not.toContain("favorite_character_profile");

      // The current projection MUST contain every activity column.
      expect(VAULT_DASHBOARD_COLUMNS).toContain("reaction");
      expect(VAULT_DASHBOARD_COLUMNS).toContain("watch_device");
      expect(VAULT_DASHBOARD_COLUMNS).toContain("watch_platform");
      expect(VAULT_DASHBOARD_COLUMNS).toContain("favorite_character_id");
      expect(VAULT_DASHBOARD_COLUMNS).toContain("favorite_character_name");
      expect(VAULT_DASHBOARD_COLUMNS).toContain("favorite_character_profile");
      // tag must still be present (was the only activity-adjacent column
      // in the buggy projection).
      expect(VAULT_DASHBOARD_COLUMNS).toContain("tag");
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
