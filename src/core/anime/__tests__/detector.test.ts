// src/core/anime/__tests__/detector.test.ts
import { describe, it, expect } from "vitest";
import {
  isAnimeByHeuristics,
  GENRE_ID_ANIMATION,
  COUNTRY_JP,
  LANGUAGE_JA,
  isAnimeDetails,
  isAnimeTitle
} from "../detector";
import type { TMDBDetails, TMDBTitle } from "~/shared/types";

describe("isAnimeByHeuristics", () => {
  describe("Signal 1: JP origin + Animation genre", () => {
    it("returns true when origin_country=JP + genre 16", () => {
      expect(
        isAnimeByHeuristics({
          genre_ids: [16, 18],
          origin_country: ["JP"]
        })
      ).toBe(true);
    });

    it("returns false when origin_country=US + genre 16 (not JP)", () => {
      expect(
        isAnimeByHeuristics({
          genre_ids: [16, 35],
          origin_country: ["US"]
        })
      ).toBe(false);
    });

    it("returns true when genres is an array of {id} objects", () => {
      expect(
        isAnimeByHeuristics({
          genres: [{ id: 16 }, { id: 18 }],
          origin_country: ["JP"]
        })
      ).toBe(true);
    });

    it("returns false when origin_country is missing", () => {
      expect(
        isAnimeByHeuristics({
          genre_ids: [16],
          origin_country: []
        })
      ).toBe(false);
    });
  });

  describe("Signal 2: Animation genre + Japanese language", () => {
    it("returns true when spoken_languages includes ja + genre 16", () => {
      expect(
        isAnimeByHeuristics({
          genre_ids: [16],
          spoken_languages: [{ iso_639_1: "ja" }]
        })
      ).toBe(true);
    });

    it("returns true when original_language=ja + genre 16", () => {
      expect(
        isAnimeByHeuristics({
          genre_ids: [16],
          original_language: LANGUAGE_JA
        })
      ).toBe(true);
    });

    it("returns false when language=en + genre 16 (not ja)", () => {
      expect(
        isAnimeByHeuristics({
          genre_ids: [16],
          original_language: "en"
        })
      ).toBe(false);
    });
  });

  describe("Signal 3: Strong keywords", () => {
    it("returns true when overview contains 'ova'", () => {
      expect(
        isAnimeByHeuristics({
          title: "Some Title",
          overview: "This is an OVA release from 2018."
        })
      ).toBe(true);
    });

    it("returns true when title contains 'manga adaptation'", () => {
      expect(
        isAnimeByHeuristics({
          title: "My Series (manga adaptation)",
          overview: ""
        })
      ).toBe(true);
    });

    it("returns false when overview contains 'anime' but no JP origin", () => {
      // "anime" is a WEAK keyword — only matches with JP origin.
      expect(
        isAnimeByHeuristics({
          title: "Animetown USA",
          overview: "An animated show."
        })
      ).toBe(false);
    });

    it("returns true when overview contains 'anime' + JP origin (weak keyword)", () => {
      expect(
        isAnimeByHeuristics({
          title: "Some Series",
          overview: "A popular anime from Studio Ghibli.",
          origin_country: ["JP"]
        })
      ).toBe(true);
    });

    it("does NOT match 'anime' as a substring (word boundary)", () => {
      // "Animetown" should NOT match the keyword "anime".
      expect(
        isAnimeByHeuristics({
          title: "Animetown",
          overview: ""
        })
      ).toBe(false);
    });
  });

  describe("Constants", () => {
    it("GENRE_ID_ANIMATION is 16", () => {
      expect(GENRE_ID_ANIMATION).toBe(16);
    });
    it("COUNTRY_JP is 'JP'", () => {
      expect(COUNTRY_JP).toBe("JP");
    });
    it("LANGUAGE_JA is 'ja'", () => {
      expect(LANGUAGE_JA).toBe("ja");
    });
  });
});

describe("isAnimeDetails", () => {
  const animeDetails = {
    genres: [{ id: 16, name: "Animation" }],
    origin_country: ["JP"],
    title: "Attack on Titan",
    overview: ""
  } as unknown as TMDBDetails;

  const nonAnimeDetails = {
    genres: [{ id: 28, name: "Action" }],
    origin_country: ["US"],
    title: "The Dark Knight",
    overview: ""
  } as unknown as TMDBDetails;

  it("returns true for anime details", () => {
    expect(isAnimeDetails(animeDetails)).toBe(true);
  });

  it("returns false for non-anime details", () => {
    expect(isAnimeDetails(nonAnimeDetails)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isAnimeDetails(null)).toBe(false);
  });
});

describe("isAnimeTitle", () => {
  const animeTitle = {
    genre_ids: [16],
    origin_country: ["JP"],
    title: "Spirited Away",
    media_type: "movie" as const
  } as unknown as TMDBTitle;

  const nonAnimeTitle = {
    genre_ids: [28],
    origin_country: ["US"],
    title: "Die Hard",
    media_type: "movie" as const
  } as unknown as TMDBTitle;

  it("returns true for anime title", () => {
    expect(isAnimeTitle(animeTitle)).toBe(true);
  });

  it("returns false for non-anime title", () => {
    expect(isAnimeTitle(nonAnimeTitle)).toBe(false);
  });
});
