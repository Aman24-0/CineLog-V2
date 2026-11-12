// src/features/search/__tests__/dedupeSearchResults.test.ts
import { describe, expect, it } from "vitest";
import {
  collapseDuplicateMediaTypes,
  normalizeTitleKey,
  titleYearOf
} from "../dedupeSearchResults";
import type { TMDBTitle } from "~/shared/types";

function movie(partial: Partial<TMDBTitle> & { id: number }): TMDBTitle {
  return {
    id: partial.id,
    title: partial.title,
    media_type: "movie",
    poster_path: partial.poster_path ?? null,
    backdrop_path: null,
    overview: partial.overview,
    release_date: partial.release_date,
    vote_average: partial.vote_average,
    vote_count: partial.vote_count
  } as TMDBTitle;
}

function series(partial: Partial<TMDBTitle> & { id: number }): TMDBTitle {
  return {
    id: partial.id,
    name: partial.name,
    media_type: "tv",
    poster_path: partial.poster_path ?? null,
    backdrop_path: null,
    overview: partial.overview,
    first_air_date: partial.first_air_date,
    vote_average: partial.vote_average,
    vote_count: partial.vote_count
  } as TMDBTitle;
}

describe("normalizeTitleKey / titleYearOf", () => {
  it("normalises punctuation, case and diacritics", () => {
    expect(normalizeTitleKey("  Lanterns: The Official Podcast! ")).toBe(
      "lanterns the official podcast"
    );
    expect(normalizeTitleKey("Amélie")).toBe("amelie");
  });

  it("reads the year from either date field", () => {
    expect(titleYearOf(movie({ id: 1, release_date: "2026-08-16" }))).toBe("2026");
    expect(titleYearOf(series({ id: 2, first_air_date: "2026-08-16" }))).toBe(
      "2026"
    );
    expect(titleYearOf(movie({ id: 3 }))).toBe("");
  });
});

describe("collapseDuplicateMediaTypes", () => {
  it("drops the movie-typed twin of a series (the Lanterns bug)", () => {
    const result = collapseDuplicateMediaTypes(
      [
        // Placeholder movie entry created for the HBO series.
        movie({ id: 1823275, title: "Lanterns", vote_average: 7, vote_count: 12 }),
        // A real, unrelated movie.
        movie({ id: 550, title: "Fight Club", release_date: "1999-10-15" })
      ],
      [
        series({
          id: 95350,
          name: "Lanterns",
          first_air_date: "2026-08-16",
          poster_path: "/rb94rKVIzLyfWufIN7WqLvadBDH.jpg",
          vote_count: 480
        })
      ]
    );

    expect(result.movies.map((m) => m.id)).toEqual([550]);
    expect(result.series.map((s) => s.id)).toEqual([95350]);
    expect(result.removed).toBe(1);
  });

  it("keeps a same-named movie from a different year", () => {
    const result = collapseDuplicateMediaTypes(
      [movie({ id: 275, title: "Fargo", release_date: "1996-03-08" })],
      [series({ id: 60622, name: "Fargo", first_air_date: "2014-04-15" })]
    );

    expect(result.movies.map((m) => m.id)).toEqual([275]);
    expect(result.series.map((s) => s.id)).toEqual([60622]);
    expect(result.removed).toBe(0);
  });

  it("collapses exact duplicates inside one list, keeping the healthier row", () => {
    const bare = movie({ id: 11, title: "Lanterns" });
    const rich = movie({
      id: 12,
      title: "Lanterns",
      poster_path: "/x.jpg",
      vote_count: 90,
      overview: "Two intergalactic cops…"
    });

    const result = collapseDuplicateMediaTypes([bare, rich], []);

    expect(result.movies).toHaveLength(1);
    expect(result.movies[0].id).toBe(12);
    expect(result.removed).toBe(1);
  });

  it("leaves unrelated results untouched", () => {
    const result = collapseDuplicateMediaTypes(
      [
        movie({ id: 1, title: "Human Lanterns", release_date: "1982-01-01" }),
        movie({ id: 2, title: "Paper Lanterns", release_date: "2016-01-01" })
      ],
      [series({ id: 3, name: "Mouse", first_air_date: "2021-03-03" })]
    );

    expect(result.movies).toHaveLength(2);
    expect(result.series).toHaveLength(1);
    expect(result.removed).toBe(0);
  });
});
