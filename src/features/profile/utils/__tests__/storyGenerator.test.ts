import { describe, it, expect } from "vitest";
import { generateIdentityChips } from "../storyGenerator";
import type { StatsData } from "../../useStats";
import type { WatchlistItem } from "~/shared/types";

describe("generateIdentityChips", () => {
  const createMockStats = (overrides: Partial<StatsData> = {}): StatsData => ({
    total: 10,
    watching: 0,
    completed: 0,
    planned: 0,
    totalRuntimeMinutes: 0,
    totalRuntimeHours: 0,
    movieCount: 5,
    tvCount: 5,
    moviePct: 50,
    tvPct: 50,
    topGenres: [],
    decades: [],
    favoriteDecade: null,
    topDirectors: [],
    heatmap: [],
    monthlyCounts: [],
    weekdayVsWeekend: { weekday: 0, weekend: 0 },
    avgRating: 0,
    topRated: null,
    mostRewatched: null,
    ...overrides
  });

  const createMockWatchlist = (
    length: number,
    overrides: Partial<WatchlistItem> = {}
  ): WatchlistItem[] => {
    return Array.from({ length }).map((_, i) => ({
      id: `id-${i}`,
      media_type: "movie",
      status: "Completed",
      ...overrides
    }));
  };

  it("should return empty array if stats is null", () => {
    const chips = generateIdentityChips(null, createMockWatchlist(3));
    expect(chips).toEqual([]);
  });

  it("should return empty array if watchlist length is less than 3", () => {
    const stats = createMockStats();
    const chips = generateIdentityChips(stats, createMockWatchlist(2));
    expect(chips).toEqual([]);
  });

  describe("1. Genre affinity", () => {
    it("should return Sci-Fi Lover for sci-fi genre", () => {
      const stats = createMockStats({
        topGenres: [{ name: "Science Fiction", count: 3, pct: 30 }]
      });
      const chips = generateIdentityChips(stats, createMockWatchlist(3));
      expect(chips).toContainEqual({
        label: "Sci-Fi Lover",
        icon: "🚀",
        isEmoji: true
      });
    });

    it("should return Horror Aficionado for horror genre", () => {
      const stats = createMockStats({
        topGenres: [{ name: "Horror", count: 3, pct: 30 }]
      });
      const chips = generateIdentityChips(stats, createMockWatchlist(3));
      expect(chips).toContainEqual({
        label: "Horror Aficionado",
        icon: "👻",
        isEmoji: true
      });
    });

    it("should return generic genre lover for unmapped genre", () => {
      const stats = createMockStats({
        topGenres: [{ name: "Western", count: 3, pct: 30 }]
      });
      const chips = generateIdentityChips(stats, createMockWatchlist(3));
      expect(chips).toContainEqual({
        label: "Western Lover",
        icon: "🎬",
        isEmoji: true
      });
    });

    it("should not return genre chip if top genre count is less than 3", () => {
      const stats = createMockStats({
        topGenres: [{ name: "Action", count: 2, pct: 20 }]
      });
      const chips = generateIdentityChips(stats, createMockWatchlist(3));
      expect(chips).toEqual([]);
    });
  });

  describe("2. Director devotion", () => {
    it("should return Director Fan if count >= 3", () => {
      const stats = createMockStats({
        topDirectors: [{ name: "Christopher Nolan", count: 3 }]
      });
      const chips = generateIdentityChips(stats, createMockWatchlist(3));
      expect(chips).toContainEqual({
        label: "Nolan Fan",
        icon: "🎬",
        isEmoji: true
      });
    });

    it("should not return Director Fan if count < 3", () => {
      const stats = createMockStats({
        topDirectors: [{ name: "Christopher Nolan", count: 2 }]
      });
      const chips = generateIdentityChips(stats, createMockWatchlist(3));
      expect(chips).not.toContainEqual(
        expect.objectContaining({ label: expect.stringContaining("Fan") })
      );
    });
  });

  describe("3. Era affinity", () => {
    it("should return era chip if favorite decade exists and total >= 8", () => {
      const stats = createMockStats({
        favoriteDecade: "90s",
        total: 8
      });
      const chips = generateIdentityChips(stats, createMockWatchlist(8));
      expect(chips).toContainEqual({
        label: "90s Cinema",
        icon: "📼",
        isEmoji: true
      });
    });

    it("should not return era chip if total < 8", () => {
      const stats = createMockStats({
        favoriteDecade: "90s",
        total: 7
      });
      const chips = generateIdentityChips(stats, createMockWatchlist(7));
      expect(chips).not.toContainEqual(
        expect.objectContaining({ label: "90s Cinema" })
      );
    });
  });

  describe("4. Pace identity", () => {
    it("should return Slow Cinema if avg runtime >= 130 and >= 4 items with runtime", () => {
      const stats = createMockStats();
      const watchlist = createMockWatchlist(4, { runtime: 140 });
      const chips = generateIdentityChips(stats, watchlist);
      expect(chips).toContainEqual({
        label: "Slow Cinema",
        icon: "🎬",
        isEmoji: true
      });
    });

    it("should not return Slow Cinema if avg runtime < 130", () => {
      const stats = createMockStats();
      const watchlist = createMockWatchlist(4, { runtime: 120 });
      const chips = generateIdentityChips(stats, watchlist);
      expect(chips).not.toContainEqual(
        expect.objectContaining({ label: "Slow Cinema" })
      );
    });
  });

  describe("5. Origin identity", () => {
    it("should return Korean Cinema if >= 2 korean items", () => {
      const stats = createMockStats();
      const watchlist = createMockWatchlist(3);
      watchlist[0].original_title = "기생충";
      watchlist[1].original_title = "올드보이";
      const chips = generateIdentityChips(stats, watchlist);
      expect(chips).toContainEqual({
        label: "Korean Cinema",
        icon: "🇰🇷",
        isEmoji: true
      });
    });

    it("should return Japanese Cinema if >= 2 japanese items", () => {
      const stats = createMockStats();
      const watchlist = createMockWatchlist(3);
      watchlist[0].original_title = "となりのトトロ";
      watchlist[1].original_title = "アキラ";
      const chips = generateIdentityChips(stats, watchlist);
      expect(chips).toContainEqual({
        label: "Japanese Cinema",
        icon: "🇯🇵",
        isEmoji: true
      });
    });
  });

  describe("6. Format identity", () => {
    it("should return Series Devotee if tvCount >= 8 and >= 1.2x movieCount", () => {
      const stats = createMockStats({
        tvCount: 8,
        movieCount: 5
      });
      const chips = generateIdentityChips(stats, createMockWatchlist(13));
      expect(chips).toContainEqual({
        label: "Series Devotee",
        icon: "📺",
        isEmoji: true
      });
    });

    it("should return Film Purist if movieCount >= 8 and >= 1.5x tvCount", () => {
      const stats = createMockStats({
        movieCount: 9,
        tvCount: 5
      });
      const chips = generateIdentityChips(stats, createMockWatchlist(14));
      expect(chips).toContainEqual({
        label: "Film Purist",
        icon: "🎞️",
        isEmoji: true
      });
    });
  });

  describe("Chip Limits", () => {
    it("should return a maximum of 4 chips", () => {
      const stats = createMockStats({
        topGenres: [{ name: "Horror", count: 3, pct: 30 }],
        topDirectors: [{ name: "John Carpenter", count: 3 }],
        favoriteDecade: "80s",
        total: 10,
        movieCount: 10,
        tvCount: 2
      });

      const watchlist = createMockWatchlist(12, { runtime: 150 });
      watchlist[0].original_title = "올드보이";
      watchlist[1].original_title = "기생충";

      const chips = generateIdentityChips(stats, watchlist);
      expect(chips.length).toBeLessThanOrEqual(4);
    });
  });
});
