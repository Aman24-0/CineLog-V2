// src/core/tmdb/__tests__/genres.test.ts
import { describe, it, expect } from "vitest";
import {
  MOVIE_GENRES,
  TV_GENRES,
  resolveGenres,
  GENRE_ID,
  genreIdFor,
} from "../genres";

describe("MOVIE_GENRES", () => {
  it("maps 28 → 'Action'", () => {
    expect(MOVIE_GENRES[28]).toBe("Action");
  });

  it("maps 35 → 'Comedy'", () => {
    expect(MOVIE_GENRES[35]).toBe("Comedy");
  });

  it("maps 878 → 'Sci-Fi'", () => {
    expect(MOVIE_GENRES[878]).toBe("Sci-Fi");
  });

  it("returns undefined for unknown id", () => {
    expect(MOVIE_GENRES[99999]).toBeUndefined();
  });
});

describe("TV_GENRES", () => {
  it("maps 10759 → 'Action & Adventure'", () => {
    expect(TV_GENRES[10759]).toBe("Action & Adventure");
  });

  it("maps 18 → 'Drama'", () => {
    expect(TV_GENRES[18]).toBe("Drama");
  });

  it("returns undefined for unknown id", () => {
    expect(TV_GENRES[99999]).toBeUndefined();
  });
});

describe("resolveGenres", () => {
  it("returns empty array for undefined ids", () => {
    expect(resolveGenres(undefined, "movie")).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(resolveGenres([], "movie")).toEqual([]);
  });

  it("resolves movie genre ids to names", () => {
    expect(resolveGenres([28, 35], "movie")).toEqual(["Action", "Comedy"]);
  });

  it("resolves tv genre ids to names", () => {
    expect(resolveGenres([10759, 18], "tv")).toEqual(["Action & Adventure", "Drama"]);
  });

  it("uses movie map for movie media type", () => {
    // 16 = Animation in both maps, but 28 is Action (movie-only)
    expect(resolveGenres([28], "movie")).toEqual(["Action"]);
    expect(resolveGenres([28], "tv")).toEqual([]); // 28 not in TV map
  });

  it("filters out unknown ids (undefined results)", () => {
    expect(resolveGenres([28, 99999], "movie")).toEqual(["Action"]);
  });

  it("preserves order of input ids", () => {
    expect(resolveGenres([35, 28, 18], "movie")).toEqual(["Comedy", "Action", "Drama"]);
  });
});

describe("GENRE_ID", () => {
  it("exposes movie map", () => {
    expect(GENRE_ID.movie).toBe(MOVIE_GENRES);
  });

  it("exposes tv map", () => {
    expect(GENRE_ID.tv).toBe(TV_GENRES);
  });
});

describe("genreIdFor", () => {
  it("finds 'Action' in movie map", () => {
    expect(genreIdFor("Action", "movie")).toBe(28);
  });

  it("finds 'Comedy' in tv map", () => {
    expect(genreIdFor("Comedy", "tv")).toBe(35);
  });

  it("case-insensitive lookup", () => {
    expect(genreIdFor("action", "movie")).toBe(28);
    expect(genreIdFor("ACTION", "movie")).toBe(28);
  });

  it("resolves 'Sci-Fi' alias", () => {
    expect(genreIdFor("Sci-Fi", "movie")).toBe(878);
  });

  it("resolves 'Science Fiction' alias → Sci-Fi", () => {
    expect(genreIdFor("Science Fiction", "movie")).toBe(878);
  });

  it("resolves 'scifi' alias → Sci-Fi", () => {
    expect(genreIdFor("scifi", "movie")).toBe(878);
  });

  it("resolves 'Action & Adventure' alias for TV", () => {
    expect(genreIdFor("Action & Adventure", "tv")).toBe(10759);
  });

  it("returns undefined for unknown genre name", () => {
    expect(genreIdFor("Nonexistent", "movie")).toBeUndefined();
  });

  it("returns undefined when genre exists in movie but not tv", () => {
    // "Western" exists in both, but "TV Movie" (10770) is movie-only
    expect(genreIdFor("TV Movie", "tv")).toBeUndefined();
  });
});
