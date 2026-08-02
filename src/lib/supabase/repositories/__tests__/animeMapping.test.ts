// src/lib/supabase/repositories/__tests__/animeMapping.test.ts
//
// Tests the in-memory cache + the (mocked) Supabase read paths +
// the (mocked) /api/anime-mappings write path.
//
// READ PATH (getAnilistId, getTmdbId):
//   Mocked via `~/lib/supabase/client` → getClient().from().select().
//
// WRITE PATH (saveMapping, autoMap):
//   On the browser (jsdom), saveMapping POSTs to /api/anime-mappings
//   which uses the service role server-side to bypass RLS. We mock
//   global `fetch` and assert the request body.
//
// The actual AniList search is mocked so autoMap doesn't hit the network.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAnilistId,
  getTmdbId,
  saveMapping,
  autoMap,
  clearMappingCache
} from "../animeMapping";

// ─── Mock the Supabase client (READ path only) ─────────────────────

const mockSelectImpl = vi.fn();

vi.mock("~/lib/supabase/client", () => ({
  getClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: (col: string, val: unknown) => ({
          maybeSingle: async () => {
            const result = mockSelectImpl(table, cols, col, val);
            return result;
          }
        })
      })
      // No `upsert` here — writes go through the /api/anime-mappings
      // endpoint on the browser, not via getClient().from().upsert().
      // The test asserts the fetch() call instead.
    })
  })
}));

// ─── Mock fetch (WRITE path — /api/anime-mappings) ──────────────────
//
// saveMapping on the browser POSTs to /api/anime-mappings. We mock
// global fetch to capture the request and return a controlled
// response. Each test can override the response via mockFetch.mockResolvedValueOnce.

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  // Default: 200 OK with { ok: true }
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true })
  });
  vi.stubGlobal("fetch", mockFetch);
});

// Mock the AniList search so autoMap doesn't hit the network.
vi.mock("~/lib/anilist", () => ({
  searchAnime: vi.fn(async (query: string) => ({
    media: [
      {
        id: 101,
        title: { romaji: query, english: query, userPreferred: query },
        seasonYear: 2023,
        format: "TV",
        type: "ANIME"
      },
      {
        id: 202,
        title: { romaji: "Unrelated", english: "Unrelated" },
        seasonYear: 2010,
        format: "TV",
        type: "ANIME"
      }
    ],
    hasNextPage: false
  }))
}));

beforeEach(() => {
  mockSelectImpl.mockReset();
  clearMappingCache();
});

