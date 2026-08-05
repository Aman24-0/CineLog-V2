// src/features/sync/backup/__tests__/normalizeBackup.test.ts
//
// Unit tests for the universal backup normalization layer.
// Covers: format detection, item extraction, field mapping, status /
// rating / date normalization, validation, and the batch pipeline.

import { describe, it, expect } from "vitest";
import {
  detectBackupFormat,
  extractRawItems,
  normalizeStatus,
  normalizeRating,
  normalizeDate,
  normalizeProgress,
  normalizeWatchlistItem,
  normalizeBatch,
  validateItem,
  wasRepaired,
  type BackupFormat
} from "../normalizeBackup";

// ---------------------------------------------------------------------------
// detectBackupFormat
// ---------------------------------------------------------------------------

describe("detectBackupFormat", () => {
  it("detects a flat array as 'flat-array'", () => {
    expect(detectBackupFormat([{ id: 1 }, { id: 2 }])).toBe("flat-array");
  });

  it("detects an empty array as 'flat-array'", () => {
    expect(detectBackupFormat([])).toBe("flat-array");
  });

  it("detects V2 wrapped format { version, library: { watchlist: [] } }", () => {
    const doc = {
      version: 1,
      library: { watchlist: [] }
    };
    expect(detectBackupFormat(doc)).toBe("wrapped-v2");
  });

  it("detects { data: [...] } as 'wrapper-data'", () => {
    expect(detectBackupFormat({ data: [{ id: 1 }] })).toBe("wrapper-data");
  });

  it("detects { items: [...] } as 'wrapper-items'", () => {
    expect(detectBackupFormat({ items: [{ id: 1 }] })).toBe("wrapper-items");
  });

  it("detects { watchlist: [...] } as 'wrapper-watchlist'", () => {
    expect(detectBackupFormat({ watchlist: [{ id: 1 }] })).toBe(
      "wrapper-watchlist"
    );
  });

  it("detects { vault: [...] } as 'wrapper-vault'", () => {
    expect(detectBackupFormat({ vault: [{ id: 1 }] })).toBe("wrapper-vault");
  });

  it("detects { movies: [...] } as 'wrapper-movies'", () => {
    expect(detectBackupFormat({ movies: [{ id: 1 }] })).toBe("wrapper-movies");
  });

  it("returns 'unknown' for non-array, non-object input", () => {
    expect(detectBackupFormat(null)).toBe("unknown");
    expect(detectBackupFormat(undefined)).toBe("unknown");
    expect(detectBackupFormat("string")).toBe("unknown");
    expect(detectBackupFormat(42)).toBe("unknown");
  });

  it("returns 'unknown' for an object with no known array wrapper key", () => {
    expect(detectBackupFormat({ foo: "bar" })).toBe("unknown");
  });

  it("treats { library: { items: [...] } } as 'wrapped-v2'", () => {
    // The fallback "library is an object with a nested array" branch.
    const doc = { library: { items: [{ id: 1 }] } };
    expect(detectBackupFormat(doc)).toBe("wrapped-v2");
  });
});

// ---------------------------------------------------------------------------
// extractRawItems
// ---------------------------------------------------------------------------

