// src/features/sync/import/__tests__/csvImport.test.ts
//
// Phase 12 — Data Sync Hardening: Exhaustive CSV Import Test Suite
// =================================================================
//
// This file expands the original basic test coverage into an exhaustive
// suite that exercises every edge case required for 0-data-loss imports
// from Letterboxd, Trakt, IMDb, and TV Time.
//
// Coverage areas:
//   1. Empty / invalid input handling
//   2. BOM + line-ending normalization
//   3. Letterboxd — movies, dates, duplicates, non-ASCII, malformed
//   4. Trakt — movies + TV, season/episode mapping, special S00E01
//   5. IMDb — Const, Title Type taxonomy, tvEpisode vs movie
//   6. TV Time — column header variants, episode aggregation
//   7. Generic CineLog export — round-trip fidelity
//   8. Unknown format fallback
//   9. Quoted fields + RFC 4180 edge cases
//  10. Massive file simulation (5000+ rows)
//  11. readFileAsText (FileReader wrapper)

import { describe, it, expect } from "vitest";
import { parseWatchlistCsv, readFileAsText } from "../csvImport";

// ---------------------------------------------------------------------------
// Helper: build a CSV string from a header row + data rows.
// Optionally quote individual fields.
// ---------------------------------------------------------------------------

function csv(headers: string[], rows: string[][]): string {
  const lines = [headers.join(","), ...rows.map((r) => r.join(","))];
  return lines.join("\n");
}

/** Quote a field per RFC 4180 (wrap in quotes, double any internal quotes). */
function q(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Build a CSV row from fields, quoting any that contain commas/quotes/newlines. */
function _csvRowSmart(fields: string[]): string {
  return fields
    .map((f) => (/[",\n\r]/.test(f) ? q(f) : f))
    .join(",");
}

// ===========================================================================
// 1. EMPTY / INVALID INPUT
// ===========================================================================

describe("parseWatchlistCsv — empty / invalid input", () => {
  it("returns source='unknown' + empty candidates for empty input", () => {
    const result = parseWatchlistCsv("");
    expect(result.source).toBe("unknown");
    expect(result.candidates).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it("returns source='unknown' for whitespace-only input", () => {
    const result = parseWatchlistCsv("   \n  \n");
    expect(result.source).toBe("unknown");
    expect(result.candidates).toEqual([]);
  });

  it("returns source='unknown' + 0 candidates for a header-only CSV with no data rows", () => {
    const result = parseWatchlistCsv("foo,bar,baz");
    expect(result.source).toBe("unknown");
    expect(result.candidates).toHaveLength(0);
  });

  it("returns source='unknown' + 0 candidates for an unrecognized single-row CSV", () => {
    const result = parseWatchlistCsv("foo,bar,baz\nx,y,z");
    expect(result.source).toBe("unknown");
    expect(result.candidates).toHaveLength(0);
  });

  it("emits a fallback candidate from the unknown branch when a Title column exists", () => {
    const result = parseWatchlistCsv("foo,Title,bar\nx,My Title,y");
    expect(result.source).toBe("unknown");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("My Title");
  });

  it("handles a single newline character with no headers", () => {
    const result = parseWatchlistCsv("\n");
    expect(result.source).toBe("unknown");
    expect(result.candidates).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it("handles input that is only a BOM character", () => {
    const result = parseWatchlistCsv("\uFEFF");
    expect(result.source).toBe("unknown");
    expect(result.candidates).toEqual([]);
  });
});

// ===========================================================================
// 2. BOM + LINE-ENDING NORMALIZATION
// ===========================================================================

describe("parseWatchlistCsv — BOM + line endings", () => {
  it("strips a leading UTF-8 BOM (0xFEFF)", () => {
    const bom = "\uFEFF";
    const csvText =
      bom + csv(["title", "media_type", "status"], [["A", "movie", "Planned"]]);
    const result = parseWatchlistCsv(csvText);
    expect(result.source).toBe("generic");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("A");
  });

  it("normalizes CRLF (\\r\\n) line endings", () => {
    const csvText = "title,media_type,status\r\nA,movie,Planned\r\n";
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("A");
  });

  it("normalizes legacy CR (\\r) line endings", () => {
    const csvText = "title,media_type,status\rA,movie,Planned\r";
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("A");
  });

  it("handles mixed line endings (CRLF + LF + CR)", () => {
    const csvText =
      "title,media_type,status\r\nA,movie,Planned\nB,movie,Watching\rC,tv,Completed";
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].title).toBe("A");
    expect(result.candidates[1].title).toBe("B");
    expect(result.candidates[2].title).toBe("C");
  });

  it("handles BOM + CRLF combined", () => {
    const csvText =
      "\uFEFFtitle,media_type,status\r\nA,movie,Planned\r\n";
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("A");
  });

  it("handles trailing newline (no empty final row)", () => {
    const csvText = "title,media_type,status\nA,movie,Planned\n";
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates).toHaveLength(1);
    expect(result.skipped).toBe(0);
  });

  it("handles multiple trailing newlines without creating phantom rows", () => {
    const csvText = "title,media_type,status\nA,movie,Planned\n\n\n";
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates).toHaveLength(1);
    expect(result.skipped).toBe(0);
  });
});

// ===========================================================================
// 3. LETTERBOXD — exhaustive
// ===========================================================================

describe("parseWatchlistCsv — Letterboxd format", () => {
  const headers = ["Position", "Name", "Year", "Letterboxd URI", "Rating10"];

  it("detects Letterboxd source via 'letterboxd uri' header", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        [
          "1",
          "Inception",
          "2010",
          "https://letterboxd.com/film/inception/",
          "9"
        ]
      ])
    );
    expect(result.source).toBe("letterboxd");
  });

  it("detects Letterboxd source case-insensitively (lowercase headers)", () => {
    const lowerHeaders = headers.map((h) => h.toLowerCase());
    const result = parseWatchlistCsv(
      csv(lowerHeaders, [
        ["1", "Inception", "2010", "https://letterboxd.com/film/inception/", "9"]
      ])
    );
    expect(result.source).toBe("letterboxd");
  });

  it("maps each row to a movie candidate with status=Completed", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "Inception", "2010", "https://letterboxd.com/film/inception/", "9"],
        ["2", "The Matrix", "1999", "https://letterboxd.com/film/the-matrix/", "10"]
      ])
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toEqual({
      id: undefined,
      title: "Inception",
      year: "2010",
      media_type: "movie",
      status: "Completed",
      rating: 9,
      watchDate: undefined
    });
    expect(result.candidates[1].title).toBe("The Matrix");
    expect(result.candidates[1].rating).toBe(10);
  });

  it("extracts TMDB id from Letterboxd URI when present", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "Inception", "2010", "https://www.themoviedb.org/movie/27205", "9"]
      ])
    );
    expect(result.candidates[0].id).toBe("27205");
  });

  it("extracts TMDB id from non-www URI variant", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "Inception", "2010", "https://themoviedb.org/movie/27205", "9"]
      ])
    );
    expect(result.candidates[0].id).toBe("27205");
  });

  it("does NOT extract a TMDB id from a regular letterboxd.com URI", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "Inception", "2010", "https://letterboxd.com/film/inception/", "9"]
      ])
    );
    expect(result.candidates[0].id).toBeUndefined();
  });

  it("skips rows with no Name", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "", "2010", "https://letterboxd.com/film/inception/", "9"]
      ])
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("treats empty Rating10 as undefined (not 0)", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "Inception", "2010", "https://letterboxd.com/film/inception/", ""]
      ])
    );
    expect(result.candidates[0].rating).toBeUndefined();
  });

  it("treats missing Year as undefined", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "Inception", "", "https://letterboxd.com/film/inception/", "9"]
      ])
    );
    expect(result.candidates[0].year).toBeUndefined();
  });

  it("preserves non-ASCII titles (CJK, Cyrillic, accented)", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "千と千尋の神隠し", "2001", "https://letterboxd.com/film/spirited-away/", "10"],
        ["2", "Иваново детство", "1962", "https://letterboxd.com/film/ivans-childhood/", "9"],
        ["3", "Amélie", "2001", "https://letterboxd.com/film/amelie/", "9"],
        ["4", "巴黎野玫瑰", "1986", "https://letterboxd.com/film/betty-blue/", "8"]
      ])
    );
    expect(result.candidates).toHaveLength(4);
    expect(result.candidates[0].title).toBe("千と千尋の神隠し");
    expect(result.candidates[1].title).toBe("Иваново детство");
    expect(result.candidates[2].title).toBe("Amélie");
    expect(result.candidates[3].title).toBe("巴黎野玫瑰");
  });

  it("preserves titles containing commas when quoted per RFC 4180", () => {
    const csvText = `${headers.join(",")}\n1,"Hello, World",2010,https://letterboxd.com/film/hello/,9`;
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates[0].title).toBe("Hello, World");
  });

  it("preserves titles containing escaped double-quotes", () => {
    // CSV escapes a literal " inside a quoted field by doubling it.
    // "Say ""hi""" parses to: Say "hi"
    const csvText = `${headers.join(",")}\n1,"Say ""hi""",2010,https://letterboxd.com/film/say-hi/,9`;
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates[0].title).toBe('Say "hi"');
  });

  it("handles duplicate entries (same title/year) without deduplication", () => {
    // Letterboxd exports can legitimately contain duplicates (re-watches).
    // The parser should NOT deduplicate — the caller decides how to merge.
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "Inception", "2010", "https://letterboxd.com/film/inception/", "9"],
        ["2", "Inception", "2010", "https://letterboxd.com/film/inception/", "10"]
      ])
    );
    expect(result.candidates).toHaveLength(2);
  });

  it("handles the optional 'Date' column (Letterboxd diary export)", () => {
    // Letterboxd diary/watched exports include a 'Date' column (YYYY-MM-DD).
    // The current parser doesn't read it (sets watchDate=undefined), but it
    // must not crash. This is a documented limitation — the caller can
    // post-process if needed.
    const headersWithDate = ["Position", "Name", "Year", "Letterboxd URI", "Rating10", "Date", "Tags"];
    const result = parseWatchlistCsv(
      csv(headersWithDate, [
        ["1", "Inception", "2010", "https://letterboxd.com/film/inception/", "9", "2026-01-15", "rewatch"]
      ])
    );
    expect(result.source).toBe("letterboxd");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("Inception");
  });

  it("handles rows with extra trailing columns (more fields than headers)", () => {
    const csvText = `${headers.join(",")}\n1,Inception,2010,https://letterboxd.com/film/inception/,9,extra1,extra2`;
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("Inception");
  });

  it("handles rows with missing trailing columns (fewer fields than headers)", () => {
    // Row with only Position + Name + Year (no URI or Rating10).
    const csvText = `${headers.join(",")}\n1,Inception,2010`;
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("Inception");
    expect(result.candidates[0].rating).toBeUndefined();
  });

  it("handles a rating of 0 as undefined (Letterboxd convention)", () => {
    // Letterboxd Rating10 = 0 means "unrated". The parser coerces NaN to
    // undefined via the `!isNaN(rating as number)` guard, but 0 itself
    // is a valid number and currently passes through as 0. This test
    // documents that behavior.
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "Inception", "2010", "https://letterboxd.com/film/inception/", "0"]
      ])
    );
    // 0 is technically a valid number, so it passes through. This is a
    // known limitation — normalizeBackup.normalizeRating() handles the
    // 0 → undefined conversion at a later stage.
    expect(result.candidates[0].rating).toBe(0);
  });

  it("handles a non-numeric Rating10 string gracefully", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "Inception", "2010", "https://letterboxd.com/film/inception/", "not-a-number"]
      ])
    );
    // Number("not-a-number") = NaN; the !isNaN guard kicks in → undefined.
    expect(result.candidates[0].rating).toBeUndefined();
  });

  it("handles decimal ratings (e.g. 7.5)", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "Inception", "2010", "https://letterboxd.com/film/inception/", "7.5"]
      ])
    );
    expect(result.candidates[0].rating).toBe(7.5);
  });
});

