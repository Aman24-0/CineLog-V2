import { describe, expect, it } from "vitest";
import {
  deriveSeriesStatus,
  getContiguousWatchedPrefix,
  getLastEpisodePosition,
  getTrackerPosition,
  getWatchedPrefixBefore,
  getWatchedPrefixThrough,
  listSeriesEpisodes
} from "../episodeState";

const seasons = [
  { number: 1, count: 3 },
  { number: 2, count: 4 }
];

const row = (season_number: number, episode_number: number) => ({
  season_number,
  episode_number
});

describe("episode state machine", () => {
  it("flattens seasons in chronological cross-season order", () => {
    expect(listSeriesEpisodes(seasons)).toEqual([
      { season: 1, episode: 1 },
      { season: 1, episode: 2 },
      { season: 1, episode: 3 },
      { season: 2, episode: 1 },
      { season: 2, episode: 2 },
      { season: 2, episode: 3 },
      { season: 2, episode: 4 }
    ]);
  });

  it("fills a contiguous watched prefix through a requested episode", () => {
    expect(getWatchedPrefixThrough(seasons, 2, 3)).toHaveLength(6);
    expect(getWatchedPrefixThrough(seasons, 2, 3).at(-1)).toEqual({
      season: 2,
      episode: 3
    });
  });

  it("rewinds across a season boundary when unwatching S2E1", () => {
    const prefix = getWatchedPrefixBefore(seasons, 2, 1);
    expect(prefix).toHaveLength(3);
    expect(getTrackerPosition(prefix, seasons)).toEqual({
      season: 1,
      episode: 3
    });
  });

  it("collapses persisted gaps to the largest valid prefix", () => {
    const prefix = getContiguousWatchedPrefix(
      seasons,
      [row(1, 1), row(1, 2), row(1, 3), row(2, 1), row(2, 3)],
      (value) => `S${value.season_number}E${value.episode_number}`
    );
    expect(prefix).toHaveLength(4);
    expect(prefix.at(-1)).toEqual({ season: 2, episode: 1 });
  });

  it("derives the three synchronized series statuses", () => {
    expect(deriveSeriesStatus(0, 7)).toBe("Planned");
    expect(deriveSeriesStatus(4, 7)).toBe("Watching");
    expect(deriveSeriesStatus(7, 7)).toBe("Completed");
  });

  it("returns the final episode position for Completed", () => {
    expect(getLastEpisodePosition(seasons)).toEqual({
      season: 2,
      episode: 4
    });
  });
});
