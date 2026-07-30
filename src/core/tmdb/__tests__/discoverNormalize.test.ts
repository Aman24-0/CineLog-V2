// src/core/tmdb/__tests__/discoverNormalize.test.ts
import { describe, it, expect } from "vitest";
import {
  normalize,
  normalizeList,
  type TMDBRawItem
} from "../discoverNormalize";

describe("normalize", () => {
  it("returns null for null input", () => {
    expect(normalize(null as unknown as TMDBRawItem)).toBeNull();
  });

  it("returns null for item without id", () => {
    expect(normalize({ title: "No ID" } as TMDBRawItem)).toBeNull();
  });

  it("returns null for item with id=0 (falsy)", () => {
    expect(normalize({ id: 0 } as TMDBRawItem)).toBeNull();
  });

  it("normalizes a movie with media_type", () => {
    const raw: TMDBRawItem = {
      id: 1,
      title: "Inception",
      media_type: "movie",
      poster_path: "/abc.jpg",
      release_date: "2010-07-16",
      vote_average: 8.8,
      vote_count: 30000,
      genre_ids: [28, 878]
    };
    const result = normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.title).toBe("Inception");
    expect(result!.media_type).toBe("movie");
    expect(result!.genres).toEqual(["Action", "Sci-Fi"]);
  });

  it("normalizes a TV series (uses name instead of title)", () => {
    const raw: TMDBRawItem = {
      id: 2,
      name: "Breaking Bad",
      media_type: "tv",
      first_air_date: "2008-01-20"
    };
    const result = normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Breaking Bad");
    expect(result!.media_type).toBe("tv");
  });

  it("uses fallbackMediaType when media_type is missing", () => {
    const raw: TMDBRawItem = { id: 3, title: "No Media Type" };
    const result = normalize(raw, "movie");
    expect(result).not.toBeNull();
    expect(result!.media_type).toBe("movie");
  });

  it("returns null for invalid media_type (not 'movie' or 'tv')", () => {
    const raw: TMDBRawItem = { id: 4, media_type: "person" };
    expect(normalize(raw)).toBeNull();
  });

  it("defaults to 'movie' when no media_type and no fallback", () => {
    const raw: TMDBRawItem = { id: 5, title: "Default" };
    const result = normalize(raw);
    expect(result!.media_type).toBe("movie");
  });

  it("converts null poster_path to null (not undefined)", () => {
    const raw: TMDBRawItem = { id: 6, media_type: "movie", poster_path: null };
    const result = normalize(raw);
    expect(result!.poster_path).toBeNull();
  });

  it("converts undefined poster_path to null", () => {
    const raw: TMDBRawItem = { id: 7, media_type: "movie" };
    const result = normalize(raw);
    expect(result!.poster_path).toBeNull();
  });

  it("resolves genre_ids to genre names", () => {
    const raw: TMDBRawItem = {
      id: 8,
      media_type: "movie",
      genre_ids: [28, 35, 99999] // last one unknown
    };
    const result = normalize(raw);
    expect(result!.genres).toEqual(["Action", "Comedy"]);
  });

  it("preserves all optional fields", () => {
    const raw: TMDBRawItem = {
      id: 9,
      media_type: "movie",
      title: "Test",
      poster_path: "/p.jpg",
      backdrop_path: "/b.jpg",
      overview: "An overview",
      release_date: "2023-01-01",
      vote_average: 7.5,
      vote_count: 500,
      genre_ids: [28]
    };
    const result = normalize(raw);
    expect(result!.overview).toBe("An overview");
    expect(result!.backdrop_path).toBe("/b.jpg");
    expect(result!.vote_average).toBe(7.5);
    expect(result!.vote_count).toBe(500);
  });
});

describe("normalizeList", () => {
  it("returns empty array for undefined", () => {
    expect(normalizeList(undefined)).toEqual([]);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeList("not an array" as unknown as TMDBRawItem[])).toEqual(
      []
    );
  });

  it("returns empty array for empty array", () => {
    expect(normalizeList([])).toEqual([]);
  });

  it("normalizes all valid items", () => {
    const raw: TMDBRawItem[] = [
      { id: 1, media_type: "movie", title: "A" },
      { id: 2, media_type: "tv", name: "B" }
    ];
    const result = normalizeList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("A");
    expect(result[1].name).toBe("B");
  });

  it("filters out null results (items without id)", () => {
    const raw: TMDBRawItem[] = [
      { id: 1, media_type: "movie" },
      { title: "no id" } as TMDBRawItem,
      { id: 3, media_type: "tv" }
    ];
    const result = normalizeList(raw);
    expect(result).toHaveLength(2);
  });

  it("passes fallbackMediaType to normalize", () => {
    const raw: TMDBRawItem[] = [{ id: 1, title: "No MT" }];
    const result = normalizeList(raw, "tv");
    expect(result[0].media_type).toBe("tv");
  });
});