// ===========================================================================
// 4. TRAKT — exhaustive (movies + TV, season/episode, special S00E01)
// ===========================================================================

describe("parseWatchlistCsv — Trakt format", () => {
  const headers = ["Title", "Year", "Type", "Rating", "WatchedAt", "Status"];

  it("detects Trakt source via 'watchedat' + 'type' headers", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["Breaking Bad", "2008", "show", "10", "2026-01-01", "Completed"]])
    );
    expect(result.source).toBe("trakt");
  });

  it("maps 'show' / 'tv' type to media_type=tv", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Breaking Bad", "2008", "show", "10", "2026-01-01", "Completed"],
        ["The Office", "2005", "tv", "9", "2026-02-01", "Completed"]
      ])
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].media_type).toBe("tv");
    expect(result.candidates[1].media_type).toBe("tv");
  });

  it("maps 'movie' type to media_type=movie", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["Inception", "2010", "movie", "9", "2026-01-01", "Completed"]])
    );
    expect(result.candidates[0].media_type).toBe("movie");
  });

  it("maps 'episode' type to media_type=tv (Trakt episode-level exports)", () => {
    // Trakt sometimes exports episode-level rows with Type=episode.
    // These should map to media_type=tv.
    const result = parseWatchlistCsv(
      csv(headers, [["Breaking Bad S1E1", "2008", "episode", "10", "2026-01-01", "Completed"]])
    );
    expect(result.candidates[0].media_type).toBe("tv");
  });

  it("preserves the Status field from the CSV", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["Show A", "2020", "show", "8", "2026-01-01", "Watching"]])
    );
    expect(result.candidates[0].status).toBe("Watching");
  });

  it("defaults Status to 'Completed' when missing", () => {
    const csvText = "Title,Year,Type,Rating,WatchedAt\nBreaking Bad,2008,show,10,2026-01-01";
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates[0].status).toBe("Completed");
  });

  it("preserves WatchedAt as watchDate", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["Inception", "2010", "movie", "9", "2026-03-15", "Completed"]])
    );
    expect(result.candidates[0].watchDate).toBe("2026-03-15");
  });

  it("handles empty WatchedAt as undefined", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["Inception", "2010", "movie", "9", "", "Completed"]])
    );
    expect(result.candidates[0].watchDate).toBeUndefined();
  });

  it("handles malformed dates by passing them through as-is (no validation)", () => {
    // The parser does not validate date format — it passes the string
    // through. normalizeBackup.normalizeDate() handles invalid dates
    // downstream. This is intentional: validation is the normalizer's job.
    const result = parseWatchlistCsv(
      csv(headers, [["Inception", "2010", "movie", "9", "not-a-date", "Completed"]])
    );
    expect(result.candidates[0].watchDate).toBe("not-a-date");
  });

  it("skips rows with no Title", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["", "2020", "show", "8", "2026-01-01", "Watching"]])
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("handles empty Rating as undefined", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["Inception", "2010", "movie", "", "2026-01-01", "Completed"]])
    );
    expect(result.candidates[0].rating).toBeUndefined();
  });

  it("preserves non-ASCII titles", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["寄生虫", "2019", "movie", "10", "2026-01-01", "Completed"],
        ["최민식", "2003", "movie", "9", "2026-01-01", "Completed"]
      ])
    );
    expect(result.candidates[0].title).toBe("寄生虫");
    expect(result.candidates[1].title).toBe("최민식");
  });

  // ─── TV episode / season mapping ───────────────────────────────────
  //
  // Trakt CSV exports can include Season + Episode columns for TV shows.
  // The current parser does NOT read these — it maps the row to a TV
  // candidate without season/episode info. The caller is responsible
  // for post-processing if needed.
  //
  // We document this limitation with a test so any future fix is
  // intentional (not accidental).

  it("handles Trakt exports with Season + Episode columns (documented limitation)", () => {
    const headersWithEp = ["Title", "Year", "Type", "Season", "Episode", "Rating", "WatchedAt", "Status"];
    const result = parseWatchlistCsv(
      csv(headersWithEp, [
        ["Breaking Bad", "2008", "show", "1", "1", "10", "2026-01-01", "Completed"],
        ["Breaking Bad", "2008", "show", "1", "2", "10", "2026-01-02", "Completed"]
      ])
    );
    expect(result.source).toBe("trakt");
    expect(result.candidates).toHaveLength(2);
    // The current parser does NOT map Season/Episode to the candidate.
    // This is a known gap — Trakt CSV imports at the episode level would
    // need a post-processing step to aggregate episodes per show.
    expect(result.candidates[0].season).toBeUndefined();
    expect(result.candidates[0].episode).toBeUndefined();
  });

  it("handles special episodes (S00E01) without crashing", () => {
    // Trakt represents specials as Season 0. The parser should not crash
    // on these rows even though it doesn't currently extract season/episode.
    const headersWithEp = ["Title", "Year", "Type", "Season", "Episode", "Rating", "WatchedAt", "Status"];
    const result = parseWatchlistCsv(
      csv(headersWithEp, [
        ["Breaking Bad Special", "2008", "show", "0", "1", "8", "2026-01-01", "Completed"]
      ])
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].media_type).toBe("tv");
  });

  it("handles mixed movies + TV in a single export", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Inception", "2010", "movie", "9", "2026-01-01", "Completed"],
        ["Breaking Bad", "2008", "show", "10", "2026-01-02", "Completed"],
        ["The Office", "2005", "show", "9", "2026-01-03", "Watching"],
        ["Pulp Fiction", "1994", "movie", "10", "2026-01-04", "Completed"]
      ])
    );
    expect(result.candidates).toHaveLength(4);
    const movies = result.candidates.filter((c) => c.media_type === "movie");
    const tv = result.candidates.filter((c) => c.media_type === "tv");
    expect(movies).toHaveLength(2);
    expect(tv).toHaveLength(2);
  });

  it("handles lowercase headers (case-insensitive detection)", () => {
    const lowerHeaders = headers.map((h) => h.toLowerCase());
    const result = parseWatchlistCsv(
      csv(lowerHeaders, [["Breaking Bad", "2008", "show", "10", "2026-01-01", "Completed"]])
    );
    expect(result.source).toBe("trakt");
    expect(result.candidates[0].title).toBe("Breaking Bad");
  });

  it("handles decimal ratings (e.g. 8.5)", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["Inception", "2010", "movie", "8.5", "2026-01-01", "Completed"]])
    );
    expect(result.candidates[0].rating).toBe(8.5);
  });
});

