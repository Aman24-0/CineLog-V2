import { describe, expect, it } from "vitest";
import { hasWatchNextBadge } from "~/features/watchlist/components/VaultShelf";
import { shouldShowCompactEpisodeMeta } from "../MovieCard";

describe("Continue Watching card presentation contracts", () => {
  it("keeps compact metadata by default and hides it only when the shelf supplies a badge", () => {
    expect(shouldShowCompactEpisodeMeta("compact")).toBe(true);
    expect(shouldShowCompactEpisodeMeta("compact", true)).toBe(true);
    expect(shouldShowCompactEpisodeMeta("compact", false)).toBe(false);
  });

  it("does not apply compact episode metadata rules to non-compact cards", () => {
    expect(shouldShowCompactEpisodeMeta("default")).toBe(false);
    expect(shouldShowCompactEpisodeMeta("featured", true)).toBe(false);
  });

  it("keeps the Watch Next badge context limited to active-progress shelves", () => {
    expect(hasWatchNextBadge("in-progress")).toBe(true);
    expect(hasWatchNextBadge("watching")).toBe(true);
    expect(hasWatchNextBadge("planned")).toBe(false);
    expect(hasWatchNextBadge("completed")).toBe(false);
  });
});
