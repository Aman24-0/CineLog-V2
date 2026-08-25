import { describe, expect, it } from "vitest";
import type { WatchlistItem } from "~/shared/types";
import {
  calculateSeparatedStats,
  isAnimeWatchlistItem
} from "../animeSeparator";
import { formatRuntime, getNextFormat } from "../timeFormatter";

function item(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: "title-1",
    media_type: "movie",
    status: "Completed",
    ...overrides
  };
}

describe("formatRuntime", () => {
  it("cycles through hours:seconds, seconds, minutes, and hours", () => {
    expect(formatRuntime(4_444_140, 0)).toBe("1,234:00");
    expect(formatRuntime(4_444_140, 1)).toBe("4,444,140s");
    expect(formatRuntime(4_444_140, 2)).toBe("74,069m");
    expect(formatRuntime(4_444_140, 3)).toBe("1,234h");
  });

  it("clamps invalid runtime values and falls back to hours", () => {
    expect(formatRuntime(-1, 0)).toBe("0:00");
    expect(formatRuntime(3_600, 99)).toBe("1h");
  });

  it("wraps the format state after the fourth format", () => {
    expect(getNextFormat(0)).toBe(1);
    expect(getNextFormat(3)).toBe(0);
  });
});

describe("calculateSeparatedStats", () => {
  it("separates anime movies and series from regular movies and series", () => {
    const stats = calculateSeparatedStats([
      item({ id: "movie", runtime: 120, genresList: ["Drama"] }),
      item({
        id: "series",
        media_type: "tv",
        runtime: 600,
        genresList: ["Comedy"]
      }),
      item({ id: "anime-movie", runtime: 90, genresList: ["Animation"] }),
      item({
        id: "anime-series",
        media_type: "tv",
        runtime: 480,
        genresList: ["Anime"]
      })
    ]);

    expect(stats).toEqual({
      movieCount: 1,
      seriesCount: 1,
      animeCount: 2,
      movieRuntime: 7_200,
      seriesRuntime: 36_000,
      animeRuntime: 34_200
    });
  });

  it("handles empty libraries and missing runtimes", () => {
    expect(calculateSeparatedStats([])).toEqual({
      movieCount: 0,
      seriesCount: 0,
      animeCount: 0,
      movieRuntime: 0,
      seriesRuntime: 0,
      animeRuntime: 0
    });
    expect(
      calculateSeparatedStats([item({ runtime: undefined })]).movieRuntime
    ).toBe(0);
  });

  it("uses the existing Japanese animation heuristic for older records", () => {
    expect(
      isAnimeWatchlistItem(
        item({
          origin_country: ["JP"],
          genresList: ["Animation"],
          runtime: 24
        })
      )
    ).toBe(true);
  });
});