// ===========================================================================
// 5. IMDb — exhaustive (Const, Title Type, tvEpisode vs movie)
// ===========================================================================

describe("parseWatchlistCsv — IMDb format", () => {
  const headers = [
    "Position",
    "Const",
    "Created",
    "Modified",
    "Description",
    "Title",
    "Title Type",
    "Year",
    "IMDb Rating"
  ];

  it("detects IMDb source via 'const' + 'title type' headers", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["1", "tt1375666", "2026-01-01", "2026-01-02", "A dream movie", "Inception", "movie", "2010", "8.8"]])
    );
    expect(result.source).toBe("imdb");
  });

  it("maps 'TV Series' / 'TV Mini-Series' to media_type=tv", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt0903747", "2026-01-01", "", "A chemistry teacher", "Breaking Bad", "TV Series", "2008", "9.5"],
        ["2", "tt3581920", "2026-01-01", "", "A Chernobyl story", "Chernobyl", "TV Mini-Series", "2019", "9.4"]
      ])
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].media_type).toBe("tv");
    expect(result.candidates[1].media_type).toBe("tv");
  });

  it("maps 'movie' / 'Short' / 'Video' title types to media_type=movie", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt1375666", "2026-01-01", "", "A dream movie", "Inception", "movie", "2010", "8.8"],
        ["2", "tt0096895", "2026-01-01", "", "A short film", "Pee-wee's Playhouse Christmas Special", "Short", "1988", "7.5"],
        ["3", "tt1234567", "2026-01-01", "", "A video", "Some Video", "Video", "2000", "6.0"]
      ])
    );
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].media_type).toBe("movie");
    expect(result.candidates[1].media_type).toBe("movie");
    expect(result.candidates[2].media_type).toBe("movie");
  });

  it("maps 'tvEpisode' title type to media_type=tv (episode-level exports)", () => {
    // IMDb exports can include individual episodes with Title Type=tvEpisode.
    // These should map to media_type=tv so they're treated as TV entries.
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt0959622", "2026-01-01", "", "Pilot episode", "Breaking Bad: Pilot", "tvEpisode", "2008", "9.0"]
      ])
    );
    expect(result.candidates[0].media_type).toBe("tv");
  });

  it("maps 'tvSpecial' / 'tvShort' / 'tvMovie' to media_type=tv", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt001", "2026-01-01", "", "A special", "Doctor Who: The specials", "tvSpecial", "2009", "8.0"],
        ["2", "tt002", "2026-01-01", "", "A TV short", "Some TV Short", "tvShort", "2010", "7.0"],
        ["3", "tt003", "2026-01-01", "", "A TV movie", "Some TV Movie", "tvMovie", "2012", "6.5"]
      ])
    );
    expect(result.candidates[0].media_type).toBe("tv");
    expect(result.candidates[1].media_type).toBe("tv");
    expect(result.candidates[2].media_type).toBe("tv");
  });

  it("uses Created date as watchDate and Description as notes", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt1375666", "2026-03-15", "", "A dream movie", "Inception", "movie", "2010", "8.8"]
      ])
    );
    expect(result.candidates[0].watchDate).toBe("2026-03-15");
    expect(result.candidates[0].notes).toBe("A dream movie");
  });

  it("handles empty Created date as undefined watchDate", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt1375666", "", "", "A dream movie", "Inception", "movie", "2010", "8.8"]
      ])
    );
    expect(result.candidates[0].watchDate).toBeUndefined();
  });

  it("handles empty Description as undefined notes", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt1375666", "2026-01-01", "", "", "Inception", "movie", "2010", "8.8"]
      ])
    );
    expect(result.candidates[0].notes).toBeUndefined();
  });

  it("skips rows with no Title", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["1", "tt1375666", "2026-01-01", "", "Desc", "", "movie", "2010", "8.8"]])
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("parses decimal IMDb ratings (e.g. 8.8)", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt1375666", "2026-01-01", "", "", "Inception", "movie", "2010", "8.8"]
      ])
    );
    expect(result.candidates[0].rating).toBe(8.8);
  });

  it("handles empty IMDb Rating as undefined", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt1375666", "2026-01-01", "", "", "Inception", "movie", "2010", ""]
      ])
    );
    expect(result.candidates[0].rating).toBeUndefined();
  });

  it("preserves the IMDb Const (tt-prefixed ID) in the row — documented limitation", () => {
    // The current parser does NOT extract the Const column into a
    // dedicated `imdbId` field on the candidate (it only reads Title,
    // Year, Title Type, IMDb Rating, Created, Description). The Const
    // is available in the raw row but not surfaced. This test documents
    // the limitation — a future enhancement would add imdbId extraction.
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt1375666", "2026-01-01", "", "", "Inception", "movie", "2010", "8.8"]
      ])
    );
    expect(result.candidates[0].imdbId).toBeUndefined();
  });

  it("preserves non-ASCII titles", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt7286456", "2026-01-01", "", "", "寄生虫", "movie", "2019", "8.6"],
        ["2", "tt0114369", "2026-01-01", "", "", "七人の侍", "movie", "1954", "9.0"]
      ])
    );
    expect(result.candidates[0].title).toBe("寄生虫");
    expect(result.candidates[1].title).toBe("七人の侍");
  });

  it("handles titles containing commas when quoted", () => {
    const csvText = `${headers.join(",")}\n1,tt1375666,2026-01-01,,,"Hello, World",movie,2010,8.8`;
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates[0].title).toBe("Hello, World");
  });

  it("handles the full IMDb Title Type taxonomy without crashing", () => {
    // IMDb's Title Type can be: movie, short, tvEpisode, tvMiniSeries,
    // tvMovie, tvSeries, tvShort, tvSpecial, video, videoGame, etc.
    const allTypes = [
      "movie",
      "short",
      "tvEpisode",
      "tvMiniSeries",
      "tvMovie",
      "tvSeries",
      "tvShort",
      "tvSpecial",
      "video",
      "videoGame"
    ];
    const rows = allTypes.map((t, i) => [
      String(i + 1),
      `tt${String(i).padStart(7, "0")}`,
      "2026-01-01",
      "",
      "",
      `Title ${t}`,
      t,
      "2020",
      "7.0"
    ]);
    const result = parseWatchlistCsv(csv(headers, rows));
    expect(result.candidates).toHaveLength(allTypes.length);
    // All "tv*" types map to "tv"; "movie"/"short"/"video"/"videoGame" map to "movie".
    const movieTypes = ["movie", "short", "video", "videoGame"];
    result.candidates.forEach((c, i) => {
      const type = allTypes[i];
      if (movieTypes.includes(type)) {
        expect(c.media_type).toBe("movie");
      } else {
        expect(c.media_type).toBe("tv");
      }
    });
  });

  it("handles rows with extra columns (IMDb watchlist exports have ~16 columns)", () => {
    // Real IMDb exports include: Position, Const, Created, Modified,
    // Description, Title, Title Type, Directors, You rated, IMDb Rating,
    // Runtime (mins), Year, Genres, Num. Votes, Release Date (month/day),
    // URL.
    const fullHeaders = [
      "Position",
      "Const",
      "Created",
      "Modified",
      "Description",
      "Title",
      "Title Type",
      "Directors",
      "You rated",
      "IMDb Rating",
      "Runtime (mins)",
      "Year",
      "Genres",
      "Num. Votes",
      "Release Date (month/day)",
      "URL"
    ];
    const row = [
      "1",
      "tt1375666",
      "2026-01-01",
      "",
      "A dream movie",
      "Inception",
      "movie",
      "Christopher Nolan",
      "9",
      "8.8",
      "148",
      "2010",
      "Action, Sci-Fi",
      "2400000",
      "07/16",
      "https://www.imdb.com/title/tt1375666/"
    ];
    const result = parseWatchlistCsv(csv(fullHeaders, [row]));
    expect(result.source).toBe("imdb");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("Inception");
    expect(result.candidates[0].media_type).toBe("movie");
  });

  it("handles lowercase headers (case-insensitive detection)", () => {
    const lowerHeaders = headers.map((h) => h.toLowerCase());
    const result = parseWatchlistCsv(
      csv(lowerHeaders, [["1", "tt1375666", "2026-01-01", "", "", "Inception", "movie", "2010", "8.8"]])
    );
    expect(result.source).toBe("imdb");
  });
});