describe("extractRawItems", () => {
  it("returns the array for 'flat-array' format", () => {
    const items = [{ id: 1 }, { id: 2 }];
    expect(extractRawItems(items, "flat-array")).toEqual(items);
  });

  it("returns library.watchlist for 'wrapped-v2' format", () => {
    const doc = {
      version: 1,
      library: { watchlist: [{ id: 1 }] }
    };
    expect(extractRawItems(doc, "wrapped-v2")).toEqual([{ id: 1 }]);
  });

  it("returns [] when wrapped-v2 library.watchlist is missing", () => {
    expect(extractRawItems({ version: 1, library: {} }, "wrapped-v2")).toEqual(
      []
    );
  });

  it("extracts from generic wrapper formats via key scan", () => {
    expect(
      extractRawItems({ data: [{ id: 1 }] }, "wrapper-data" as BackupFormat)
    ).toEqual([{ id: 1 }]);
    expect(
      extractRawItems({ items: [{ id: 2 }] }, "wrapper-items" as BackupFormat)
    ).toEqual([{ id: 2 }]);
  });

  it("returns [] for non-object input on wrapper formats", () => {
    expect(extractRawItems(null, "wrapper-data")).toEqual([]);
    expect(extractRawItems(undefined, "wrapper-data")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// normalizeStatus
// ---------------------------------------------------------------------------

describe("normalizeStatus", () => {
  it("passes through canonical V2 statuses unchanged", () => {
    expect(normalizeStatus("Planned")).toBe("Planned");
    expect(normalizeStatus("Watching")).toBe("Watching");
    expect(normalizeStatus("Completed")).toBe("Completed");
    expect(normalizeStatus("Dropped")).toBe("Dropped");
    expect(normalizeStatus("Plan to Watch")).toBe("Plan to Watch");
  });

  it("maps lowercase canonical strings to Title Case", () => {
    expect(normalizeStatus("planned")).toBe("Planned");
    expect(normalizeStatus("watching")).toBe("Watching");
    expect(normalizeStatus("completed")).toBe("Completed");
    expect(normalizeStatus("dropped")).toBe("Dropped");
  });

  it("maps 'plantowatch' / 'plan to watch' variants to 'Plan to Watch'", () => {
    expect(normalizeStatus("plantowatch")).toBe("Plan to Watch");
    expect(normalizeStatus("plan to watch")).toBe("Plan to Watch");
    expect(normalizeStatus("Plan to Watch")).toBe("Plan to Watch");
  });

  it("maps common synonyms to their canonical equivalents", () => {
    expect(normalizeStatus("watched")).toBe("Completed");
    expect(normalizeStatus("finished")).toBe("Completed");
    expect(normalizeStatus("done")).toBe("Completed");
    expect(normalizeStatus("paused")).toBe("Plan to Watch");
    expect(normalizeStatus("onhold")).toBe("Plan to Watch");
    expect(normalizeStatus("on-hold")).toBe("Plan to Watch");
    expect(normalizeStatus("abandoned")).toBe("Dropped");
    expect(normalizeStatus("skipped")).toBe("Dropped");
    expect(normalizeStatus("none")).toBe("Planned");
  });

  it("defaults to 'Planned' on unknown / non-string input", () => {
    expect(normalizeStatus("totally-bogus")).toBe("Planned");
    expect(normalizeStatus(null)).toBe("Planned");
    expect(normalizeStatus(undefined)).toBe("Planned");
    expect(normalizeStatus(42)).toBe("Planned");
    expect(normalizeStatus("")).toBe("Planned");
  });

  it("trims whitespace before lookup", () => {
    expect(normalizeStatus("  Watching  ")).toBe("Watching");
    expect(normalizeStatus("  completed  ")).toBe("Completed");
  });
});

// ---------------------------------------------------------------------------
// normalizeRating
// ---------------------------------------------------------------------------

describe("normalizeRating", () => {
  it("returns undefined for null / undefined / NaN / negative", () => {
    expect(normalizeRating(null)).toBeUndefined();
    expect(normalizeRating(undefined)).toBeUndefined();
    expect(normalizeRating(NaN)).toBeUndefined();
    expect(normalizeRating(-1)).toBeUndefined();
  });

  it("returns undefined for 0 (means 'no rating' in V1)", () => {
    expect(normalizeRating(0)).toBeUndefined();
  });

  it("passes through integers 1-10 unchanged (V1 0-10 scale)", () => {
    expect(normalizeRating(1)).toBe(1);
    expect(normalizeRating(5)).toBe(5);
    expect(normalizeRating(10)).toBe(10);
  });

  it("passes through decimals 0-10 unchanged", () => {
    expect(normalizeRating(8.5)).toBe(8.5);
    expect(normalizeRating(7.2)).toBe(7.2);
  });

  it("scales numbers > 10 down by /10 (treats them as percentages)", () => {
    // 85 → 8.5, 100 → 10, 50 → 5
    expect(normalizeRating(85)).toBe(8.5);
    expect(normalizeRating(100)).toBe(10);
    expect(normalizeRating(50)).toBe(5);
  });

  it("parses '8.5/10' slash format and scales to /10", () => {
    expect(normalizeRating("8.5/10")).toBe(8.5);
    expect(normalizeRating("4/5")).toBe(8);
    expect(normalizeRating("5/5")).toBe(10);
    expect(normalizeRating("3/10")).toBe(3);
  });

  it("parses '85%' percentage format and scales to /10", () => {
    expect(normalizeRating("85%")).toBe(8.5);
    expect(normalizeRating("100%")).toBe(10);
    expect(normalizeRating("50%")).toBe(5);
  });

  it("parses plain numeric strings via recursion", () => {
    expect(normalizeRating("7")).toBe(7);
    expect(normalizeRating("8.5")).toBe(8.5);
    expect(normalizeRating("85")).toBe(8.5); // treated as number → percentage
  });

  it("returns undefined for non-numeric strings", () => {
    expect(normalizeRating("not a number")).toBeUndefined();
    expect(normalizeRating("")).toBeUndefined();
    expect(normalizeRating("   ")).toBeUndefined();
  });

  it("does NOT double 1-5 integer ratings (V1 compatibility fix)", () => {
    // Regression test for the old heuristic that doubled 1-5 → 2-10.
    // A V1 rating of `4` (4/10) MUST stay 4, not become 8.
    expect(normalizeRating(4)).toBe(4);
    expect(normalizeRating(3)).toBe(3);
    expect(normalizeRating(5)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// normalizeDate
// ---------------------------------------------------------------------------

describe("normalizeDate", () => {
  it("returns undefined for null / undefined / empty string", () => {
    expect(normalizeDate(null)).toBeUndefined();
    expect(normalizeDate(undefined)).toBeUndefined();
    expect(normalizeDate("")).toBeUndefined();
  });

  it("passes ISO strings through (parsed + re-stringified for safety)", () => {
    const iso = "2026-07-07T16:49:38.329Z";
    expect(normalizeDate(iso)).toBe(new Date(iso).toISOString());
  });

  it("converts Firestore Timestamp { seconds, nanoseconds } to ISO", () => {
    const ts = { seconds: 1700000000, nanoseconds: 0 };
    const expected = new Date(1700000000 * 1000).toISOString();
    expect(normalizeDate(ts)).toBe(expected);
  });

  it("converts Date objects to ISO", () => {
    const d = new Date("2026-01-15T00:00:00.000Z");
    expect(normalizeDate(d)).toBe(d.toISOString());
  });

  it("returns undefined for invalid Date objects", () => {
    const invalid = new Date("not-a-date");
    expect(normalizeDate(invalid)).toBeUndefined();
  });

  it("converts Unix seconds (number < 1e12) to ISO", () => {
    const seconds = 1700000000;
    const expected = new Date(seconds * 1000).toISOString();
    expect(normalizeDate(seconds)).toBe(expected);
  });

  it("converts Unix milliseconds (number > 1e12) to ISO", () => {
    const ms = 1700000000000;
    const expected = new Date(ms).toISOString();
    expect(normalizeDate(ms)).toBe(expected);
  });

  it("parses numeric strings as Unix timestamps", () => {
    const seconds = "1700000000";
    const expected = new Date(Number(seconds) * 1000).toISOString();
    expect(normalizeDate(seconds)).toBe(expected);
  });

  it("returns undefined for unparseable date strings", () => {
    expect(normalizeDate("totally-not-a-date")).toBeUndefined();
  });

  it("returns undefined for unsupported types (boolean, object without seconds)", () => {
    expect(normalizeDate(true)).toBeUndefined();
    expect(normalizeDate({ foo: "bar" })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeProgress
// ---------------------------------------------------------------------------

describe("normalizeProgress", () => {
  it("returns DEFAULT_PROGRESS for null / undefined / non-object", () => {
    const p1 = normalizeProgress(null);
    const p2 = normalizeProgress(undefined);
    const p3 = normalizeProgress("not-an-object");
    expect(p1.season).toBe(1);
    expect(p1.episode).toBe(1);
    expect(p1.currentTime).toBe(0);
    expect(p2.season).toBe(1);
    expect(p3.season).toBe(1);
  });

  it("preserves numeric fields from the input", () => {
    const p = normalizeProgress({
      currentTime: 120.5,
      duration: 240,
      season: 3,
      episode: 7,
      server: "https://example.com"
    });
    expect(p.currentTime).toBe(120.5);
    expect(p.duration).toBe(240);
    expect(p.season).toBe(3);
    expect(p.episode).toBe(7);
    expect(p.server).toBe("https://example.com");
  });

  it("falls back to defaults for missing numeric fields", () => {
    const p = normalizeProgress({});
    expect(p.currentTime).toBe(0);
    expect(p.duration).toBe(0);
    expect(p.season).toBe(1);
    expect(p.episode).toBe(1);
    expect(p.server).toBeNull();
  });

  it("coerces invalid server values to null", () => {
    const p = normalizeProgress({ server: 42 });
    expect(p.server).toBeNull();
  });

  it("preserves updatedAt when it's a valid date", () => {
    const p = normalizeProgress({ updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(p.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("falls back to current time when updatedAt is invalid", () => {
    const p = normalizeProgress({ updatedAt: "not-a-date" });
    // Should be a valid ISO string (the fallback to new Date().toISOString()).
    // updatedAt is `string` per the WatchProgress type, but assert non-null
    // since we know the fallback always sets it.
    expect(() => new Date(p.updatedAt as string).getTime()).not.toBeNaN();
  });
});

// ---------------------------------------------------------------------------
// normalizeWatchlistItem
// ---------------------------------------------------------------------------

describe("normalizeWatchlistItem", () => {
  it("returns null for non-object input", () => {
    expect(normalizeWatchlistItem(null)).toBeNull();
    expect(normalizeWatchlistItem(undefined)).toBeNull();
    expect(normalizeWatchlistItem("string")).toBeNull();
    expect(normalizeWatchlistItem(42)).toBeNull();
  });

  it("returns null when id is missing", () => {
    const result = normalizeWatchlistItem({
      media_type: "movie",
      title: "No ID"
    });
    expect(result).toBeNull();
  });

  it("returns null when media_type is missing or invalid", () => {
    expect(
      normalizeWatchlistItem({ id: "1", title: "No Type" })
    ).toBeNull();
    expect(
      normalizeWatchlistItem({
        id: "1",
        media_type: "invalid-type",
        title: "Bad Type"
      })
    ).toBeNull();
  });

  it("normalizes a minimal valid V2 item", () => {
    const result = normalizeWatchlistItem({
      id: 12345,
      media_type: "movie",
      title: "Test Movie",
      status: "Watching"
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("12345");
    expect(result!.media_type).toBe("movie");
    expect(result!.title).toBe("Test Movie");
    expect(result!.status).toBe("Watching");
    expect(result!.notes).toBe("");
    expect(result!.genresList).toEqual([]);
    expect(result!.platformsList).toEqual([]);
  });

  it("maps legacy field names (tmdb_id, mediaType, watchStatus) to canonical", () => {
    const result = normalizeWatchlistItem({
      tmdb_id: 999,
      mediaType: "tv",
      watchStatus: "completed",
      titleName: "Legacy Show"
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("999");
    expect(result!.media_type).toBe("tv");
    expect(result!.status).toBe("Completed");
  });

  it("accepts 'series' / 'film' as media_type aliases", () => {
    expect(
      normalizeWatchlistItem({ id: 1, media_type: "series" })!.media_type
    ).toBe("tv");
    expect(
      normalizeWatchlistItem({ id: 1, media_type: "film" })!.media_type
    ).toBe("movie");
    expect(
      normalizeWatchlistItem({ id: 1, type: "show" })!.media_type
    ).toBe("tv");
    expect(
      normalizeWatchlistItem({ id: 1, type: "television" })!.media_type
    ).toBe("tv");
  });

  it("preserves optional fields when present (rating, notes, poster_path)", () => {
    const result = normalizeWatchlistItem({
      id: "1",
      media_type: "movie",
      rating: 8.5,
      notes: "Great film",
      poster_path: "/abc.jpg",
      backdrop_path: "/def.jpg",
      release_date: "2026-01-15"
    });
    expect(result!.rating).toBe(8.5);
    expect(result!.notes).toBe("Great film");
    expect(result!.poster_path).toBe("/abc.jpg");
    expect(result!.backdrop_path).toBe("/def.jpg");
    expect(result!.release_date).toBeDefined();
  });

  it("preserves series per-season rewatch fields from V2 backups", () => {
    const result = normalizeWatchlistItem({
      id: "1",
      media_type: "tv",
      rewatchCount: 2,
      rewatchDates: ["2026-01-01", "2026-02-01", "2026-03-01"],
      seasonDates: { "1": { start: "2026-01-01", end: "2026-01-15" } },
      seasonRewatchCount: 1,
      seasonRewatchDates: [{ "1": { start: "2026-03-01", end: "2026-03-15" } }]
    });
    expect(result!.rewatchCount).toBe(2);
    expect(result!.rewatchDates).toHaveLength(3);
    expect(result!.seasonDates).toEqual({
      "1": { start: "2026-01-01", end: "2026-01-15" }
    });
    expect(result!.seasonRewatchCount).toBe(1);
    expect(result!.seasonRewatchDates).toHaveLength(1);
  });

  it("defaults missing numeric fields (runtime, totalEps) to undefined", () => {
    const result = normalizeWatchlistItem({
      id: "1",
      media_type: "movie"
    });
    expect(result!.runtime).toBeUndefined();
    expect(result!.totalEps).toBeUndefined();
    expect(result!.season).toBeUndefined();
    expect(result!.episode).toBeUndefined();
  });

  it("filters non-string entries from array fields (genresList, castList)", () => {
    const result = normalizeWatchlistItem({
      id: "1",
      media_type: "movie",
      genresList: ["Action", 42, "", "Drama", null],
      castList: ["Actor 1", "Actor 2"]
    });
    expect(result!.genresList).toEqual(["Action", "Drama"]);
    expect(result!.castList).toEqual(["Actor 1", "Actor 2"]);
  });

  it("does not throw on malformed input — returns null instead", () => {
    // Object.defineProperty trickery to make JSON access throw.
    const bad: Record<string, unknown> = {};
    Object.defineProperty(bad, "id", {
      get() {
        throw new Error("boom");
      },
      enumerable: true
    });
    expect(() => normalizeWatchlistItem(bad)).not.toThrow();
    expect(normalizeWatchlistItem(bad)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateItem
// ---------------------------------------------------------------------------

describe("validateItem", () => {
  it("returns null for a valid WatchlistItem", () => {
    const valid = normalizeWatchlistItem({
      id: "1",
      media_type: "movie",
      status: "Planned"
    });
    expect(validateItem(valid)).toBeNull();
  });

  it("returns a reason for null items (normalization failure)", () => {
    expect(validateItem(null)).toEqual({ reason: "Normalization failed" });
  });

  it("returns a reason for missing id", () => {
    const item = {
      id: "",
      media_type: "movie" as const,
      status: "Planned" as const,
      addedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      notes: "",
      genresList: [],
      platformsList: []
    };
    expect(validateItem(item)).toEqual({ reason: "Missing TMDB ID" });
  });

  it("returns a reason for invalid media_type", () => {
    const item = {
      id: "1",
      media_type: "book" as never,
      status: "Planned" as const,
      addedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      notes: "",
      genresList: [],
      platformsList: []
    };
    expect(validateItem(item)).toEqual({ reason: "Invalid media type" });
  });

  it("returns a reason for invalid status", () => {
    const item = {
      id: "1",
      media_type: "movie" as const,
      status: "BogusStatus" as never,
      addedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      notes: "",
      genresList: [],
      platformsList: []
    };
    expect(validateItem(item)).toEqual({ reason: "Invalid status" });
  });
});

// ---------------------------------------------------------------------------
// wasRepaired
// ---------------------------------------------------------------------------

describe("wasRepaired", () => {
  it("returns true when updatedAt is missing", () => {
    expect(wasRepaired({ id: "1", media_type: "movie" })).toBe(true);
  });

  it("returns true when genresList is missing", () => {
    expect(wasRepaired({ id: "1", updatedAt: "2026-01-01" })).toBe(true);
  });

  it("returns true when platformsList is missing", () => {
    expect(
      wasRepaired({
        id: "1",
        updatedAt: "2026-01-01",
        genresList: []
      })
    ).toBe(true);
  });

  it("returns true when notes is missing", () => {
    expect(
      wasRepaired({
        id: "1",
        updatedAt: "2026-01-01",
        genresList: [],
        platformsList: []
      })
    ).toBe(true);
  });

  it("returns true when id is numeric (will be repaired to string)", () => {
    expect(
      wasRepaired({
        id: 123,
        updatedAt: "2026-01-01",
        genresList: [],
        platformsList: [],
        notes: ""
      })
    ).toBe(true);
  });

  it("returns true when status is a non-canonical string", () => {
    expect(
      wasRepaired({
        id: "1",
        status: "totally-bogus",
        updatedAt: "2026-01-01",
        genresList: [],
        platformsList: [],
        notes: ""
      })
    ).toBe(true);
  });

  it("returns false for a fully-formed item with no repairs needed", () => {
    expect(
      wasRepaired({
        id: "1",
        status: "Planned",
        updatedAt: "2026-01-01",
        genresList: [],
        platformsList: [],
        notes: ""
      })
    ).toBe(false);
  });

  it("returns false for non-object input", () => {
    expect(wasRepaired(null)).toBe(false);
    expect(wasRepaired(undefined)).toBe(false);
    expect(wasRepaired("string")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeBatch (full pipeline)
// ---------------------------------------------------------------------------

describe("normalizeBatch", () => {
  it("returns empty arrays + zero counts for empty input", () => {
    const result = normalizeBatch([]);
    expect(result.items).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.repairedCount).toBe(0);
  });

  it("normalizes valid items and reports repaired count", () => {
    const raw = [
      // Repaired: missing updatedAt, genresList, platformsList, notes.
      { id: 1, media_type: "movie", title: "A" },
      // Fully formed — no repairs needed.
      {
        id: "2",
        media_type: "tv",
        title: "B",
        status: "Watching",
        updatedAt: "2026-01-01",
        genresList: [],
        platformsList: [],
        notes: ""
      }
    ];
    const result = normalizeBatch(raw);
    expect(result.items).toHaveLength(2);
    expect(result.failures).toHaveLength(0);
    expect(result.repairedCount).toBe(1);
  });

  it("collects failures for items missing id or media_type", () => {
    const raw = [
      { id: "1", media_type: "movie" }, // valid
      { id: "2" }, // missing media_type → normalize returns null → failure
      { media_type: "movie" }, // missing id → normalize returns null → failure
      { id: "3", media_type: "invalid" } // bad media_type → null → failure
    ];
    const result = normalizeBatch(raw);
    expect(result.items).toHaveLength(1);
    expect(result.failures).toHaveLength(3);
    // All three failures come back as "Normalization failed" because the
    // normalizer returns null for missing id / media_type / invalid type —
    // validateItem only runs AFTER normalize, so it sees null and reports
    // "Normalization failed".
    for (const failure of result.failures) {
      expect(failure.reason).toBe("Normalization failed");
    }
  });

  it("counts repairs across multiple items", () => {
    const raw = [
      { id: 1, media_type: "movie" },
      { id: 2, media_type: "tv" },
      { id: 3, media_type: "movie" }
    ];
    const result = normalizeBatch(raw);
    expect(result.items).toHaveLength(3);
    expect(result.repairedCount).toBe(3);
  });

  it("preserves the raw item in the failure entry for debugging", () => {
    const raw = [{ media_type: "movie" }];
    const result = normalizeBatch(raw);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].item).toEqual({ media_type: "movie" });
  });
});
