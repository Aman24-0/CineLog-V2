import { describe, expect, it, vi } from "vitest";
import { canRateEpisode } from "../EpisodeCard";

describe("canRateEpisode", () => {
  const onRate = vi.fn();

  it("allows rating the current completed tracker episode", () => {
    expect(canRateEpisode({
      inVault: true,
      isWatched: false,
      isCurrent: true,
      onRate
    }, "5star")).toBe(true);
  });

  it("allows rating episodes before the current tracker episode", () => {
    expect(canRateEpisode({
      inVault: true,
      isWatched: true,
      isCurrent: false,
      onRate
    }, "10star")).toBe(true);
  });

  it("does not allow rating an unwatched future episode", () => {
    expect(canRateEpisode({
      inVault: true,
      isWatched: false,
      isCurrent: false,
      onRate
    }, "5star")).toBe(false);
  });

  it("does not show numeric ratings for thumbs users", () => {
    expect(canRateEpisode({
      inVault: true,
      isWatched: true,
      isCurrent: false,
      onRate
    }, "thumbs")).toBe(false);
  });
});