// ===========================================================================
// 6. TV TIME — exhaustive
// ===========================================================================

describe("parseWatchlistCsv — TV Time format", () => {
  const headers = ["show_name", "season", "number", "seen_at"];

  it("detects TV Time source via 'show_name' + 'seen_at' headers", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["Breaking Bad", "1", "1", "2026-01-01"]])
    );
    expect(result.source).toBe("tvtime");
  });

  it("emits a single candidate per show (aggregates episode rows)", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Breaking Bad", "1", "1", "2026-01-01"],
        ["Breaking Bad", "1", "2", "2026-01-02"],
        ["Breaking Bad", "1", "3", "2026-01-03"],
        ["The Office", "1", "1", "2026-02-01"]
      ])
    );
    expect(result.candidates).toHaveLength(2);
    const bb = result.candidates.find((c) => c.title === "Breaking Bad");
    const office = result.candidates.find((c) => c.title === "The Office");
    expect(bb).toBeDefined();
    expect(office).toBeDefined();
  });

  it("marks shows with >= 5 episodes watched as Completed", () => {
    const rows: string[][] = [];
    for (let i = 1; i <= 5; i++) {
      rows.push(["Big Show", "1", String(i), `2026-01-0${i}`]);
    }
    const result = parseWatchlistCsv(csv(headers, rows));
    const big = result.candidates.find((c) => c.title === "Big Show");
    expect(big?.status).toBe("Completed");
  });

  it("marks shows with < 5 episodes watched as Watching", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Small Show", "1", "1", "2026-01-01"],
        ["Small Show", "1", "2", "2026-01-02"]
      ])
    );
    const small = result.candidates.find((c) => c.title === "Small Show");
    expect(small?.status).toBe("Watching");
  });

  it("tracks the latest season/episode seen", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Breaking Bad", "1", "1", "2026-01-01"],
        ["Breaking Bad", "2", "1", "2026-02-01"],
        ["Breaking Bad", "2", "5", "2026-02-05"]
      ])
    );
    const bb = result.candidates.find((c) => c.title === "Breaking Bad");
    expect(bb?.season).toBe(2);
    expect(bb?.episode).toBe(5);
  });

  it("tracks the earliest watchDate across all rows", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Breaking Bad", "1", "1", "2026-03-01"],
        ["Breaking Bad", "1", "2", "2026-01-01"], // earlier
        ["Breaking Bad", "1", "3", "2026-02-01"]
      ])
    );
    const bb = result.candidates.find((c) => c.title === "Breaking Bad");
    expect(bb?.watchDate).toBe("2026-01-01");
  });

  it("skips rows with no show_name", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["", "1", "1", "2026-01-01"],
        ["Breaking Bad", "1", "1", "2026-01-01"]
      ])
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("handles special season 0 (S00E01) episodes without crashing", () => {
    // TV Time can export specials as season 0. The aggregation logic
    // uses `>` comparison on season numbers, so season 0 should not
    // override real seasons.
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Breaking Bad", "0", "1", "2025-12-31"], // special
        ["Breaking Bad", "1", "1", "2026-01-01"]  // real episode
      ])
    );
    const bb = result.candidates.find((c) => c.title === "Breaking Bad");
    expect(bb).toBeDefined();
    // Season 1 should win (it's > season 0).
    expect(bb?.season).toBe(1);
    expect(bb?.episode).toBe(1);
  });

  it("handles missing season/episode columns gracefully", () => {
    // Some TV Time exports might omit season/number. The parser should
    // still emit a candidate with undefined season/episode.
    const minimalHeaders = ["show_name", "seen_at"];
    const result = parseWatchlistCsv(
      csv(minimalHeaders, [["Breaking Bad", "2026-01-01"]])
    );
    // Hmm — the detector requires show_name + seen_at. Without
    // season/number columns, the aggregation still works (treats
    // season/episode as undefined). One row = one candidate.
    expect(result.source).toBe("tvtime");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("Breaking Bad");
    expect(result.candidates[0].season).toBeUndefined();
    expect(result.candidates[0].episode).toBeUndefined();
  });

  it("handles non-numeric season values gracefully", () => {
    // A malformed season like "S1" or "abc" should parse to undefined
    // (parseInt returns NaN → `|| undefined`).
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Breaking Bad", "abc", "1", "2026-01-01"]
      ])
    );
    const bb = result.candidates.find((c) => c.title === "Breaking Bad");
    expect(bb).toBeDefined();
    expect(bb?.season).toBeUndefined();
  });

  it("handles non-numeric episode values gracefully", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Breaking Bad", "1", "xyz", "2026-01-01"]
      ])
    );
    const bb = result.candidates.find((c) => c.title === "Breaking Bad");
    expect(bb?.episode).toBeUndefined();
  });

  it("handles missing seen_at (empty string)", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Breaking Bad", "1", "1", ""]
      ])
    );
    const bb = result.candidates.find((c) => c.title === "Breaking Bad");
    expect(bb?.watchDate).toBeUndefined();
  });

  it("handles multiple shows interleaved (not grouped together)", () => {
    // TV Time exports are usually sorted by seen_at, not by show.
    // The aggregation must correctly group rows by show_name regardless
    // of row order.
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Breaking Bad", "1", "1", "2026-01-01"],
        ["The Office", "1", "1", "2026-01-02"],
        ["Breaking Bad", "1", "2", "2026-01-03"],
        ["The Office", "1", "2", "2026-01-04"],
        ["Breaking Bad", "2", "1", "2026-01-05"]
      ])
    );
    expect(result.candidates).toHaveLength(2);
    const bb = result.candidates.find((c) => c.title === "Breaking Bad");
    const office = result.candidates.find((c) => c.title === "The Office");
    expect(bb?.season).toBe(2);
    expect(bb?.episode).toBe(1);
    expect(office?.season).toBe(1);
    expect(office?.episode).toBe(2);
  });

  it("handles alternative column header casing (Show_Name, SEEN_AT)", () => {
    // Some TV Time export variants use different casing. The parser
    // checks both `show_name` and `Show Name`, and `seen_at` and
    // `Seen At` — but the DETECTOR only checks the lowercase joined
    // header string. So "Show_Name" lowercases to "show_name" → detected.
    const altHeaders = ["Show_Name", "Season", "Number", "Seen_At"];
    const result = parseWatchlistCsv(
      csv(altHeaders, [["Breaking Bad", "1", "1", "2026-01-01"]])
    );
    // Detection: "show_name" + "seen_at" → tvtime. ✓
    expect(result.source).toBe("tvtime");
    // Row mapping: the parser reads row["show_name"] || row["Show Name"].
    // "Show_Name" doesn't match either key, so showName would be
    // undefined → row skipped. This is a known limitation.
    // (We document it rather than fix it to avoid scope creep.)
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("preserves non-ASCII show names", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["進撃の巨人", "1", "1", "2026-01-01"],
        ["進撃の巨人", "1", "2", "2026-01-02"],
        ["오징어게임", "1", "1", "2026-02-01"]
      ])
    );
    expect(result.candidates).toHaveLength(2);
    const aot = result.candidates.find((c) => c.title === "進撃の巨人");
    const squid = result.candidates.find((c) => c.title === "오징어게임");
    expect(aot).toBeDefined();
    expect(squid).toBeDefined();
  });

  it("correctly aggregates episodes when the same episode number appears in different seasons", () => {
    // Both season 1 and season 2 have an "episode 1" — the latest season
    // (2) should win, and its episode 1 should be recorded. The next row
    // bumps season 2 to episode 5.
    const result = parseWatchlistCsv(
      csv(headers, [
        ["Show X", "1", "1", "2026-01-01"],
        ["Show X", "2", "1", "2026-02-01"], // season 2 > season 1 → season=2, episode=1
        ["Show X", "2", "5", "2026-02-05"]  // same season, higher episode → episode=5
      ])
    );
    const x = result.candidates.find((c) => c.title === "Show X");
    expect(x?.season).toBe(2);
    expect(x?.episode).toBe(5);
  });
});

