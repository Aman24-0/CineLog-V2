// src/shared/utils/__tests__/progress.test.ts
import { describe, it, expect } from "vitest";
import {
  isWatchable,
  getContinueWatchingList,
  getEpisodeProgress,
  getInProgressCount,
  resolveSeasons
} from "../progress";
import {
  makeMovie,
  makeTVSeries,
  makeWatchlistItem,
  makeSeasons
} from "~/__test-fixtures__/factories";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

describe("isWatchable", () => {
  it("returns false for null", () => {
    expect(isWatchable(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isWatchable(undefined)).toBe(false);
  });

  it("returns true for status === 'Watching'", () => {
    expect(isWatchable(makeWatchlistItem({ status: "Watching" }))).toBe(true);
  });

  it("returns false for status === 'Planned'", () => {
    expect(isWatchable(makeWatchlistItem({ status: "Planned" }))).toBe(false);
  });

  it("returns false for status === 'Completed'", () => {
    expect(isWatchable(makeWatchlistItem({ status: "Completed" }))).toBe(false);
  });

  it("returns false for status === 'Plan to Watch'", () => {
    expect(isWatchable(makeWatchlistItem({ status: "Plan to Watch" }))).toBe(
      false
    );
  });
});

describe("getContinueWatchingList", () => {
  it("returns empty array for empty input", () => {
    expect(getContinueWatchingList([])).toEqual([]);
  });

  it("filters to only Watching titles", () => {
    const list = [
      makeWatchlistItem({ id: "1", status: "Watching" }),
      makeWatchlistItem({ id: "2", status: "Planned" }),
      makeWatchlistItem({ id: "3", status: "Completed" }),
      makeWatchlistItem({ id: "4", status: "Watching" })
    ];
    const result = getContinueWatchingList(list);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(["1", "4"]);
  });

  it("sorts by watchProgress.updatedAt descending (most recent first)", () => {
    const list = [
      makeWatchlistItem({
        id: "old",
        status: "Watching",
        watchProgress: {
          updatedAt: "2024-01-01T00:00:00Z"
        } as WatchlistItem["watchProgress"]
      }),
      makeWatchlistItem({
        id: "new",
        status: "Watching",
        watchProgress: {
          updatedAt: "2024-06-01T00:00:00Z"
        } as WatchlistItem["watchProgress"]
      }),
      makeWatchlistItem({
        id: "mid",
        status: "Watching",
        watchProgress: {
          updatedAt: "2024-03-01T00:00:00Z"
        } as WatchlistItem["watchProgress"]
      })
    ];
    const result = getContinueWatchingList(list);
    expect(result.map((m) => m.id)).toEqual(["new", "mid", "old"]);
  });

  it("handles items without watchProgress (sorts as 0)", () => {
    const list = [
      makeWatchlistItem({ id: "no-progress", status: "Watching" }),
      makeWatchlistItem({
        id: "with-progress",
        status: "Watching",
        watchProgress: {
          updatedAt: "2024-06-01T00:00:00Z"
        } as WatchlistItem["watchProgress"]
      })
    ];
    const result = getContinueWatchingList(list);
    expect(result[0].id).toBe("with-progress");
    expect(result[1].id).toBe("no-progress");
  });
});

describe("resolveSeasons", () => {
  it("returns cached seasons from item when present (filters season 0)", () => {
    const item = makeTVSeries({
      seasons: [
        { number: 0, count: 5 }, // specials — filtered out
        { number: 1, count: 10 },
        { number: 2, count: 8 }
      ]
    });
    const result = resolveSeasons(item);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ number: 1, count: 10 });
    expect(result[1]).toEqual({ number: 2, count: 8 });
  });

  it("returns seasons sorted by number ascending", () => {
    const item = makeTVSeries({
      seasons: [
        { number: 3, count: 8 },
        { number: 1, count: 10 },
        { number: 2, count: 8 }
      ]
    });
    const result = resolveSeasons(item);
    expect(result.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it("filters seasons with count <= 0", () => {
    const item = makeTVSeries({
      seasons: [
        { number: 1, count: 10 },
        { number: 2, count: 0 } // filtered
      ]
    });
    const result = resolveSeasons(item);
    expect(result).toHaveLength(1);
  });

  it("falls back to TMDB details.seasons when item.seasons is empty", () => {
    const item = makeTVSeries({ seasons: undefined });
    const details = {
      seasons: [
        { season_number: 1, episode_count: 10, id: 1, name: "S1" },
        { season_number: 2, episode_count: 8, id: 2, name: "S2" }
      ]
    } as unknown as TMDBDetails;
    const result = resolveSeasons(item, details);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ number: 1, count: 10 });
  });

  it("falls back to totalEps as season 1 when on season 1", () => {
    const item = makeTVSeries({ seasons: undefined, totalEps: 24, season: 1 });
    const result = resolveSeasons(item);
    expect(result).toEqual([{ number: 1, count: 24 }]);
  });

  it("does NOT fall back to totalEps when on season > 1 (would be misleading)", () => {
    const item = makeTVSeries({
      seasons: undefined,
      totalEps: 24,
      season: 2
    });
    const result = resolveSeasons(item);
    expect(result).toEqual([]);
  });

  it("returns empty array when no season data available", () => {
    const item = makeTVSeries({ seasons: undefined, totalEps: undefined });
    const result = resolveSeasons(item);
    expect(result).toEqual([]);
  });
});

