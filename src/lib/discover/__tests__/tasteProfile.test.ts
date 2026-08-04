// src/lib/discover/__tests__/tasteProfile.test.ts
//
// Unit tests for the shared taste-profile calculator (Phase 7 Task 4).
// These pin the behavior of `computeTasteProfile` so both the client
// hook and the server API route produce identical profiles.

import { describe, it, expect } from "vitest";
import { computeTasteProfile } from "~/lib/discover/tasteProfile";
import type { WatchlistItem } from "~/shared/types";

/**
 * Build a minimal WatchlistItem with the fields the calculator reads.
 * Other fields default to undefined — the calculator is defensive
 * about missing fields.
 */
function makeItem(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: "1",
    media_type: "movie",
    status: "Completed",
    rating: 8,
    title: "Test Movie",
    genresList: ["Drama"],
    director: "Test Director",
    imdbRating: "7.5",
    addedAt: "2024-01-01",
    ...overrides
  } as WatchlistItem;
}

describe("computeTasteProfile", () => {
  it("returns a cold-start profile for a guest", () => {
    const profile = computeTasteProfile([makeItem()], true);
    expect(profile.isColdStart).toBe(true);
    expect(profile.topGenres).toEqual([]);
    expect(profile.topDirectors).toEqual([]);
    expect(profile.activeFranchises).toEqual([]);
    expect(profile.avgImdb).toBe(0);
    expect(profile.seedTitle).toBeNull();
  });

  it("returns a cold-start profile for an empty vault", () => {
    const profile = computeTasteProfile([], false);
    expect(profile.isColdStart).toBe(true);
    expect(profile.topGenres).toEqual([]);
  });

  it("derives top genres from completed + 8+ rated titles", () => {
    const list = [
      makeItem({ id: "1", genresList: ["Drama", "Thriller"], status: "Completed", rating: 9 }),
      makeItem({ id: "2", genresList: ["Drama"], status: "Completed", rating: 8 }),
      makeItem({ id: "3", genresList: ["Thriller"], status: "Completed", rating: 7 })
    ];
    const profile = computeTasteProfile(list, false);
    expect(profile.isColdStart).toBe(false);
    // "Drama" appears in 2 items, "Thriller" in 2 items — both should be top genres.
    expect(profile.topGenres).toContain("Drama");
    expect(profile.topGenres).toContain("Thriller");
    expect(profile.topGenres.length).toBeLessThanOrEqual(3);
  });

  it("returns at most 3 top genres, sorted by frequency", () => {
    const list = [
      makeItem({ id: "1", genresList: ["A", "B", "C", "D"] }),
      makeItem({ id: "2", genresList: ["A", "B", "C"] }),
      makeItem({ id: "3", genresList: ["A", "B"] }),
      makeItem({ id: "4", genresList: ["A"] })
    ];
    const profile = computeTasteProfile(list, false);
    expect(profile.topGenres.length).toBe(3);
    // "A" appears in all 4 → first
    expect(profile.topGenres[0]).toBe("A");
    // "B" in 3 → second
    expect(profile.topGenres[1]).toBe("B");
  });

  it("computes avgImdb from items with a valid imdbRating", () => {
    const list = [
      makeItem({ id: "1", imdbRating: "8.0" }),
      makeItem({ id: "2", imdbRating: "6.0" }),
      makeItem({ id: "3", imdbRating: "invalid" }),
      makeItem({ id: "4", imdbRating: "0" })
    ];
    const profile = computeTasteProfile(list, false);
    // Only 8.0 + 6.0 are valid (>0, parseable) → avg = 7.0
    expect(profile.avgImdb).toBeCloseTo(7.0, 5);
  });

  it("returns cold start when vault has items but no usable signal", () => {
    // All items are "Planned" with no ratings — no signal.
    const list = [
      makeItem({ id: "1", status: "Planned", rating: undefined, genresList: [], director: undefined, imdbRating: "" }),
      makeItem({ id: "2", status: "Planned", rating: undefined, genresList: [], director: undefined, imdbRating: "" })
    ];
    const profile = computeTasteProfile(list, false);
    expect(profile.isColdStart).toBe(true);
  });

  it("picks seedTitle as the highest-rated completed title", () => {
    const list = [
      makeItem({ id: "1", status: "Completed", rating: 9, title: "Movie A" }),
      makeItem({ id: "2", status: "Completed", rating: 10, title: "Movie B" }),
      makeItem({ id: "3", status: "Completed", rating: 8, title: "Movie C" })
    ];
    const profile = computeTasteProfile(list, false);
    expect(profile.seedTitle).not.toBeNull();
    expect(profile.seedTitle?.title).toBe("Movie B");
  });

  it("handles items with missing genresList gracefully", () => {
    const list = [
      makeItem({ id: "1", genresList: undefined }),
      makeItem({ id: "2", genresList: [] }),
      makeItem({ id: "3", genresList: ["Drama"] })
    ];
    const profile = computeTasteProfile(list, false);
    expect(profile.topGenres).toEqual(["Drama"]);
  });

  it("handles items with missing director gracefully", () => {
    const list = [
      makeItem({ id: "1", director: undefined, status: "Completed", rating: 9 }),
      makeItem({ id: "2", director: "", status: "Completed", rating: 9 }),
      makeItem({ id: "3", director: "Unknown", status: "Completed", rating: 9 })
    ];
    const profile = computeTasteProfile(list, false);
    // All directors are filtered out → no top directors.
    expect(profile.topDirectors).toEqual([]);
  });
});