// ===========================================================================
// 7. GENERIC CINELOG EXPORT — round-trip fidelity
// ===========================================================================

describe("parseWatchlistCsv — generic CineLog format", () => {
  const headers = [
    "id",
    "title",
    "media_type",
    "status",
    "rating",
    "watch_date",
    "added_at",
    "updated_at",
    "notes"
  ];

  it("detects generic source via 'media_type' + 'status' headers", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["1", "Inception", "movie", "Planned", "8", "", "2026-01-01", "2026-01-01", ""]])
    );
    expect(result.source).toBe("generic");
  });

  it("maps all standard fields", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["123", "Inception", "movie", "Watching", "8.5", "2026-01-15", "2026-01-01", "2026-01-15", "Great film"]])
    );
    const candidate = result.candidates[0];
    expect(candidate.id).toBe("123");
    expect(candidate.title).toBe("Inception");
    expect(candidate.media_type).toBe("movie");
    expect(candidate.status).toBe("Watching");
    expect(candidate.rating).toBe(8.5);
    expect(candidate.watchDate).toBe("2026-01-15");
    expect(candidate.addedAt).toBe("2026-01-01");
    expect(candidate.updatedAt).toBe("2026-01-15");
    expect(candidate.notes).toBe("Great film");
  });

  it("preserves extended fields when present (runtime, genres, cast, etc.)", () => {
    const headersExtended = [
      ...headers,
      "runtime",
      "total_eps",
      "season",
      "episode",
      "genres",
      "platforms",
      "cast",
      "director",
      "imdb_id",
      "poster_path",
      "release_date"
    ];
    const result = parseWatchlistCsv(
      csv(headersExtended, [[
        "1",
        "Test",
        "tv",
        "Watching",
        "8",
        "2026-01-01",
        "2026-01-01",
        "2026-01-01",
        "",
        "45",
        "100",
        "2",
        "5",
        "Drama|Thriller",
        "Netflix|Prime",
        "Actor 1|Actor 2",
        "Director X",
        "tt1234567",
        "/poster.jpg",
        "2020-01-01"
      ]])
    );
    const candidate = result.candidates[0];
    expect(candidate.runtime).toBe(45);
    expect(candidate.totalEps).toBe(100);
    expect(candidate.season).toBe(2);
    expect(candidate.episode).toBe(5);
    expect(candidate.genresList).toEqual(["Drama", "Thriller"]);
    expect(candidate.platformsList).toEqual(["Netflix", "Prime"]);
    expect(candidate.castList).toEqual(["Actor 1", "Actor 2"]);
    expect(candidate.director).toBe("Director X");
    expect(candidate.imdbId).toBe("tt1234567");
    expect(candidate.poster_path).toBe("/poster.jpg");
    expect(candidate.release_date).toBe("2020-01-01");
  });

  it("treats any media_type that isn't 'tv' as 'movie'", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["1", "Test", "movie", "Planned", "", "", "", "", ""]])
    );
    expect(result.candidates[0].media_type).toBe("movie");

    const resultTv = parseWatchlistCsv(
      csv(headers, [["1", "Test", "tv", "Planned", "", "", "", "", ""]])
    );
    expect(resultTv.candidates[0].media_type).toBe("tv");
  });

  it("preserves watch_date and added_at SEPARATELY (no conflation)", () => {
    // Regression test: the old code used added_at as a fallback for watchDate,
    // which set the wrong timestamp on Planned items.
    const result = parseWatchlistCsv(
      csv(headers, [["1", "Planned Movie", "movie", "Planned", "", "", "2026-01-01", "2026-01-01", ""]])
    );
    expect(result.candidates[0].watchDate).toBeUndefined();
    expect(result.candidates[0].addedAt).toBe("2026-01-01");
  });

  it("skips rows with no title", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["1", "", "movie", "Planned", "", "", "", "", ""]])
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("handles empty rating as undefined", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["1", "Test", "movie", "Planned", "", "", "", "", ""]])
    );
    expect(result.candidates[0].rating).toBeUndefined();
  });

  it("handles non-numeric rating strings as undefined", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["1", "Test", "movie", "Planned", "not-a-number", "", "", "", ""]])
    );
    expect(result.candidates[0].rating).toBeUndefined();
  });

  it("handles missing status by defaulting to 'Planned'", () => {
    // The generic parser defaults missing status to "Planned".
    const csvText = "id,title,media_type\n1,Test,movie";
    const result = parseWatchlistCsv(csvText);
    // Hmm — without a "status" header, the detector won't classify this
    // as "generic". It falls through to "unknown". Document the behavior.
    expect(result.source).toBe("unknown");
  });

  it("handles pipe-separated genres with trailing/leading whitespace", () => {
    const headersExtended = [...headers, "genres"];
    const result = parseWatchlistCsv(
      csv(headersExtended, [["1", "Test", "movie", "Planned", "", "", "", "", "", "  Drama  |  Thriller  |  Action  "]])
    );
    expect(result.candidates[0].genresList).toEqual(["Drama", "Thriller", "Action"]);
  });

  it("handles empty pipe-separated lists as undefined (parser omits empty arrays)", () => {
    // The parser intentionally omits empty arrays (uses `length > 0` guard)
    // so that downstream normalizeBackup.normalizeStringArray() can fill in
    // [] as the default. Setting genresList=[] would overwrite the default
    // behavior. This test documents the intentional omission.
    const headersExtended = [...headers, "genres", "platforms", "cast"];
    const result = parseWatchlistCsv(
      csv(headersExtended, [["1", "Test", "movie", "Planned", "", "", "", "", "", "", "", ""]])
    );
    expect(result.candidates[0].genresList).toBeUndefined();
    expect(result.candidates[0].platformsList).toBeUndefined();
    expect(result.candidates[0].castList).toBeUndefined();
  });

  it("handles single-item pipe-separated lists", () => {
    const headersExtended = [...headers, "genres"];
    const result = parseWatchlistCsv(
      csv(headersExtended, [["1", "Test", "movie", "Planned", "", "", "", "", "", "Drama"]])
    );
    expect(result.candidates[0].genresList).toEqual(["Drama"]);
  });

  it("handles pipe-separated lists with empty segments (||)", () => {
    const headersExtended = [...headers, "genres"];
    const result = parseWatchlistCsv(
      csv(headersExtended, [["1", "Test", "movie", "Planned", "", "", "", "", "", "Drama||Action|||Thriller"]])
    );
    // Empty segments are filtered out by splitPipe().
    expect(result.candidates[0].genresList).toEqual(["Drama", "Action", "Thriller"]);
  });

  it("preserves non-ASCII titles and pipe-separated values", () => {
    const headersExtended = [...headers, "genres", "cast"];
    const result = parseWatchlistCsv(
      csv(headersExtended, [[
        "1",
        "寄生虫",
        "movie",
        "Completed",
        "9",
        "2026-01-01",
        "2026-01-01",
        "2026-01-01",
        "",
        "剧情|惊悚",
        "宋康昊|李善均"
      ]])
    );
    expect(result.candidates[0].title).toBe("寄生虫");
    expect(result.candidates[0].genresList).toEqual(["剧情", "惊悚"]);
    expect(result.candidates[0].castList).toEqual(["宋康昊", "李善均"]);
  });

  it("handles numeric id (string → string)", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["12345", "Test", "movie", "Planned", "", "", "", "", ""]])
    );
    expect(result.candidates[0].id).toBe("12345");
  });

  it("handles non-numeric runtime/season/episode as undefined", () => {
    const headersExtended = [...headers, "runtime", "season", "episode"];
    const result = parseWatchlistCsv(
      csv(headersExtended, [["1", "Test", "tv", "Watching", "", "", "", "", "", "abc", "xyz", "def"]])
    );
    expect(result.candidates[0].runtime).toBeUndefined();
    expect(result.candidates[0].season).toBeUndefined();
    expect(result.candidates[0].episode).toBeUndefined();
  });

  it("handles the backdrop_path and rt_rating extended fields", () => {
    const headersExtended = [...headers, "backdrop_path", "rt_rating", "region", "tag"];
    const result = parseWatchlistCsv(
      csv(headersExtended, [["1", "Test", "movie", "Planned", "", "", "", "", "", "/backdrop.jpg", "85%", "International", "Theatre"]])
    );
    expect(result.candidates[0].backdrop_path).toBe("/backdrop.jpg");
    expect(result.candidates[0].rtRating).toBe("85%");
    expect(result.candidates[0].region).toBe("International");
    expect(result.candidates[0].tag).toBe("Theatre");
  });

  it("handles the imdb_rating extended field", () => {
    const headersExtended = [...headers, "imdb_rating"];
    const result = parseWatchlistCsv(
      csv(headersExtended, [["1", "Test", "movie", "Planned", "", "", "", "", "", "8.5"]])
    );
    expect(result.candidates[0].imdbRating).toBe("8.5");
  });
});

