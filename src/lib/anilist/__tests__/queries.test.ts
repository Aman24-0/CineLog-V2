// src/lib/anilist/__tests__/queries.test.ts
import { describe, it, expect } from "vitest";
import {
  currentAniListSeason,
  QUERY_MEDIA_DETAILS,
  QUERY_TRENDING,
  QUERY_SEASONAL,
  QUERY_SEARCH
} from "../queries";

describe("currentAniListSeason", () => {
  it("returns WINTER for January", () => {
    const result = currentAniListSeason(new Date(2025, 0, 15));
    expect(result.season).toBe("WINTER");
    expect(result.year).toBe(2025);
  });

  it("returns WINTER for February", () => {
    const result = currentAniListSeason(new Date(2025, 1, 15));
    expect(result.season).toBe("WINTER");
  });

  it("returns WINTER for March", () => {
    const result = currentAniListSeason(new Date(2025, 2, 15));
    expect(result.season).toBe("WINTER");
  });

  it("returns SPRING for April", () => {
    const result = currentAniListSeason(new Date(2025, 3, 15));
    expect(result.season).toBe("SPRING");
    expect(result.year).toBe(2025);
  });

  it("returns SPRING for May", () => {
    const result = currentAniListSeason(new Date(2025, 4, 15));
    expect(result.season).toBe("SPRING");
  });

  it("returns SPRING for June", () => {
    const result = currentAniListSeason(new Date(2025, 5, 15));
    expect(result.season).toBe("SPRING");
  });

  it("returns SUMMER for July", () => {
    const result = currentAniListSeason(new Date(2025, 6, 15));
    expect(result.season).toBe("SUMMER");
    expect(result.year).toBe(2025);
  });

  it("returns SUMMER for August", () => {
    const result = currentAniListSeason(new Date(2025, 7, 15));
    expect(result.season).toBe("SUMMER");
  });

  it("returns SUMMER for September", () => {
    const result = currentAniListSeason(new Date(2025, 8, 15));
    expect(result.season).toBe("SUMMER");
  });

  it("returns FALL for October", () => {
    const result = currentAniListSeason(new Date(2025, 9, 15));
    expect(result.season).toBe("FALL");
    expect(result.year).toBe(2025);
  });

  it("returns FALL for November", () => {
    const result = currentAniListSeason(new Date(2025, 10, 15));
    expect(result.season).toBe("FALL");
  });

  it("returns FALL for December", () => {
    const result = currentAniListSeason(new Date(2025, 11, 15));
    expect(result.season).toBe("FALL");
  });
});

describe("GraphQL query strings", () => {
  it("QUERY_MEDIA_DETAILS contains the MediaDetails fragment + id variable", () => {
    expect(QUERY_MEDIA_DETAILS).toContain("fragment MediaDetails on Media");
    expect(QUERY_MEDIA_DETAILS).toContain("$id: Int!");
    expect(QUERY_MEDIA_DETAILS).toContain("Media(id: $id");
  });

  it("QUERY_TRENDING uses TRENDING_DESC sort", () => {
    expect(QUERY_TRENDING).toContain("sort: TRENDING_DESC");
    expect(QUERY_TRENDING).toContain("type: ANIME");
    expect(QUERY_TRENDING).toContain("isAdult: false");
  });

  it("QUERY_SEASONAL accepts season + year variables", () => {
    expect(QUERY_SEASONAL).toContain("$season: MediaSeason!");
    expect(QUERY_SEASONAL).toContain("$year: Int");
    expect(QUERY_SEASONAL).toContain("season: $season");
    expect(QUERY_SEASONAL).toContain("seasonYear: $year");
  });

  it("QUERY_SEARCH accepts a search variable", () => {
    expect(QUERY_SEARCH).toContain("$search: String!");
    expect(QUERY_SEARCH).toContain("search: $search");
  });

  it("all list queries use Page with pageInfo", () => {
    [QUERY_TRENDING, QUERY_SEASONAL, QUERY_SEARCH].forEach((q) => {
      expect(q).toContain("Page(");
      expect(q).toContain("pageInfo { total currentPage lastPage perPage hasNextPage }");
    });
  });
});
