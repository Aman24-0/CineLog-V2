// src/lib/supabase/repositories/__tests__/animeMapping.test.ts
//
// Tests the in-memory cache + the (mocked) Supabase read/write paths.
// The actual AniList search is mocked so we don't hit the network.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAnilistId,
  getTmdbId,
  saveMapping,
  autoMap,
  clearMappingCache
} from "../animeMapping";

// ─── Mock the Supabase client ───────────────────────────────────────
// We mock the entire `~/lib/supabase/client` module so the repository
// uses our fake client instead of the real one. Each test configures
// the fake's behavior via `mockSupabaseSelect` / `mockSupabaseUpsert`.

const mockData = new Map<string, unknown>();
const mockSelectImpl = vi.fn();
const mockUpsertImpl = vi.fn();

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
      }),
      upsert: async (row: unknown, opts?: unknown) => {
        return mockUpsertImpl(table, row, opts);
      }
    })
  })
}));

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
  mockData.clear();
  mockSelectImpl.mockReset();
  mockUpsertImpl.mockReset();
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

describe("saveMapping", () => {
  it("calls supabase upsert with the correct row", async () => {
    mockUpsertImpl.mockResolvedValue({ error: null });
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
    expect(mockUpsertImpl).toHaveBeenCalledTimes(1);
    const [table, row] = mockUpsertImpl.mock.calls[0];
    expect(table).toBe("anime_mappings");
    expect(row).toMatchObject({
      tmdb_id: 1428,
      anilist_id: 5681,
      title: "Death Note",
      match_confidence: "manual",
      created_by: "admin"
    });
  });

  it("returns false when upsert errors", async () => {
    mockUpsertImpl.mockResolvedValue({
      error: { message: "RLS blocked write" }
    });
    const ok = await saveMapping({
      tmdbId: 1,
      anilistId: 2
    });
    expect(ok).toBe(false);
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
    // Then saveMapping will be called — we accept it.
    let callCount = 0;
    mockSelectImpl.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { data: null, error: null };
      }
      // Subsequent calls (from cache) shouldn't happen because the
      // mapping should be cached in memory after saveMapping.
      return { data: null, error: null };
    });
    mockUpsertImpl.mockResolvedValue({ error: null });

    const result = await autoMap({
      tmdbId: 99999,
      title: "Death Note", // exact match with mocked search result
      year: 2023,
      tmdbType: "tv"
    });

    expect(result).toBe(101); // The mocked search returned id=101 with title "Death Note"
    expect(mockUpsertImpl).toHaveBeenCalledTimes(1);
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