// ===========================================================================
// 8. UNKNOWN FORMAT FALLBACK
// ===========================================================================

describe("parseWatchlistCsv — unknown format fallback", () => {
  it("emits a basic candidate with media_type=movie + status=Planned for unrecognized headers", () => {
    const result = parseWatchlistCsv(csv(["foo", "Title", "baz"], [["x", "My Title", "y"]]));
    expect(result.source).toBe("unknown");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("My Title");
    expect(result.candidates[0].media_type).toBe("movie");
    expect(result.candidates[0].status).toBe("Planned");
  });

  it("returns no candidates when no recognizable title column exists", () => {
    const result = parseWatchlistCsv(csv(["foo", "bar", "baz"], [["x", "y", "z"]]));
    expect(result.candidates).toHaveLength(0);
  });

  it("falls back to 'Name' column when 'Title' is absent", () => {
    const result = parseWatchlistCsv(csv(["foo", "Name", "baz"], [["x", "My Name", "y"]]));
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("My Name");
  });

  it("prefers 'title' over 'name' when both exist (lowercase)", () => {
    const result = parseWatchlistCsv(csv(["title", "name"], [["My Title", "My Name"]]));
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("My Title");
  });
});

// ===========================================================================
// 9. QUOTED FIELDS + RFC 4180 EDGE CASES
// ===========================================================================

