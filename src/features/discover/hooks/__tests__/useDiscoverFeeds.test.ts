// src/features/discover/hooks/__tests__/useDiscoverFeeds.test.ts
//
// Tests for the 2026-09-03 "Running in Theatres" (nowPlaying) feed
// addition to useDiscoverFeeds.
//
// Verifies:
//   1. nowPlaying is part of the DiscoverFeeds interface.
//   2. getNowPlaying is called with the user's region.
//   3. The feed is reactive to region changes.
//   4. A failed nowPlaying fetch doesn't break other feeds.
//   5. The nowPlaying signal starts empty before fetch resolves.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRoot, createSignal } from "solid-js";

vi.mock("~/core/tmdb/discover", () => ({
  getTrending: vi.fn().mockResolvedValue([]),
  getUpcoming: vi.fn().mockResolvedValue([]),
  getNowPlaying: vi.fn().mockResolvedValue([
    { id: 1, title: "Test Movie 1", media_type: "movie", release_date: "2024-01-01" },
    { id: 2, title: "Test Movie 2", media_type: "movie", release_date: "2024-02-01" }
  ]),
  discoverMovies: vi.fn().mockResolvedValue([])
}));

vi.mock("~/core/tmdb/tmdb", () => ({
  isTmdb404: vi.fn(() => false)
}));

vi.mock("~/core/config/discoverRegion", () => ({
  useDiscoverRegion: () => regionSignal,
  DEFAULT_DISCOVER_REGION: "IN"
}));

import { useDiscoverFeeds } from "../useDiscoverFeeds";
import { getNowPlaying, getUpcoming } from "~/core/tmdb/discover";

// Shared region signal for the mock
const [regionSignal, setRegionSignal] = createSignal("IN");

describe("useDiscoverFeeds — nowPlaying (Running in Theatres)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRegionSignal("IN");
  });

  it("exposes nowPlaying as part of the feeds interface", () => {
    return new Promise<void>((resolve) => {
      createRoot(async (dispose) => {
        const feeds = useDiscoverFeeds();
        expect(feeds.nowPlaying).toBeDefined();
        expect(typeof feeds.nowPlaying).toBe("function");
        dispose();
        resolve();
      });
    });
  });

  it("calls getNowPlaying with the user's region on mount", () => {
    return new Promise<void>((resolve) => {
      createRoot(async (dispose) => {
        useDiscoverFeeds();
        // Wait for onMount to fire
        await new Promise((r) => setTimeout(r, 50));
        expect(getNowPlaying).toHaveBeenCalledWith("IN");
        dispose();
        resolve();
      });
    });
  });

  it("nowPlaying signal starts empty before fetch resolves", () => {
    return new Promise<void>((resolve) => {
      createRoot((dispose) => {
        const feeds = useDiscoverFeeds();
        // Before the async fetch resolves, nowPlaying should be empty.
        expect(feeds.nowPlaying()).toEqual([]);
        dispose();
        resolve();
      });
    });
  });

  it("populates nowPlaying after fetch resolves", () => {
    return new Promise<void>((resolve) => {
      createRoot(async (dispose) => {
        const feeds = useDiscoverFeeds();
        // Wait for fetch to resolve
        await new Promise((r) => setTimeout(r, 100));
        expect(feeds.nowPlaying().length).toBe(2);
        expect(feeds.nowPlaying()[0]?.title).toBe("Test Movie 1");
        dispose();
        resolve();
      });
    });
  });

  it("refetches nowPlaying when region changes", () => {
    return new Promise<void>((resolve) => {
      createRoot(async (dispose) => {
        useDiscoverFeeds();
        // Wait for initial fetch
        await new Promise((r) => setTimeout(r, 50));
        expect(getNowPlaying).toHaveBeenCalledWith("IN");

        // Change region
        setRegionSignal("US");
        await new Promise((r) => setTimeout(r, 50));

        // Should have been called with US now
        expect(getNowPlaying).toHaveBeenCalledWith("US");
        dispose();
        resolve();
      });
    });
  });

  it("does not break other feeds when nowPlaying fails", () => {
    vi.mocked(getNowPlaying).mockRejectedValueOnce(new Error("Network error"));

    return new Promise<void>((resolve) => {
      createRoot(async (dispose) => {
        const feeds = useDiscoverFeeds();
        await new Promise((r) => setTimeout(r, 100));

        // nowPlaying should be empty (failed), but upcoming should still work.
        expect(feeds.nowPlaying()).toEqual([]);
        expect(getUpcoming).toHaveBeenCalled();
        expect(feeds.loading()).toBe(false);

        dispose();
        resolve();
      });
    });
  });
});
