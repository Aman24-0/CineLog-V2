// src/core/preferences/__tests__/streamingProviders.test.ts
import { describe, it, expect } from "vitest";
import { mergeAndSortProviders } from "../streamingProviders";

/**
 * Raw row shape matching what getWatchProviderList / getWatchProviderListTv
 * return (providerId, providerName, logoPath, displayPriority).
 */
interface Row {
  providerId: number;
  providerName: string;
  logoPath: string | null;
  displayPriority: number;
}

const mkRow = (
  id: number,
  name: string,
  priority: number,
  logo: string | null = `/logo${id}.png`
): Row => ({
  providerId: id,
  providerName: name,
  logoPath: logo,
  displayPriority: priority
});

describe("mergeAndSortProviders", () => {
  it("returns an empty array when both lists are empty", () => {
    expect(mergeAndSortProviders([], [])).toEqual([]);
  });

  it("returns the movie list as-is when the TV list is empty", () => {
    const movies = [
      mkRow(8, "Netflix", 0),
      mkRow(119, "Amazon Prime Video", 1)
    ];
    const result = mergeAndSortProviders(movies, []);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("8");
    expect(result[1].id).toBe("119");
  });

  it("returns the TV list as-is when the movie list is empty", () => {
    const tv = [mkRow(8, "Netflix", 0), mkRow(232, "Zee5", 5)];
    const result = mergeAndSortProviders([], tv);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toEqual(["8", "232"]);
  });

  it("deduplicates by provider_id — a provider in both lists appears once", () => {
    // Netflix (8) appears in BOTH lists — should appear once in the result.
    // The movie list's logo wins (it's processed first).
    const movies = [mkRow(8, "Netflix", 0, "/netflix_movie.png")];
    const tv = [mkRow(8, "Netflix", 0, "/netflix_tv.png")];
    const result = mergeAndSortProviders(movies, tv);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("8");
    expect(result[0].name).toBe("Netflix");
    // Movie list's logo wins because it's processed first.
    expect(result[0].logoPath).toBe("/netflix_movie.png");
  });

  it("merges providers that appear in only one list", () => {
    const movies = [mkRow(8, "Netflix", 0)];
    const tv = [mkRow(232, "Zee5", 5), mkRow(237, "Sony LIV", 6)];
    const result = mergeAndSortProviders(movies, tv);
    expect(result).toHaveLength(3);
    const ids = result.map((p) => p.id);
    expect(ids).toContain("8");
    expect(ids).toContain("232");
    expect(ids).toContain("237");
  });

  it("sorts by display_priority ascending (most popular first)", () => {
    // Deliberately pass them out of priority order.
    const movies = [
      mkRow(232, "Zee5", 5),
      mkRow(8, "Netflix", 0),
      mkRow(119, "Amazon Prime Video", 1)
    ];
    const result = mergeAndSortProviders(movies, []);
    expect(result.map((p) => p.id)).toEqual(["8", "119", "232"]);
  });

  it("sorts the merged movie+TV list by display_priority", () => {
    const movies = [mkRow(232, "Zee5", 5), mkRow(8, "Netflix", 0)];
    const tv = [
      mkRow(237, "Sony LIV", 6),
      mkRow(119, "Amazon Prime Video", 1),
      mkRow(350, "Apple TV+", 3)
    ];
    const result = mergeAndSortProviders(movies, tv);
    // Sorted: Netflix(0), Prime(1), Apple(3), Zee5(5), Sony(6)
    expect(result.map((p) => p.id)).toEqual(["8", "119", "350", "232", "237"]);
  });

  it("normalizes provider_id to a string", () => {
    const movies = [mkRow(8, "Netflix", 0)];
    const result = mergeAndSortProviders(movies, []);
    expect(typeof result[0].id).toBe("string");
    expect(result[0].id).toBe("8");
  });

  it("preserves null logoPath", () => {
    const movies = [mkRow(999, "Unknown Provider", 10, null)];
    const result = mergeAndSortProviders(movies, []);
    expect(result[0].logoPath).toBeNull();
  });

  it("does not alias-merge providers — each TMDB id is a distinct entry", () => {
    // JioCinema (122) and Hotstar (220) are separate TMDB providers.
    // They should NOT be merged into a single "JioStar" entry — each
    // appears as its own row in the result.
    const movies = [mkRow(122, "JioCinema", 2), mkRow(220, "Hotstar", 3)];
    const result = mergeAndSortProviders(movies, []);
    expect(result).toHaveLength(2);
    const ids = result.map((p) => p.id);
    expect(ids).toContain("122");
    expect(ids).toContain("220");
  });

  it("handles large lists with many providers", () => {
    const movies = Array.from({ length: 50 }, (_, i) =>
      mkRow(1000 + i, `Provider ${i}`, i)
    );
    const tv = Array.from({ length: 30 }, (_, i) =>
      mkRow(2000 + i, `TV Provider ${i}`, i)
    );
    const result = mergeAndSortProviders(movies, tv);
    // 50 movie + 30 TV = 80 unique providers (no overlap).
    expect(result).toHaveLength(80);
    // Sorted by display_priority — first entries have priority 0.
    expect(result[0].displayPriority).toBe(0);
  });

  it("returns a new array (does not mutate inputs)", () => {
    const movies = [mkRow(8, "Netflix", 0)];
    const tv = [mkRow(232, "Zee5", 5)];
    const result = mergeAndSortProviders(movies, tv);
    // The result is a new array, not the input reference.
    expect(result).not.toBe(movies);
    expect(result).not.toBe(tv);
    // Inputs are unchanged.
    expect(movies).toHaveLength(1);
    expect(tv).toHaveLength(1);
  });
});
