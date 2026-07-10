// src/features/dashboard/__tests__/dashboardAdapter.test.ts
import { describe, it, expect } from "vitest";
import { vaultRowToItem } from "../dashboardAdapter";
import type { DashboardStatValues, DashboardDataPayload } from "../dashboardAdapter";
import type { VaultRow } from "~/lib/supabase/repositories";

describe("dashboardAdapter", () => {
  describe("vaultRowToItem (re-export from userLibraryAdapter)", () => {
    it("maps a VaultRow to a WatchlistItem", () => {
      const row: VaultRow = {
        id: "vault-1",
        user_id: "user-1",
        tmdb_id: 123,
        media_type: "movie",
        status: "planned",
        is_favorite: false,
        is_pinned: false,
        rating: 8,
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

      const result = vaultRowToItem(row);
      expect(result.id).toBe("123");
      expect(result.media_type).toBe("movie");
      expect(result.status).toBe("Planned");
      expect(result.rating).toBe(8);
    });
  });

  describe("DashboardStatValues type", () => {
    it("has the correct shape", () => {
      const stats: DashboardStatValues = {
        total: 10,
        watching: 3,
        completed: 5,
        planned: 2,
        favorites: 4,
        pinned: 1,
      };
      expect(stats.total).toBe(10);
      expect(stats.watching).toBe(3);
      expect(stats.completed).toBe(5);
      expect(stats.planned).toBe(2);
      expect(stats.favorites).toBe(4);
      expect(stats.pinned).toBe(1);
    });
  });

  describe("DashboardDataPayload type", () => {
    it("has the correct shape", () => {
      const payload: DashboardDataPayload = {
        watchlist: [],
        stats: {
          total: 0,
          watching: 0,
          completed: 0,
          planned: 0,
          favorites: 0,
          pinned: 0,
        },
        isGuest: false,
      };
      expect(payload.watchlist).toEqual([]);
      expect(payload.stats.total).toBe(0);
      expect(payload.isGuest).toBe(false);
    });
  });
});
