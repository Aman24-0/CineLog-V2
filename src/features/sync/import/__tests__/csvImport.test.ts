// src/features/sync/import/__tests__/csvImport.test.ts
//
// Unit tests for the CSV import parser.
// Covers: BOM/line-ending normalization, format auto-detection,
// per-source row mapping (Letterboxd / Trakt / IMDb / TV Time / generic),
// TV Time episode aggregation, and malformed-row handling.

import { describe, it, expect } from "vitest";
import { parseWatchlistCsv, readFileAsText } from "../csvImport";

// ---------------------------------------------------------------------------
// Helper: build a CSV string from a header row + data rows.
// ---------------------------------------------------------------------------

function csv(headers: string[], rows: string[][]): string {
  const lines = [headers.join(","), ...rows.map((r) => r.join(","))];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Empty / invalid input
// ---------------------------------------------------------------------------

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
    // Header "foo,bar,baz" with no data rows → no candidates.
    const result = parseWatchlistCsv("foo,bar,baz");
    expect(result.source).toBe("unknown");
    expect(result.candidates).toHaveLength(0);
  });

  it("returns source='unknown' + 1 fallback candidate for an unrecognized single-row CSV", () => {
    // A header + one data row, where the headers don't match any known
    // source. The unknown branch falls back to looking for `title || name ||
    // Title || Name` columns — none exist, so 0 candidates is expected
    // here too. (If a Title column DID exist, the unknown branch would
    // emit a Planned movie candidate.)
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
});

// ---------------------------------------------------------------------------
// BOM + line-ending normalization
// ---------------------------------------------------------------------------

describe("parseWatchlistCsv — BOM + line endings", () => {
  it("strips a leading UTF-8 BOM (0xFEFF)", () => {
    const bom = "\uFEFF";
    const csvText = bom + csv(["title", "media_type", "status"], [["A", "movie", "Planned"]]);
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
});

// ---------------------------------------------------------------------------
// Letterboxd
// ---------------------------------------------------------------------------

describe("parseWatchlistCsv — Letterboxd format", () => {
  const headers = ["Position", "Name", "Year", "Letterboxd URI", "Rating10"];

  it("detects Letterboxd source via 'letterboxd uri' header", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["1", "Inception", "2010", "https://letterboxd.com/film/inception/", "9"]])
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
});

// ---------------------------------------------------------------------------
// Trakt
// ---------------------------------------------------------------------------

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

  it("maps other types to media_type=movie", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["Inception", "2010", "movie", "9", "2026-01-01", "Completed"]])
    );
    expect(result.candidates[0].media_type).toBe("movie");
  });

  it("preserves the Status field from the CSV", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["Show A", "2020", "show", "8", "2026-01-01", "Watching"]])
    );
    expect(result.candidates[0].status).toBe("Watching");
  });

  it("skips rows with no Title", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["", "2020", "show", "8", "2026-01-01", "Watching"]])
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// IMDb
// ---------------------------------------------------------------------------

describe("parseWatchlistCsv — IMDb format", () => {
  const headers = ["Position", "Const", "Created", "Modified", "Description", "Title", "Title Type", "Year", "IMDb Rating"];

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

  it("maps 'movie' / 'Short' title types to media_type=movie", () => {
    const result = parseWatchlistCsv(
      csv(headers, [
        ["1", "tt1375666", "2026-01-01", "", "A dream movie", "Inception", "movie", "2010", "8.8"]
      ])
    );
    expect(result.candidates[0].media_type).toBe("movie");
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

  it("skips rows with no Title", () => {
    const result = parseWatchlistCsv(
      csv(headers, [["1", "tt1375666", "2026-01-01", "", "Desc", "", "movie", "2010", "8.8"]])
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TV Time
// ---------------------------------------------------------------------------

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
});

// ---------------------------------------------------------------------------
// Generic CineLog export
// ---------------------------------------------------------------------------

describe("parseWatchlistCsv — generic CineLog format", () => {
  const headers = ["id", "title", "media_type", "status", "rating", "watch_date", "added_at", "updated_at", "notes"];

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
        "1", "Test", "tv", "Watching", "8", "2026-01-01", "2026-01-01", "2026-01-01", "",
        "45", "100", "2", "5", "Drama|Thriller", "Netflix|Prime", "Actor 1|Actor 2", "Director X",
        "tt1234567", "/poster.jpg", "2020-01-01"
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
});

// ---------------------------------------------------------------------------
// Unknown format fallback
// ---------------------------------------------------------------------------

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
});

// ---------------------------------------------------------------------------
// Quoted fields
// ---------------------------------------------------------------------------

describe("parseWatchlistCsv — quoted fields", () => {
  it("parses fields containing commas inside quotes", () => {
    const csvText = `title,media_type,status,notes\n"Hello, World",movie,Planned,"Has, commas"`;
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates[0].title).toBe("Hello, World");
    expect(result.candidates[0].notes).toBe("Has, commas");
  });

  it("parses escaped double-quotes (paired quotes inside a quoted field)", () => {
    // CSV escapes a literal " inside a quoted field by doubling it: "".
    // So "Say ""hi""" parses to: Say "hi"
    const csvText = `title,media_type,status,notes\n"Say ""hi""",movie,Planned,"quoted"`;
    const result = parseWatchlistCsv(csvText);
    expect(result.candidates[0].title).toBe('Say "hi"');
  });
});

// ---------------------------------------------------------------------------
// readFileAsText (FileReader wrapper)
// ---------------------------------------------------------------------------

describe("readFileAsText", () => {
  it("resolves with the file's text content on success", async () => {
    const blob = new Blob(["hello world"], { type: "text/plain" });
    const file = new File([blob], "test.csv", { type: "text/plain" });
    const text = await readFileAsText(file);
    expect(text).toBe("hello world");
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
