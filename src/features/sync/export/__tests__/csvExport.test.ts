import { describe, expect, it } from "vitest";
import type { WatchlistItem } from "~/shared/types";
import {
  TRAKT_CSV_HEADERS,
  TRAKT_UNKNOWN_WATCHED_AT,
  watchlistToCsv
} from "../csvExport";

function item(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: "27205",
    title: "Inception",
    media_type: "movie",
    status: "Planned",
    ...overrides
  };
}

function traktRows(items: WatchlistItem[]): string[][] {
  return watchlistToCsv(items, { format: "trakt" })
    .split("\n")
    .slice(1)
    .filter(Boolean)
    .map((row) => row.split(","));
}

describe("watchlistToCsv — Trakt export", () => {
  it("uses Trakt-compatible lower-case headers in the required order", () => {
    const [header] = watchlistToCsv([], { format: "trakt" }).split("\n");

    expect(header.split(",")).toEqual(TRAKT_CSV_HEADERS);
    expect(header).not.toContain("Title");
    expect(header).not.toContain("Status");
  });

  it("exports a movie with its CineLog TMDB ID as tmdb_id", () => {
    const [row] = traktRows([
      item({ id: "27205", addedAt: "2026-01-01T12:00:00Z" })
    ]);

    expect(row).toEqual([
      "27205",
      "",
      "",
      "",
      "movie",
      "",
      "2026-01-01T12:00:00.000Z",
      "",
      ""
    ]);
  });

  it("uses an IMDb ID when a legacy item has no valid TMDB ID", () => {
    const [row] = traktRows([
      item({
        id: "cinelog-vault-uuid-not-an-external-id",
        externalIds: { imdb: "tt0133093" }
      })
    ]);

    expect(row[0]).toBe("");
    expect(row[1]).toBe("tt0133093");
    expect(row[2]).toBe("");
  });

  it("never treats a CineLog-internal ID as a Trakt ID", () => {
    const [row] = traktRows([
      item({ id: "vault-9f8f1b66", externalIds: { trakt: "123456" } })
    ]);

    expect(row[0]).toBe("");
    expect(row[2]).toBe("123456");
  });

  it("preserves all stored supported external IDs alongside TMDB", () => {
    const [row] = traktRows([
      item({
        externalIds: {
          imdb: "tt0133093",
          trakt: "481",
          tvdb: "81189"
        }
      })
    ]);

    expect(row.slice(0, 4)).toEqual(["27205", "tt0133093", "481", "81189"]);
  });

  it("maps TV records to Trakt show type", () => {
    const [row] = traktRows([
      item({ id: "1396", media_type: "tv", name: "Breaking Bad" })
    ]);

    expect(row[0]).toBe("1396");
    expect(row[4]).toBe("show");
  });

  it("exports an exact completed watch date as ISO 8601", () => {
    const [row] = traktRows([
      item({ status: "Completed", watchDate: "2026-01-10T20:00:00Z" })
    ]);

    expect(row[5]).toBe("2026-01-10T20:00:00.000Z");
  });

  it("uses the Trakt-supported unknown-date sentinel when completed has no date", () => {
    const [row] = traktRows([item({ status: "Completed" })]);

    expect(row[5]).toBe(TRAKT_UNKNOWN_WATCHED_AT);
  });

  it("does not turn planned, watching, or dropped items into watched history", () => {
    const rows = traktRows([
      item({ status: "Planned" }),
      item({ id: "2", status: "Watching" }),
      item({ id: "3", status: "Dropped" })
    ]);

    expect(rows.map((row) => row[5])).toEqual(["", "", ""]);
  });

  it("maps planned state to watchlisted_at using the actual added timestamp", () => {
    const [row] = traktRows([
      item({ addedAt: "2026-01-01T12:00:00Z", status: "Plan to Watch" })
    ]);

    expect(row[6]).toBe("2026-01-01T12:00:00.000Z");
  });

  it("leaves watchlisted_at blank when no actual addition date is stored", () => {
    const [row] = traktRows([item({ addedAt: undefined, status: "Planned" })]);

    expect(row[6]).toBe("");
  });

  it("preserves a valid 1–10 user rating without inventing rated_at", () => {
    const [row] = traktRows([item({ rating: 8 })]);

    expect(row[7]).toBe("8");
    expect(row[8]).toBe("");
  });

  it("preserves legacy numeric-string ratings from persisted data", () => {
    const [row] = traktRows([
      item({ rating: "6.0" as unknown as number })
    ]);

    expect(row[7]).toBe("6");
  });

  it("preserves rating and watched state together", () => {
    const [row] = traktRows([
      item({
        rating: 9,
        status: "Completed",
        watchDate: "2026-03-01T10:30:00+05:30"
      })
    ]);

    expect(row[5]).toBe("2026-03-01T05:00:00.000Z");
    expect(row[7]).toBe("9");
  });

  it("leaves absent, zero, fractional, and out-of-range ratings blank", () => {
    const rows = traktRows([
      item({ id: "1", rating: undefined }),
      item({ id: "2", rating: 0 }),
      item({ id: "3", rating: 5.5 }),
      item({ id: "4", rating: 11 })
    ]);

    expect(rows.map((row) => row[7])).toEqual(["", "", "", ""]);
  });

  it("merges watched, watchlisted, and rated data from duplicate source records", () => {
    const rows = traktRows([
      item({
        id: "200",
        status: "Completed",
        watchDate: "2026-02-01T20:00:00Z",
        rating: 8
      }),
      item({
        id: "200",
        status: "Planned",
        addedAt: "2025-12-15T09:00:00Z"
      })
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0][5]).toBe("2026-02-01T20:00:00.000Z");
    expect(rows[0][6]).toBe("2025-12-15T09:00:00.000Z");
    expect(rows[0][7]).toBe("8");
  });

  it("keeps legitimate stored rewatches as separate history rows", () => {
    const rows = traktRows([
      item({
        status: "Completed",
        watchDate: "2024-01-01T00:00:00Z",
        rewatchDates: [
          "2024-01-01T00:00:00Z",
          "2025-01-01T00:00:00Z"
        ],
        rating: 7
      })
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row[5])).toEqual([
      "2024-01-01T00:00:00.000Z",
      "2025-01-01T00:00:00.000Z"
    ]);
    expect(rows.map((row) => row[7])).toEqual(["7", ""]);
  });

  it("skips rows without a supported external ID instead of fabricating an identity", () => {
    const csv = watchlistToCsv(
      [item({ id: "not-a-tmdb-id", externalIds: undefined })],
      { format: "trakt" }
    );

    expect(csv.split("\n")).toHaveLength(1);
  });

  it("does not manufacture episode rows from show-level progress coordinates", () => {
    const [row] = traktRows([
      item({
        id: "1396",
        media_type: "tv",
        status: "Watching",
        season: 2,
        episode: 4,
        watchProgress: {
          currentTime: 0,
          duration: 0,
          season: 2,
          episode: 4,
          updatedAt: "2026-02-01T20:00:00Z"
        }
      })
    ]);

    expect(row[4]).toBe("show");
    expect(row[5]).toBe("");
  });

  it("RFC 4180-escapes comma and quote characters in an external ID cell", () => {
    const csv = watchlistToCsv(
      [item({ externalIds: { imdb: 'tt"42,example' } })],
      { format: "trakt" }
    );

    expect(csv).toContain('27205,"tt""42,example"');
  });

  it("retains generic-export title escaping so other export formats are unchanged", () => {
    const csv = watchlistToCsv(
      [item({ title: 'A title, with "quotes"' })],
      { format: "generic" }
    );

    expect(csv).toContain('"A title, with ""quotes"""');
  });
});
