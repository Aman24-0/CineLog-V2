// src/features/search/__tests__/animeSearchFallback.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  looksLikeAnimeQuery,
  searchAnimeFallback
} from "../animeSearchFallback";

describe("looksLikeAnimeQuery", () => {
  it("returns false for queries shorter than 3 chars", () => {
    expect(looksLikeAnimeQuery("")).toBe(false);
    expect(looksLikeAnimeQuery("a")).toBe(false);
    expect(looksLikeAnimeQuery("ab")).toBe(false);
  });

  it("returns true for queries containing Japanese characters (hiragana)", () => {
    expect(looksLikeAnimeQuery("進撃の巨人")).toBe(true);
  });

  it("returns true for queries containing Japanese characters (katakana)", () => {
    expect(looksLikeAnimeQuery("アタックオンタイタン")).toBe(true);
  });

  it("returns true for queries containing Japanese characters (kanji)", () => {
    expect(looksLikeAnimeQuery("鬼滅の刃")).toBe(true);
  });

  it("returns true for queries containing 'anime' as a standalone word", () => {
    expect(looksLikeAnimeQuery("best anime 2024")).toBe(true);
  });

  it("returns true for queries containing 'manga' as a standalone word", () => {
    expect(looksLikeAnimeQuery("one piece manga")).toBe(true);
  });

  it("returns true for queries containing 'ova'", () => {
    expect(looksLikeAnimeQuery("flcl ova")).toBe(true);
  });

  it("returns true for queries containing 'shounen'", () => {
    expect(looksLikeAnimeQuery("shounen series")).toBe(true);
  });

  it("returns true for queries containing 'isekai'", () => {
    expect(looksLikeAnimeQuery("isekai anime")).toBe(true);
  });

  it("returns false for ordinary English movie queries", () => {
    expect(looksLikeAnimeQuery("the dark knight")).toBe(false);
    expect(looksLikeAnimeQuery("inception")).toBe(false);
    expect(looksLikeAnimeQuery("avengers endgame")).toBe(false);
  });

  it("returns false for 'anime' as a substring (word boundary)", () => {
    expect(looksLikeAnimeQuery("animetown")).toBe(false);
  });
});

// ─── Mock the AniList + mapping dependencies ────────────────────────

vi.mock("~/lib/anilist", () => ({
  searchAnime: vi.fn(async (query: string) => ({
    media: query === "EMPTY"
      ? []
      : [
          {
            id: 101,
            title: { userPreferred: query, romaji: query, english: query },
            type: "ANIME",
            format: "TV"
          }
        ],
    hasNextPage: false
  }))
}));

vi.mock("~/lib/supabase/repositories/animeMapping", () => ({
  getTmdbId: vi.fn(async (anilistId: number) =>
    anilistId === 101 ? 1428 : null
  )
}));

vi.mock("~/core/tmdb/tmdb", () => ({
  fetchTmdbMetadataBatch: vi.fn(async (items: Array<{ mediaType: "tv"; tmdbId: number }>) => {
    const map = new Map();
    for (const item of items) {
      map.set(`${item.mediaType}/${item.tmdbId}`, {
        id: item.tmdbId,
        title: "Mapped Anime Title",
        media_type: "tv"
      });
    }
    return map;
  })
}));

import { searchAnime } from "~/lib/anilist";
import { getTmdbId } from "~/lib/supabase/repositories/animeMapping";
import { fetchTmdbMetadataBatch } from "~/core/tmdb/tmdb";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchAnimeFallback", () => {
  it("returns empty array for queries shorter than 3 chars", async () => {
    const result = await searchAnimeFallback("ab");
    expect(result).toEqual([]);
    expect(searchAnime).not.toHaveBeenCalled();
  });

  it("returns empty array when AniList search returns no results", async () => {
    const result = await searchAnimeFallback("EMPTY");
    expect(result).toEqual([]);
  });

  it("returns empty array when no AniList results have TMDB mappings", async () => {
    // Mock returns anilist id 999 with no TMDB mapping.
    vi.mocked(searchAnime).mockResolvedValueOnce({
      media: [
        {
          id: 999,
          title: { userPreferred: "Unmapped" },
          type: "ANIME",
          format: "TV"
        }
      ],
      hasNextPage: false
    });
    vi.mocked(getTmdbId).mockResolvedValueOnce(null);
    const result = await searchAnimeFallback("unmapped anime");
    expect(result).toEqual([]);
  });

  it("returns TMDB titles when mappings exist", async () => {
    const result = await searchAnimeFallback("attack on titan");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1428);
    expect(result[0].title).toBe("Mapped Anime Title");
    expect(getTmdbId).toHaveBeenCalledWith(101);
    expect(fetchTmdbMetadataBatch).toHaveBeenCalled();
  });

  it("returns empty array on AniList error", async () => {
    vi.mocked(searchAnime).mockRejectedValueOnce(new Error("network fail"));
    const result = await searchAnimeFallback("some anime");
    expect(result).toEqual([]);
  });
});
