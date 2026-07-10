// src/features/dashboard/__tests__/recommendationEngine.test.ts
import { describe, it, expect } from "vitest";
import {
  pickContinueWatching,
  pickRandomPlanned,
  pickHighestRated,
  pickRecentlyAdded,
  pickRandomFeatured,
  getRecommendation,
} from "../recommendationEngine";
import {makeMovie} from "~/__test-fixtures__/factories";
import type { WatchlistItem } from "~/shared/types";

describe("recommendationEngine", () => {
  describe("pickContinueWatching", () => {
    it("returns null for empty watchlist", () => {
      expect(pickContinueWatching([])).toBeNull();
    });

    it("returns null when no Watching items", () => {
      const list = [
        makeMovie({ id: "1", status: "Planned" }),
        makeMovie({ id: "2", status: "Completed" }),
      ];
      expect(pickContinueWatching(list)).toBeNull();
    });

    it("returns the most recently watched Watching item", () => {
      const list = [
        makeMovie({
          id: "old",
          status: "Watching",
          watchProgress: { updatedAt: "2024-01-01T00:00:00Z" } as WatchlistItem["watchProgress"],
        }),
        makeMovie({
          id: "new",
          status: "Watching",
          watchProgress: { updatedAt: "2024-06-01T00:00:00Z" } as WatchlistItem["watchProgress"],
        }),
      ];
      expect(pickContinueWatching(list)?.id).toBe("new");
    });
  });

  describe("pickRandomPlanned", () => {
    it("returns null for empty watchlist", () => {
      expect(pickRandomPlanned([], null)).toBeNull();
    });

    it("returns null when no Planned items", () => {
      const list = [makeMovie({ status: "Completed" })];
      expect(pickRandomPlanned(list, null)).toBeNull();
    });

    it("returns forced item when id matches", () => {
      const list = [
        makeMovie({ id: "1", status: "Planned" }),
        makeMovie({ id: "2", status: "Planned" }),
      ];
      expect(pickRandomPlanned(list, "2")?.id).toBe("2");
    });

    it("returns first planned when forced id doesn't match", () => {
      const list = [makeMovie({ id: "1", status: "Planned" })];
      expect(pickRandomPlanned(list, "nonexistent")?.id).toBe("1");
    });

    it("includes 'Plan to Watch' items", () => {
      const list = [makeMovie({ id: "1", status: "Plan to Watch" })];
      expect(pickRandomPlanned(list, null)?.id).toBe("1");
    });
  });

  describe("pickHighestRated", () => {
    it("returns null for empty watchlist", () => {
      expect(pickHighestRated([])).toBeNull();
    });

    it("returns highest IMDb-rated non-Completed item", () => {
      const list = [
        makeMovie({ id: "1", imdbRating: "7.0", status: "Planned" }),
        makeMovie({ id: "2", imdbRating: "9.0", status: "Planned" }),
        makeMovie({ id: "3", imdbRating: "10.0", status: "Completed" }), // excluded
      ];
      expect(pickHighestRated(list)?.id).toBe("2");
    });

    it("falls back to user rating when IMDb is equal", () => {
      const list = [
        makeMovie({ id: "1", imdbRating: "8.0", rating: 5, status: "Planned" }),
        makeMovie({ id: "2", imdbRating: "8.0", rating: 9, status: "Planned" }),
      ];
      expect(pickHighestRated(list)?.id).toBe("2");
    });
  });

  describe("pickRecentlyAdded", () => {
    it("returns null for empty watchlist", () => {
      expect(pickRecentlyAdded([])).toBeNull();
    });

    it("returns the most recently added item", () => {
      const list = [
        makeMovie({ id: "1", addedAt: "2024-01-01T00:00:00Z" }),
        makeMovie({ id: "2", addedAt: "2024-06-01T00:00:00Z" }),
      ];
      expect(pickRecentlyAdded(list)?.id).toBe("2");
    });

    it("handles Firestore timestamp object", () => {
      const list = [
        makeMovie({ id: "1", addedAt: { seconds: 1700000000, nanoseconds: 0 } }),
        makeMovie({ id: "2", addedAt: { seconds: 1600000000, nanoseconds: 0 } }),
      ];
      expect(pickRecentlyAdded(list)?.id).toBe("1");
    });
  });

  describe("pickRandomFeatured", () => {
    it("returns null for empty watchlist", () => {
      expect(pickRandomFeatured([], null, 0)).toBeNull();
    });

    it("picks from Planned pool first", () => {
      const list = [
        makeMovie({ id: "p1", status: "Planned" }),
        makeMovie({ id: "w1", status: "Watching" }),
      ];
      const result = pickRandomFeatured(list, null, 0);
      expect(result?.id).toBe("p1");
    });

    it("excludes items by excludeId", () => {
      const list = [
        makeMovie({ id: "p1", status: "Planned" }),
        makeMovie({ id: "p2", status: "Planned" }),
      ];
      const result = pickRandomFeatured(list, "p1", 0);
      expect(result?.id).toBe("p2");
    });

    it("falls back to Watching when no Planned", () => {
      const list = [makeMovie({ id: "w1", status: "Watching" })];
      const result = pickRandomFeatured(list, null, 0);
      expect(result?.id).toBe("w1");
    });

    it("falls back to Completed when no Planned or Watching", () => {
      const list = [makeMovie({ id: "c1", status: "Completed" })];
      const result = pickRandomFeatured(list, null, 0);
      expect(result?.id).toBe("c1");
    });

    it("uses seed for deterministic selection", () => {
      const list = Array.from({ length: 10 }, (_, i) =>
        makeMovie({ id: String(i), status: "Planned" }),
      );
      const result1 = pickRandomFeatured(list, null, 5);
      const result2 = pickRandomFeatured(list, null, 5);
      expect(result1?.id).toBe(result2?.id);
    });
  });

  describe("getRecommendation", () => {
    it("returns empty context for empty watchlist", () => {
      const result = getRecommendation([], null, 0);
      expect(result.context).toBe("empty");
      expect(result.item).toBeNull();
      expect(result.canShuffle).toBe(false);
    });

    it("returns continue context when Watching items exist", () => {
      const list = [
        makeMovie({ id: "1", status: "Watching" }),
      ];
      const result = getRecommendation(list, null, 0);
      expect(result.context).toBe("continue");
      expect(result.isResume).toBe(true);
      expect(result.badge).toBe("CONTINUE WATCHING");
    });

    it("returns tonight context when only Planned items", () => {
      const list = [
        makeMovie({ id: "1", status: "Planned" }),
      ];
      const result = getRecommendation(list, null, 0);
      expect(result.context).toBe("tonight");
      expect(result.badge).toBe("TONIGHT'S PICK");
      expect(result.canShuffle).toBe(false); // only 1 item
    });

    it("returns tonight context with canShuffle when >1 Planned items", () => {
      const list = [
        makeMovie({ id: "1", status: "Planned" }),
        makeMovie({ id: "2", status: "Planned" }),
      ];
      const result = getRecommendation(list, null, 0);
      expect(result.context).toBe("tonight");
      expect(result.canShuffle).toBe(true);
    });

    it("returns history context when only Completed items", () => {
      const list = [
        makeMovie({ id: "1", status: "Completed" }),
      ];
      const result = getRecommendation(list, null, 0);
      expect(result.context).toBe("history");
      expect(result.badge).toBe("FROM YOUR HISTORY");
    });
  });
});