describe("getAnilistId", () => {
  it("returns null when no mapping exists", async () => {
    mockSelectImpl.mockResolvedValue({ data: null, error: null });
    const result = await getAnilistId(12345);
    expect(result).toBeNull();
  });

  it("returns the anilist id when a mapping exists", async () => {
    mockSelectImpl.mockResolvedValue({
      data: {
        tmdb_id: 1428,
        tmdb_type: "tv",
        anilist_id: 5681,
        anilist_type: "ANIME",
        title: "Death Note",
        match_confidence: "high"
      },
      error: null
    });
    const result = await getAnilistId(1428);
    expect(result).toBe(5681);
  });

  it("caches null results so subsequent calls don't re-query", async () => {
    mockSelectImpl.mockResolvedValue({ data: null, error: null });
    await getAnilistId(99999);
    await getAnilistId(99999);
    // The mock should have been called only once for the same id.
    expect(mockSelectImpl).toHaveBeenCalledTimes(1);
  });

  it("caches positive results so subsequent calls don't re-query", async () => {
    mockSelectImpl.mockResolvedValue({
      data: {
        tmdb_id: 1428,
        tmdb_type: "tv",
        anilist_id: 5681,
        anilist_type: "ANIME",
        title: "Death Note",
        match_confidence: "high"
      },
      error: null
    });
    await getAnilistId(1428);
    await getAnilistId(1428);
    expect(mockSelectImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null when supabase errors", async () => {
    mockSelectImpl.mockResolvedValue({
      data: null,
      error: { message: "RLS blocked" }
    });
    const result = await getAnilistId(1);
    expect(result).toBeNull();
  });
});

describe("getTmdbId (reverse lookup)", () => {
  it("returns null when no mapping exists for the anilist id", async () => {
    mockSelectImpl.mockResolvedValue({ data: null, error: null });
    const result = await getTmdbId(99999);
    expect(result).toBeNull();
  });

  it("returns the tmdb id when a mapping exists", async () => {
    mockSelectImpl.mockResolvedValue({
      data: { tmdb_id: 1428 },
      error: null
    });
    const result = await getTmdbId(5681);
    expect(result).toBe(1428);
  });
});

describe("saveMapping (browser path → /api/anime-mappings)", () => {
  it("POSTs to /api/anime-mappings with the correct body", async () => {
    const ok = await saveMapping({
      tmdbId: 1428,
      tmdbType: "tv",
      anilistId: 5681,
      anilistType: "ANIME",
      title: "Death Note",
      matchConfidence: "manual",
      createdBy: "admin"
    });
    expect(ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/anime-mappings");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      tmdbId: 1428,
      tmdbType: "tv",
      anilistId: 5681,
      anilistType: "ANIME",
      title: "Death Note",
      matchConfidence: "manual",
      createdBy: "admin"
    });
  });

  it("returns false when the API returns a non-OK status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "DB down" })
    });
    const ok = await saveMapping({
      tmdbId: 1,
      anilistId: 2
    });
    expect(ok).toBe(false);
  });

  it("returns false when fetch throws (network error)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const ok = await saveMapping({
      tmdbId: 1,
      anilistId: 2
    });
    expect(ok).toBe(false);
  });

  it("populates the in-memory cache after a successful save", async () => {
    // Before saving: getAnilistId would query Supabase (mocked to return null).
    mockSelectImpl.mockResolvedValue({ data: null, error: null });

    await saveMapping({
      tmdbId: 1428,
      anilistId: 5681
    });

    // After saving: getAnilistId should hit the in-memory cache and NOT
    // call Supabase again.
    mockSelectImpl.mockClear();
    const result = await getAnilistId(1428);
    expect(result).toBe(5681);
    expect(mockSelectImpl).not.toHaveBeenCalled();
  });
});

describe("autoMap", () => {
  it("returns existing mapping without searching AniList", async () => {
    mockSelectImpl.mockResolvedValue({
      data: {
        tmdb_id: 1428,
        tmdb_type: "tv",
        anilist_id: 5681,
        anilist_type: "ANIME",
        title: "Death Note",
        match_confidence: "high"
      },
      error: null
    });
    const result = await autoMap({
      tmdbId: 1428,
      title: "Death Note",
      year: 2006,
      tmdbType: "tv"
    });
    expect(result).toBe(5681);
  });

  it("searches AniList when no mapping exists and saves the best match", async () => {
    // First call: no mapping in DB.
    mockSelectImpl.mockResolvedValue({ data: null, error: null });

    const result = await autoMap({
      tmdbId: 99999,
      title: "Death Note", // exact match with mocked search result
      year: 2023,
      tmdbType: "tv"
    });

    expect(result).toBe(101); // The mocked search returned id=101 with title "Death Note"
    // autoMap calls saveMapping, which POSTs to /api/anime-mappings.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      tmdbId: 99999,
      anilistId: 101
    });
  });

  it("returns null when AniList search returns no candidates", async () => {
    mockSelectImpl.mockResolvedValue({ data: null, error: null });
    // Override the anilist mock for this test only.
    const anilist = await import("~/lib/anilist");
    vi.mocked(anilist.searchAnime).mockResolvedValueOnce({ media: [], hasNextPage: false });

    const result = await autoMap({
      tmdbId: 1,
      title: "Nonexistent Anime",
      year: 1900
    });
    expect(result).toBeNull();
  });
});
