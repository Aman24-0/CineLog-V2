// src/shared/utils/__tests__/vaultMatch.test.ts
import { describe, it, expect } from "vitest";
import {
  findInVault,
  isInVault,
  vaultIdKey,
  buildVaultKeySet,
} from "../vaultMatch";
import { makeMovie, makeTVSeries, makeWatchlistItem } from "~/__test-fixtures__/factories";

describe("findInVault", () => {
  it("returns null for null title", () => {
    expect(findInVault([], null)).toBeNull();
  });

  it("returns null for undefined title", () => {
    expect(findInVault([], undefined)).toBeNull();
  });

  it("returns null when vault is empty", () => {
    expect(findInVault([], { id: "1", media_type: "movie" })).toBeNull();
  });

  it("finds a matching item by id + media_type", () => {
    const vault = [
      makeMovie({ id: "1", title: "Inception" }),
      makeTVSeries({ id: "2", name: "Breaking Bad" }),
    ];
    const result = findInVault(vault, { id: "1", media_type: "movie" });
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Inception");
  });

  it("does NOT match across media_type namespaces (movie/1398 != tv/1398)", () => {
    const vault = [
      makeTVSeries({ id: "1398", name: "The Sopranos" }),
    ];
    const result = findInVault(vault, { id: "1398", media_type: "movie" });
    expect(result).toBeNull();
  });

  it("finds tv series by id + media_type", () => {
    const vault = [
      makeMovie({ id: "1398", title: "Stalker" }),
      makeTVSeries({ id: "1398", name: "The Sopranos" }),
    ];
    const result = findInVault(vault, { id: "1398", media_type: "tv" });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("The Sopranos");
  });

  it("accepts numeric id", () => {
    const vault = [makeMovie({ id: "42", title: "Hitchhiker's Guide" })];
    const result = findInVault(vault, { id: 42, media_type: "movie" });
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Hitchhiker's Guide");
  });

  it("accepts a full WatchlistItem as the title arg", () => {
    const vault = [makeMovie({ id: "1", title: "Movie A" })];
    const searchItem = makeMovie({ id: "1", title: "Movie A" });
    const result = findInVault(vault, searchItem);
    expect(result).not.toBeNull();
  });
});

describe("isInVault", () => {
  it("returns false for empty vault", () => {
    expect(isInVault([], { id: "1", media_type: "movie" })).toBe(false);
  });

  it("returns true when found", () => {
    const vault = [makeMovie({ id: "1" })];
    expect(isInVault(vault, { id: "1", media_type: "movie" })).toBe(true);
  });

  it("returns false when not found", () => {
    const vault = [makeMovie({ id: "1" })];
    expect(isInVault(vault, { id: "2", media_type: "movie" })).toBe(false);
  });

  it("returns false for null title", () => {
    expect(isInVault([makeMovie({ id: "1" })], null)).toBe(false);
  });
});

describe("vaultIdKey", () => {
  it("returns null for null title", () => {
    expect(vaultIdKey(null)).toBeNull();
  });

  it("returns null for undefined title", () => {
    expect(vaultIdKey(undefined)).toBeNull();
  });

  it("returns 'movie/{id}' for movies", () => {
    expect(vaultIdKey({ id: "1398", media_type: "movie" })).toBe("movie/1398");
  });

  it("returns 'tv/{id}' for TV", () => {
    expect(vaultIdKey({ id: "1398", media_type: "tv" })).toBe("tv/1398");
  });

  it("handles numeric id", () => {
    expect(vaultIdKey({ id: 42, media_type: "movie" })).toBe("movie/42");
  });

  it("produces different keys for same id + different media_type", () => {
    expect(vaultIdKey({ id: "1398", media_type: "movie" })).not.toBe(
      vaultIdKey({ id: "1398", media_type: "tv" }),
    );
  });
});

describe("buildVaultKeySet", () => {
  it("returns empty set for empty vault", () => {
    expect(buildVaultKeySet([]).size).toBe(0);
  });

  it("builds a set of composite keys", () => {
    const vault = [
      makeMovie({ id: "1" }),
      makeTVSeries({ id: "2" }),
      makeMovie({ id: "3" }),
    ];
    const set = buildVaultKeySet(vault);
    expect(set.size).toBe(3);
    expect(set.has("movie/1")).toBe(true);
    expect(set.has("tv/2")).toBe(true);
    expect(set.has("movie/3")).toBe(true);
  });

  it("allows same id across different media_types (no collision)", () => {
    const vault = [
      makeMovie({ id: "1398" }),
      makeTVSeries({ id: "1398" }),
    ];
    const set = buildVaultKeySet(vault);
    expect(set.size).toBe(2);
    expect(set.has("movie/1398")).toBe(true);
    expect(set.has("tv/1398")).toBe(true);
  });
});
