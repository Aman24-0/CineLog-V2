// src/shared/utils/__tests__/seenTitles.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addSeenTitle,
  isTitleSeen,
  getSeenTitles,
  clearSeenTitles,
  getCachedSpotlight,
  setCachedSpotlight,
  clearCachedSpotlight,
  todayKey,
  SEEN_TITLES_TTL_MS,
} from "../seenTitles";
import type { SpotlightPick, TMDBTitle } from "~/shared/types";

// ── Test fixtures ─────────────────────────────────────────────────────

const baseTitle: TMDBTitle = {
  id: 123,
  media_type: "movie",
  title: "Test Movie",
  poster_path: "/abc.jpg",
  backdrop_path: "/def.jpg",
  vote_average: 8.0,
  vote_count: 1000,
  overview: "A test movie",
  release_date: "2024-01-01",
  genre_ids: [28],
  genres: ["Action"],
} as unknown as TMDBTitle;

const makePick = (): SpotlightPick => ({
  title: baseTitle,
  reason: "Because you tested",
  strategy: "acclaimed-fallback",
});

// localStorage is cleared in test/setup.ts beforeEach, so each test
// starts with a clean slate.

describe("todayKey", () => {
  it("returns a YYYY-MM-DD string", () => {
    const key = todayKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("pads single-digit months and days", () => {
    // We can't control the actual date, but we can verify the format
    // has the right length and structure.
    const key = todayKey();
    const [year, month, day] = key.split("-");
    expect(year).toHaveLength(4);
    expect(month).toHaveLength(2);
    expect(day).toHaveLength(2);
  });
});

describe("addSeenTitle / isTitleSeen", () => {
  it("returns false for a title that was never seen", () => {
    expect(isTitleSeen("user-1", "movie", 123)).toBe(false);
  });

  it("returns true after a title has been added", () => {
    addSeenTitle("user-1", "movie", 123);
    expect(isTitleSeen("user-1", "movie", 123)).toBe(true);
  });

  it("isolates seen state per user", () => {
    addSeenTitle("user-1", "movie", 123);
    expect(isTitleSeen("user-1", "movie", 123)).toBe(true);
    expect(isTitleSeen("user-2", "movie", 123)).toBe(false);
  });

  it("isolates seen state per media type (movie/TV with same id are different)", () => {
    addSeenTitle("user-1", "movie", 123);
    expect(isTitleSeen("user-1", "movie", 123)).toBe(true);
    expect(isTitleSeen("user-1", "tv", 123)).toBe(false);
  });

  it("treats null userId as a guest bucket (shared across guests)", () => {
    addSeenTitle(null, "movie", 999);
    expect(isTitleSeen(null, "movie", 999)).toBe(true);
    // A different null caller (still guest) sees the same state
    expect(isTitleSeen(null, "movie", 999)).toBe(true);
  });

  it("returns false after the 30-day TTL expires", () => {
    // Add a title with a timestamp 31 days ago
    const oldTimestamp = Date.now() - (SEEN_TITLES_TTL_MS + 1000);
    addSeenTitle("user-1", "movie", 123, oldTimestamp);
    expect(isTitleSeen("user-1", "movie", 123)).toBe(false);
  });

  it("returns true if seen exactly 30 days ago (boundary — within TTL)", () => {
    // 29 days, 23 hours, 59 minutes ago — still within TTL
    const recentTimestamp = Date.now() - (SEEN_TITLES_TTL_MS - 1000);
    addSeenTitle("user-1", "movie", 123, recentTimestamp);
    expect(isTitleSeen("user-1", "movie", 123)).toBe(true);
  });

  it("is idempotent — adding twice updates the timestamp", () => {
    const oldTs = Date.now() - (10 * 24 * 60 * 60 * 1000); // 10 days ago
    addSeenTitle("user-1", "movie", 123, oldTs);
    // Add again with current timestamp — should refresh
    addSeenTitle("user-1", "movie", 123);
    expect(isTitleSeen("user-1", "movie", 123)).toBe(true);
  });
});

describe("getSeenTitles", () => {
  it("returns an empty map when nothing has been seen", () => {
    const map = getSeenTitles("user-1");
    expect(map.size).toBe(0);
  });

  it("returns all seen titles as a Map", () => {
    addSeenTitle("user-1", "movie", 100);
    addSeenTitle("user-1", "tv", 200);
    addSeenTitle("user-1", "movie", 300);
    const map = getSeenTitles("user-1");
    expect(map.size).toBe(3);
    expect(map.has("movie:100")).toBe(true);
    expect(map.has("tv:200")).toBe(true);
    expect(map.has("movie:300")).toBe(true);
  });

  it("prunes expired entries and returns only fresh ones", () => {
    // Fresh
    addSeenTitle("user-1", "movie", 100);
    // Expired (31 days ago)
    addSeenTitle("user-1", "movie", 200, Date.now() - (SEEN_TITLES_TTL_MS + 5000));

    const map = getSeenTitles("user-1");
    expect(map.size).toBe(1);
    expect(map.has("movie:100")).toBe(true);
    expect(map.has("movie:200")).toBe(false);
  });

  it("persists the pruned map so subsequent reads don't re-encounter stale entries", () => {
    addSeenTitle("user-1", "movie", 200, Date.now() - (SEEN_TITLES_TTL_MS + 5000));
    // First read prunes
    const m1 = getSeenTitles("user-1");
    expect(m1.size).toBe(0);
    // After the cached isTitleSeen call on the pruned entry, it should
    // still be false (and the underlying storage should be clean).
    expect(isTitleSeen("user-1", "movie", 200)).toBe(false);
  });
});

describe("clearSeenTitles", () => {
  it("removes all seen entries for the given user", () => {
    addSeenTitle("user-1", "movie", 100);
    addSeenTitle("user-1", "tv", 200);
    expect(getSeenTitles("user-1").size).toBe(2);

    clearSeenTitles("user-1");
    expect(getSeenTitles("user-1").size).toBe(0);
  });

  it("does not affect other users' state", () => {
    addSeenTitle("user-1", "movie", 100);
    addSeenTitle("user-2", "movie", 200);

    clearSeenTitles("user-1");
    expect(getSeenTitles("user-1").size).toBe(0);
    expect(getSeenTitles("user-2").size).toBe(1);
  });
});

describe("getCachedSpotlight / setCachedSpotlight", () => {
  it("returns null when nothing is cached", () => {
    expect(getCachedSpotlight("user-1")).toBeNull();
  });

  it("returns the cached pick after setCachedSpotlight", () => {
    const pick = makePick();
    setCachedSpotlight("user-1", pick);

    const cached = getCachedSpotlight("user-1");
    expect(cached).not.toBeNull();
    expect(cached!.date).toBe(todayKey());
    expect(cached!.pick.title.id).toBe(123);
    expect(cached!.pick.reason).toBe("Because you tested");
    expect(cached!.pick.strategy).toBe("acclaimed-fallback");
  });

  it("isolates cache per user", () => {
    setCachedSpotlight("user-1", makePick());
    expect(getCachedSpotlight("user-1")).not.toBeNull();
    expect(getCachedSpotlight("user-2")).toBeNull();
  });

  it("treats null userId as the guest bucket", () => {
    setCachedSpotlight(null, makePick());
    expect(getCachedSpotlight(null)).not.toBeNull();
  });
});

describe("clearCachedSpotlight", () => {
  it("removes the cached pick", () => {
    setCachedSpotlight("user-1", makePick());
    expect(getCachedSpotlight("user-1")).not.toBeNull();

    clearCachedSpotlight("user-1");
    expect(getCachedSpotlight("user-1")).toBeNull();
  });

  it("does not affect seen titles", () => {
    addSeenTitle("user-1", "movie", 100);
    setCachedSpotlight("user-1", makePick());

    clearCachedSpotlight("user-1");
    expect(getCachedSpotlight("user-1")).toBeNull();
    expect(getSeenTitles("user-1").size).toBe(1);
  });
});

describe("SSR safety", () => {
  it("returns safe defaults when localStorage is unavailable", () => {
    // Simulate SSR by stubbing window.localStorage to undefined.
    const original = (globalThis as { localStorage?: Storage }).localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
    });

    try {
      expect(isTitleSeen("user-1", "movie", 123)).toBe(false);
      expect(getSeenTitles("user-1").size).toBe(0);
      expect(getCachedSpotlight("user-1")).toBeNull();
      // Writes should be no-ops, not throw
      addSeenTitle("user-1", "movie", 123);
      setCachedSpotlight("user-1", makePick());
      clearSeenTitles("user-1");
      clearCachedSpotlight("user-1");
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        value: original,
        configurable: true,
      });
    }
  });

  it("returns safe defaults when localStorage.getItem throws", () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = vi.fn(() => {
      throw new Error("Simulated read failure");
    });

    try {
      // These should NOT throw — they should return safe defaults.
      expect(isTitleSeen("user-1", "movie", 123)).toBe(false);
      expect(getSeenTitles("user-1").size).toBe(0);
      expect(getCachedSpotlight("user-1")).toBeNull();
    } finally {
      window.localStorage.getItem = original;
    }
  });

  it("silently swallows write failures", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = vi.fn(() => {
      throw new Error("Simulated write failure (quota exceeded)");
    });

    try {
      // These should NOT throw — they should warn and continue.
      addSeenTitle("user-1", "movie", 123);
      setCachedSpotlight("user-1", makePick());
    } finally {
      window.localStorage.setItem = original;
    }
  });
});
