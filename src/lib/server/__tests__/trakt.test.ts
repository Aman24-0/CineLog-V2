// src/lib/server/__tests__/trakt.test.ts
//
// Unit tests for the Trakt API client's pure helpers.
//
// We test only the pure functions (normalize, dedupe, applyTraktRatings,
// buildTraktAuthorizeUrl) — the fetch-based functions are networked and
// would need full HTTP mocking, which is brittle. The fetch paths are
// exercised end-to-end by the /api/sync/trakt/preview and /execute
// route tests, which mock fetch at the route level.
//
// Run: npx vitest run src/lib/server/__tests__/trakt.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The trakt module imports `isServer` from solid-js/web to guard
// against browser imports. Vitest's jsdom environment makes isServer
// false, which would make readTraktConfig throw. We stub solid-js/web
// so isServer is always true in these tests — the trakt module is
// server-only code, and we're testing it as if running on the server.
vi.mock("solid-js/web", () => ({
  isServer: true
}));

// The trakt module reads env vars at module-load time inside
// readTraktConfig(). We set them BEFORE importing the module so the
// pure helpers that internally call readTraktConfig (only
// buildTraktAuthorizeUrl does) can resolve them.
beforeEach(() => {
  vi.stubEnv("TRAKT_CLIENT_ID", "test_client_id_abc123");
  vi.stubEnv("TRAKT_CLIENT_SECRET", "test_client_secret_xyz789");
  vi.stubEnv("TRAKT_REDIRECT_URI", "https://cinelog.app/api/auth/trakt/callback");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Import after env stubs are in place. Vitest hoists imports by
// default, so we use dynamic import inside each test block to ensure
// the env stubs are applied before the module loads.
async function importTrakt() {
  return await import("~/lib/server/trakt");
}

describe("trakt: buildTraktAuthorizeUrl", () => {
  it("builds the correct authorize URL with state", async () => {
    const { buildTraktAuthorizeUrl } = await importTrakt();
    const url = buildTraktAuthorizeUrl("random_state_123");
    expect(url).toContain("https://api.trakt.tv/oauth/authorize?");
    expect(url).toContain("response_type=code");
    expect(url).toContain("client_id=test_client_id_abc123");
    expect(url).toContain(
      "redirect_uri=https%3A%2F%2Fcinelog.app%2Fapi%2Fauth%2Ftrakt%2Fcallback"
    );
    expect(url).toContain("state=random_state_123");
  });
});

describe("trakt: normalizeTraktHistoryEntry", () => {
  it("normalizes a movie entry with TMDB ID", async () => {
    const { normalizeTraktHistoryEntry } = await importTrakt();
    const entry = {
      id: 1,
      watched_at: "2024-01-15T10:30:00Z",
      type: "movie" as const,
      movie: {
        title: "Inception",
        year: 2010,
        ids: { trakt: 1, slug: "inception-2010", tmdb: 27205 }
      }
    };
    const result = normalizeTraktHistoryEntry(entry);
    expect(result).toEqual({
      tmdb_id: 27205,
      media_type: "movie",
      title: "Inception",
      year: 2010,
      watched_at: "2024-01-15T10:30:00Z",
      rating: null
    });
  });

  it("returns null for a movie entry without TMDB ID", async () => {
    const { normalizeTraktHistoryEntry } = await importTrakt();
    const entry = {
      id: 1,
      watched_at: "2024-01-15T10:30:00Z",
      type: "movie" as const,
      movie: {
        title: "Obscure Indie Film",
        year: 1999,
        ids: { trakt: 999, slug: "obscure-indie-1999" }
      }
    };
    expect(normalizeTraktHistoryEntry(entry)).toBeNull();
  });

  it("normalizes an episode entry with TMDB ID for the show", async () => {
    const { normalizeTraktHistoryEntry } = await importTrakt();
    const entry = {
      id: 100,
      watched_at: "2024-02-20T19:00:00Z",
      type: "episode" as const,
      show: {
        title: "Breaking Bad",
        year: 2008,
        ids: { trakt: 1, slug: "breaking-bad", tmdb: 1396 }
      },
      episode: {
        season: 1,
        number: 1,
        title: "Pilot",
        ids: { trakt: 100 }
      }
    };
    const result = normalizeTraktHistoryEntry(entry);
    expect(result).toEqual({
      tmdb_id: 1396,
      media_type: "tv",
      title: "Breaking Bad",
      year: 2008,
      watched_at: "2024-02-20T19:00:00Z",
      rating: null,
      season: 1,
      episode: 1
    });
  });

  it("returns null for an episode entry when the show is missing TMDB ID", async () => {
    const { normalizeTraktHistoryEntry } = await importTrakt();
    const entry = {
      id: 100,
      watched_at: "2024-02-20T19:00:00Z",
      type: "episode" as const,
      show: {
        title: "Unknown Show",
        year: 2020,
        ids: { trakt: 5, slug: "unknown-show" }
      },
      episode: { season: 1, number: 1, title: "E1", ids: { trakt: 100 } }
    };
    expect(normalizeTraktHistoryEntry(entry)).toBeNull();
  });

  it("returns null for unknown entry types", async () => {
    const { normalizeTraktHistoryEntry } = await importTrakt();
    const entry = {
      id: 1,
      watched_at: "x",
      type: "season"
    } as unknown as import("~/lib/server/trakt").TraktHistoryEntry;
    expect(normalizeTraktHistoryEntry(entry)).toBeNull();
  });

  it("falls back to 'Untitled' for movies with empty title", async () => {
    const { normalizeTraktHistoryEntry } = await importTrakt();
    const entry = {
      id: 1,
      watched_at: "2024-01-15T10:30:00Z",
      type: "movie" as const,
      movie: {
        title: "",
        year: 2020,
        ids: { trakt: 1, slug: "x", tmdb: 100 }
      }
    };
    const result = normalizeTraktHistoryEntry(entry);
    expect(result?.title).toBe("Untitled");
  });
});

describe("trakt: dedupeTraktItems", () => {
  it("keeps the most recent watch when the same movie appears twice", async () => {
    const { dedupeTraktItems } = await importTrakt();
    const items = [
      {
        tmdb_id: 27205,
        media_type: "movie" as const,
        title: "Inception",
        year: 2010,
        watched_at: "2024-01-15T10:30:00Z",
        rating: null
      },
      {
        tmdb_id: 27205,
        media_type: "movie" as const,
        title: "Inception",
        year: 2010,
        watched_at: "2024-03-20T18:00:00Z",
        rating: null
      }
    ];
    const result = dedupeTraktItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].watched_at).toBe("2024-03-20T18:00:00Z");
  });

  it("dedupes TV episodes per show (by tmdb_id), keeping the latest", async () => {
    const { dedupeTraktItems } = await importTrakt();
    const items = [
      {
        tmdb_id: 1396,
        media_type: "tv" as const,
        title: "Breaking Bad",
        year: 2008,
        watched_at: "2024-01-01T00:00:00Z",
        rating: null,
        season: 1,
        episode: 1
      },
      {
        tmdb_id: 1396,
        media_type: "tv" as const,
        title: "Breaking Bad",
        year: 2008,
        watched_at: "2024-05-01T00:00:00Z",
        rating: null,
        season: 5,
        episode: 14
      }
    ];
    const result = dedupeTraktItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].season).toBe(5);
    expect(result[0].episode).toBe(14);
  });

  it("preserves items with different tmdb_ids", async () => {
    const { dedupeTraktItems } = await importTrakt();
    const items = [
      {
        tmdb_id: 1,
        media_type: "movie" as const,
        title: "A",
        year: 2020,
        watched_at: "2024-01-01T00:00:00Z",
        rating: null
      },
      {
        tmdb_id: 2,
        media_type: "movie" as const,
        title: "B",
        year: 2021,
        watched_at: "2024-01-02T00:00:00Z",
        rating: null
      }
    ];
    const result = dedupeTraktItems(items);
    expect(result).toHaveLength(2);
  });

  it("preserves items with same tmdb_id but different media_type", async () => {
    const { dedupeTraktItems } = await importTrakt();
    const items = [
      {
        tmdb_id: 999,
        media_type: "movie" as const,
        title: "The Movie",
        year: 2020,
        watched_at: "2024-01-01T00:00:00Z",
        rating: null
      },
      {
        tmdb_id: 999,
        media_type: "tv" as const,
        title: "The Show",
        year: 2020,
        watched_at: "2024-01-02T00:00:00Z",
        rating: null
      }
    ];
    const result = dedupeTraktItems(items);
    expect(result).toHaveLength(2);
  });

  it("handles an empty list", async () => {
    const { dedupeTraktItems } = await importTrakt();
    expect(dedupeTraktItems([])).toEqual([]);
  });
});