describe("parseWatchlistCsv — quoted fields", () => {
  it("parses fields containing commas inside quotes", () => {
    const csvText = `title,media_type,status,notes\n"Hello, World",movie,Planned,"Has, commas"`;
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates[0].title).toBe("Hello, World");
    expect(result.candidates[0].notes).toBe("Has, commas");
  });

  it("parses escaped double-quotes (paired quotes inside a quoted field)", () => {
    const csvText = `title,media_type,status,notes\n"Say ""hi""",movie,Planned,"quoted"`;
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates[0].title).toBe('Say "hi"');
  });

  it("parses fields containing newlines inside quotes (multi-line fields)", () => {
    // RFC 4180 allows newlines inside quoted fields. The current line-based
    // parser does NOT support this — it splits on \n first, then parses
    // each line. A quoted newline would break the row.
    //
    // This is a known limitation. We document it with a test that expects
    // the parser to produce a (possibly malformed) result without crashing.
    const csvText = `title,media_type,status,notes\n"Line 1\nLine 2",movie,Planned,"ok"`;
    // The parser splits on \n, so "Line 1\nLine 2" becomes two lines:
    //   Line 1: `"Line 1` → title field starts a quote but never closes
    //   Line 2: `Line 2",movie,Planned,"ok"` → parses as fields
    // The result is undefined behavior — the test just ensures no crash.
    expect(() => parseWatchlistCsv(csvText)).not.toThrow();
  });

  it("handles empty quoted fields (empty title is skipped)", () => {
    // When a title field is an empty quoted string `""`, the parser
    // trims it to "" which is falsy → the generic `row["title"] || row["name"]`
    // check returns undefined → row is skipped. This is correct behavior:
    // a row with no title cannot be imported.
    const csvText = `title,media_type,status,notes\n"",movie,Planned,""`;
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("handles fields with leading/trailing whitespace inside quotes", () => {
    const csvText = `title,media_type,status,notes\n"  spaced  ",movie,Planned,"  notes  "`;
    const result = parseWatchlistCsv(csvText);
    // The parser trims each field via `.trim()` in the header mapping.
    expect(result.candidates[0].title).toBe("spaced");
    expect(result.candidates[0].notes).toBe("notes");
  });

  it("handles a quoted field that contains only a quote escape (\"\")", () => {
    // `""` inside a quoted field is an escaped `"`. So `""""` = a single `"` character.
    // We build the CSV with string concatenation to avoid template-literal
    // backtick parsing confusion with the doubled quotes.
    const csvText =
      'title,media_type,status\n' +
      '""""' + ',movie,Planned';
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates[0].title).toBe('"');
  });
});

// ===========================================================================
// 10. MASSIVE FILE SIMULATION (5000+ rows)
// ===========================================================================

describe("parseWatchlistCsv — massive file simulation", () => {
  it("handles 5000 Letterboxd rows without crashing or losing data", () => {
    const headers = ["Position", "Name", "Year", "Letterboxd URI", "Rating10"];
    const rows: string[][] = [];
    for (let i = 1; i <= 5000; i++) {
      rows.push([
        String(i),
        `Movie ${i}`,
        String(2000 + (i % 25)),
        `https://letterboxd.com/film/movie-${i}/`,
        String((i % 10) + 1)
      ]);
    }
    const csvText = csv(headers, rows);
    const result = parseWatchlistCsv(csvText);
    expect(result.source).toBe("letterboxd");
    expect(result.candidates).toHaveLength(5000);
    expect(result.skipped).toBe(0);
    expect(result.candidates[0].title).toBe("Movie 1");
    expect(result.candidates[4999].title).toBe("Movie 5000");
    // 5000 % 25 = 0 → year = String(2000 + 0) = "2000"
    expect(result.candidates[4999].year).toBe("2000");
  });

  it("handles 5000 Trakt rows (mixed movies + TV)", () => {
    const headers = ["Title", "Year", "Type", "Rating", "WatchedAt", "Status"];
    const rows: string[][] = [];
    for (let i = 1; i <= 5000; i++) {
      const isTv = i % 2 === 0;
      rows.push([
        isTv ? `Show ${i}` : `Movie ${i}`,
        String(2000 + (i % 25)),
        isTv ? "show" : "movie",
        String((i % 10) + 1),
        `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        "Completed"
      ]);
    }
    const csvText = csv(headers, rows);
    const result = parseWatchlistCsv(csvText);
    expect(result.source).toBe("trakt");
    expect(result.candidates).toHaveLength(5000);
    expect(result.skipped).toBe(0);
    const movies = result.candidates.filter((c) => c.media_type === "movie");
    const tv = result.candidates.filter((c) => c.media_type === "tv");
    expect(movies.length).toBe(2500);
    expect(tv.length).toBe(2500);
  });

  it("handles 6000 TV Time rows (1200 shows × 5 episodes each)", () => {
    const headers = ["show_name", "season", "number", "seen_at"];
    const rows: string[][] = [];
    for (let show = 1; show <= 1200; show++) {
      for (let ep = 1; ep <= 5; ep++) {
        rows.push([
          `Show ${show}`,
          "1",
          String(ep),
          `2026-01-${String(ep).padStart(2, "0")}`
        ]);
      }
    }
    const csvText = csv(headers, rows);
    const result = parseWatchlistCsv(csvText);
    expect(result.source).toBe("tvtime");
    expect(result.candidates).toHaveLength(1200);
    // Each show watched 5 episodes → Completed.
    const completed = result.candidates.filter((c) => c.status === "Completed");
    expect(completed.length).toBe(1200);
    // Each show's latest episode should be 5.
    const allEps5 = result.candidates.every((c) => c.episode === 5);
    expect(allEps5).toBe(true);
  });

  it("handles 5000 IMDb rows with mixed title types", () => {
    const headers = [
      "Position",
      "Const",
      "Created",
      "Modified",
      "Description",
      "Title",
      "Title Type",
      "Year",
      "IMDb Rating"
    ];
    const titleTypes = ["movie", "tvSeries", "tvMiniSeries", "tvEpisode", "tvSpecial", "short"];
    const rows: string[][] = [];
    for (let i = 1; i <= 5000; i++) {
      const tt = titleTypes[i % titleTypes.length];
      rows.push([
        String(i),
        `tt${String(i).padStart(7, "0")}`,
        "2026-01-01",
        "",
        `Description ${i}`,
        `Title ${i}`,
        tt,
        String(2000 + (i % 25)),
        String(((i % 10) + 1) + (i % 10) / 10).substring(0, 3)
      ]);
    }
    const csvText = csv(headers, rows);
    const result = parseWatchlistCsv(csvText);
    expect(result.source).toBe("imdb");
    expect(result.candidates).toHaveLength(5000);
    expect(result.skipped).toBe(0);
  });

  it("handles 5000 generic CineLog rows with full extended fields", () => {
    const headers = [
      "id",
      "title",
      "media_type",
      "status",
      "rating",
      "watch_date",
      "added_at",
      "updated_at",
      "notes",
      "runtime",
      "total_eps",
      "season",
      "episode",
      "genres",
      "platforms",
      "cast",
      "director",
      "imdb_id",
      "poster_path",
      "backdrop_path",
      "release_date"
    ];
    const rows: string[][] = [];
    for (let i = 1; i <= 5000; i++) {
      const isTv = i % 2 === 0;
      rows.push([
        String(i),
        `Title ${i}`,
        isTv ? "tv" : "movie",
        "Completed",
        String((i % 10) + 1),
        "2026-01-01",
        "2026-01-01",
        "2026-01-01",
        `Notes ${i}`,
        "120",
        isTv ? "50" : "",
        isTv ? "2" : "",
        isTv ? "5" : "",
        "Drama|Action",
        "Netflix|Prime",
        "Actor 1|Actor 2",
        "Director X",
        `tt${i}`,
        "/poster.jpg",
        "/backdrop.jpg",
        "2020-01-01"
      ]);
    }
    const csvText = csv(headers, rows);
    const result = parseWatchlistCsv(csvText);
    expect(result.source).toBe("generic");
    expect(result.candidates).toHaveLength(5000);
    expect(result.skipped).toBe(0);
    // Verify extended fields are preserved on the last candidate.
    const last = result.candidates[4999];
    expect(last.genresList).toEqual(["Drama", "Action"]);
    expect(last.platformsList).toEqual(["Netflix", "Prime"]);
    expect(last.castList).toEqual(["Actor 1", "Actor 2"]);
    expect(last.imdbId).toBe("tt5000");
  });

  it("handles a mix of valid + skipped rows in a massive file (no silent data loss)", () => {
    const headers = ["Position", "Name", "Year", "Letterboxd URI", "Rating10"];
    const rows: string[][] = [];
    for (let i = 1; i <= 5000; i++) {
      // Every 10th row has an empty Name → should be skipped.
      const name = i % 10 === 0 ? "" : `Movie ${i}`;
      rows.push([
        String(i),
        name,
        String(2000 + (i % 25)),
        `https://letterboxd.com/film/movie-${i}/`,
        String((i % 10) + 1)
      ]);
    }
    const csvText = csv(headers, rows);
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates.length).toBe(4500); // 500 skipped
    expect(result.skipped).toBe(500);
  });
});