describe("getEpisodeProgress", () => {
  it("returns null for null item", () => {
    expect(getEpisodeProgress(null)).toBeNull();
  });

  it("returns null for non-Watching status", () => {
    const item = makeTVSeries({ status: "Planned" });
    expect(getEpisodeProgress(item)).toBeNull();
  });

  it("returns null for movies (media_type !== 'tv')", () => {
    const item = makeMovie({ status: "Watching" });
    expect(getEpisodeProgress(item)).toBeNull();
  });

  it("returns 0% with S/E label when no season data", () => {
    const item = makeTVSeries({
      seasons: undefined,
      totalEps: undefined,
      season: 3,
      episode: 5
    });
    const result = getEpisodeProgress(item);
    expect(result).not.toBeNull();
    expect(result!.pct).toBe(0);
    expect(result!.label).toBe("S3 E5");
    expect(result!.seriesLabel).toBe("—");
    expect(result!.seriesTotalEps).toBe(0);
  });

  it("computes series-wide percentage correctly (House of the Dragon example)", () => {
    // S1=10, S2=8, S3=8 → total=26; user on S3 E1 → completed=10+8+1=19; pct=73
    const item = makeTVSeries({
      seasons: makeSeasons([
        { number: 1, count: 10 },
        { number: 2, count: 8 },
        { number: 3, count: 8 }
      ]),
      season: 3,
      episode: 1
    });
    const result = getEpisodeProgress(item);
    expect(result).not.toBeNull();
    expect(result!.pct).toBe(73);
    expect(result!.seriesTotalEps).toBe(26);
    expect(result!.seriesCompletedEps).toBe(19);
    expect(result!.label).toBe("S3 E1 / 8");
    expect(result!.seriesLabel).toBe("19 / 26 eps");
    expect(result!.totalSeasons).toBe(3);
  });

  it("computes 100% when on last episode of last season (isAtEnd=true)", () => {
    const item = makeTVSeries({
      seasons: makeSeasons([
        { number: 1, count: 10 },
        { number: 2, count: 8 }
      ]),
      season: 2,
      episode: 8
    });
    const result = getEpisodeProgress(item);
    expect(result).not.toBeNull();
    expect(result!.pct).toBe(100);
    expect(result!.isAtEnd).toBe(true);
  });

  it("clamps episode to season count to avoid >100%", () => {
    const item = makeTVSeries({
      seasons: makeSeasons([{ number: 1, count: 10 }]),
      season: 1,
      episode: 15 // exceeds count
    });
    const result = getEpisodeProgress(item);
    expect(result!.pct).toBe(100);
    expect(result!.seriesCompletedEps).toBe(10);
  });

  it("handles being on a season not in the list (treats prior seasons as complete)", () => {
    // When user is on season 5 but list only has season 1, the engine
    // counts all prior seasons (season 1) as fully watched.
    const item = makeTVSeries({
      seasons: makeSeasons([{ number: 1, count: 10 }]),
      season: 5, // not in list
      episode: 1
    });
    const result = getEpisodeProgress(item);
    expect(result!.totalEps).toBe(0); // current season (5) not in list
    expect(result!.seriesTotalEps).toBe(10);
    expect(result!.seriesCompletedEps).toBe(10); // season 1 < season 5 → fully counted
    expect(result!.pct).toBe(100);
    expect(result!.label).toBe("S5 E1");
  });

  it("uses default season=1, episode=1 when not specified", () => {
    const item = makeTVSeries({
      seasons: makeSeasons([{ number: 1, count: 10 }]),
      season: undefined,
      episode: undefined
    });
    const result = getEpisodeProgress(item);
    expect(result!.season).toBe(1);
    expect(result!.episode).toBe(1);
    expect(result!.pct).toBe(10); // 1/10 = 10%
  });
});

describe("getInProgressCount", () => {
  it("returns 0 for empty list", () => {
    expect(getInProgressCount([])).toBe(0);
  });

  it("counts only Watching titles", () => {
    const list = [
      makeWatchlistItem({ status: "Watching" }),
      makeWatchlistItem({ status: "Planned" }),
      makeWatchlistItem({ status: "Watching" }),
      makeWatchlistItem({ status: "Completed" })
    ];
    expect(getInProgressCount(list)).toBe(2);
  });
});