describe("trakt: applyTraktRatings", () => {
  it("applies a movie rating to the matching history item", async () => {
    const { applyTraktRatings } = await importTrakt();
    const items = [
      {
        tmdb_id: 27205,
        media_type: "movie" as const,
        title: "Inception",
        year: 2010,
        watched_at: "2024-01-15T00:00:00Z",
        rating: null
      }
    ];
    const ratings = [
      {
        rated_at: "2024-01-16T00:00:00Z",
        rating: 9,
        type: "movie" as const,
        movie: {
          title: "Inception",
          year: 2010,
          ids: { trakt: 1, slug: "inception-2010", tmdb: 27205 }
        }
      }
    ];
    const result = applyTraktRatings(items, ratings);
    expect(result[0].rating).toBe(9);
  });

  it("applies a show rating to the matching TV history item", async () => {
    const { applyTraktRatings } = await importTrakt();
    const items = [
      {
        tmdb_id: 1396,
        media_type: "tv" as const,
        title: "Breaking Bad",
        year: 2008,
        watched_at: "2024-01-15T00:00:00Z",
        rating: null
      }
    ];
    const ratings = [
      {
        rated_at: "2024-02-01T00:00:00Z",
        rating: 10,
        type: "show" as const,
        show: {
          title: "Breaking Bad",
          year: 2008,
          ids: { trakt: 1, slug: "breaking-bad", tmdb: 1396 }
        }
      }
    ];
    const result = applyTraktRatings(items, ratings);
    expect(result[0].rating).toBe(10);
  });

  it("ignores per-episode ratings (we want per-show)", async () => {
    const { applyTraktRatings } = await importTrakt();
    const items = [
      {
        tmdb_id: 1396,
        media_type: "tv" as const,
        title: "Breaking Bad",
        year: 2008,
        watched_at: "2024-01-15T00:00:00Z",
        rating: null
      }
    ];
    const ratings = [
      {
        rated_at: "2024-02-01T00:00:00Z",
        rating: 5,
        type: "episode" as const,
        episode: { season: 1, number: 1, title: "Pilot", ids: { trakt: 100 } },
        show: {
          title: "Breaking Bad",
          year: 2008,
          ids: { trakt: 1, slug: "breaking-bad", tmdb: 1396 }
        }
      }
    ];
    const result = applyTraktRatings(items, ratings);
    expect(result[0].rating).toBeNull();
  });

  it("leaves items without a rating as null", async () => {
    const { applyTraktRatings } = await importTrakt();
    const items = [
      {
        tmdb_id: 27205,
        media_type: "movie" as const,
        title: "Inception",
        year: 2010,
        watched_at: "2024-01-15T00:00:00Z",
        rating: null
      },
      {
        tmdb_id: 99999,
        media_type: "movie" as const,
        title: "Unrated Film",
        year: 2022,
        watched_at: "2024-02-15T00:00:00Z",
        rating: null
      }
    ];
    const ratings = [
      {
        rated_at: "2024-01-16T00:00:00Z",
        rating: 8,
        type: "movie" as const,
        movie: {
          title: "Inception",
          year: 2010,
          ids: { trakt: 1, slug: "inception-2010", tmdb: 27205 }
        }
      }
    ];
    const result = applyTraktRatings(items, ratings);
    expect(result[0].rating).toBe(8);
    expect(result[1].rating).toBeNull();
  });

  it("handles empty ratings list", async () => {
    const { applyTraktRatings } = await importTrakt();
    const items = [
      {
        tmdb_id: 1,
        media_type: "movie" as const,
        title: "X",
        year: 2020,
        watched_at: "2024-01-01T00:00:00Z",
        rating: null
      }
    ];
    const result = applyTraktRatings(items, []);
    expect(result[0].rating).toBeNull();
  });

  it("does not mutate the input items", async () => {
    const { applyTraktRatings } = await importTrakt();
    const items = [
      {
        tmdb_id: 27205,
        media_type: "movie" as const,
        title: "Inception",
        year: 2010,
        watched_at: "2024-01-15T00:00:00Z",
        rating: null
      }
    ];
    const ratings = [
      {
        rated_at: "2024-01-16T00:00:00Z",
        rating: 7,
        type: "movie" as const,
        movie: {
          title: "Inception",
          year: 2010,
          ids: { trakt: 1, slug: "inception-2010", tmdb: 27205 }
        }
      }
    ];
    applyTraktRatings(items, ratings);
    expect(items[0].rating).toBeNull(); // unchanged
  });
});