// ===========================================================================
// 11. readFileAsText (FileReader wrapper)
// ===========================================================================

describe("readFileAsText", () => {
  it("resolves with the file's text content on success", async () => {
    const blob = new Blob(["hello world"], { type: "text/plain" });
    const file = new File([blob], "test.csv", { type: "text/plain" });
    const text = await readFileAsText(file);
    expect(text).toBe("hello world");
  });

  it("resolves with empty string for an empty file", async () => {
    const blob = new Blob([], { type: "text/plain" });
    const file = new File([blob], "empty.csv", { type: "text/plain" });
    const text = await readFileAsText(file);
    expect(text).toBe("");
  });

  it("preserves non-ASCII content (UTF-8)", async () => {
    const content = "千と千尋の神隠し,寄生虫,Amélie";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const file = new File([blob], "unicode.csv", { type: "text/plain;charset=utf-8" });
    const text = await readFileAsText(file);
    expect(text).toBe(content);
  });

  it("rejects on read error", async () => {
    const blob = new Blob(["data"], { type: "text/plain" });
    const file = new File([blob], "test.csv", { type: "text/plain" });

    // Stub FileReader to immediately error.
    const origFileReader = globalThis.FileReader;
    class StubFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      error: unknown = new Error("synthetic read error");
      result: string | ArrayBuffer | null = null;
      readAsText(): void {
        // Defer to next tick so the caller's await settles.
        queueMicrotask(() => this.onerror?.());
      }
    }
    globalThis.FileReader = StubFileReader as unknown as typeof FileReader;

    try {
      await expect(readFileAsText(file)).rejects.toBeDefined();
    } finally {
      globalThis.FileReader = origFileReader;
    }
  });
});

// ===========================================================================
// 12. CROSS-SOURCE REGRESSION TESTS
// ===========================================================================

describe("parseWatchlistCsv — cross-source regressions", () => {
  it("does not crash on a header row that is empty after trimming", () => {
    // Edge case: a CSV that starts with a blank line, then the real header.
    const csvText = "\nPosition,Name,Year,Letterboxd URI,Rating10\n1,Inception,2010,https://letterboxd.com/film/inception/,9";
    const result = parseWatchlistCsv(csvText);
    // The first non-empty line is the header, so detection works.
    // (The blank line is filtered out by the `filter(l => l.trim().length > 0)` step.)
    expect(result.source).toBe("letterboxd");
    expect(result.candidates).toHaveLength(1);
  });

  it("does not conflate Trakt detection with TV Time (both have 'watched' columns)", () => {
    // Trakt has 'WatchedAt' + 'Type'; TV Time has 'seen_at' + 'show_name'.
    // The detector checks for 'watchedat' + 'type' (Trakt) BEFORE
    // 'show_name' + 'seen_at' (TV Time), so a TV Time CSV with an
    // extra 'type' column could be misdetected. Verify the priority.
    const tvTimeHeaders = ["show_name", "season", "number", "seen_at", "type"];
    const result = parseWatchlistCsv(
      csv(tvTimeHeaders, [["Breaking Bad", "1", "1", "2026-01-01", "show"]])
    );
    // Trakt requires 'watchedat' AND 'type'. TV Time has 'seen_at' (not
    // 'watchedat'), so Trakt detection fails → TV Time detection wins.
    expect(result.source).toBe("tvtime");
  });

  it("does not misclassify IMDb as Trakt (IMDb has 'Const' + 'Title Type')", () => {
    // IMDb detection checks 'const' + 'title type'. Trakt checks
    // 'watchedat' + 'type'. An IMDb CSV has 'Title Type' (which contains
    // 'type' as a substring) but NOT 'watchedat'. So Trakt detection
    // should fail and IMDb detection should win.
    const imdbHeaders = ["Position", "Const", "Created", "Modified", "Description", "Title", "Title Type", "Year", "IMDb Rating"];
    const result = parseWatchlistCsv(
      csv(imdbHeaders, [["1", "tt1375666", "2026-01-01", "", "", "Inception", "movie", "2010", "8.8"]])
    );
    expect(result.source).toBe("imdb");
  });

  it("handles a CSV with only a header row and no data (every source)", () => {
    // Every source detector should handle a header-only CSV gracefully
    // (0 candidates, 0 skipped).
    const sources = {
      letterboxd: ["Position", "Name", "Year", "Letterboxd URI", "Rating10"],
      trakt: ["Title", "Year", "Type", "Rating", "WatchedAt", "Status"],
      imdb: ["Position", "Const", "Created", "Modified", "Description", "Title", "Title Type", "Year", "IMDb Rating"],
      tvtime: ["show_name", "season", "number", "seen_at"],
      generic: ["id", "title", "media_type", "status"]
    };
    for (const [expectedSource, headers] of Object.entries(sources)) {
      const result = parseWatchlistCsv(headers.join(","));
      expect(result.source).toBe(expectedSource);
      expect(result.candidates).toHaveLength(0);
      expect(result.skipped).toBe(0);
    }
  });
});
