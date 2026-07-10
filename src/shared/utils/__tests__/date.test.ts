// src/shared/utils/__tests__/date.test.ts
import { describe, it, expect } from "vitest";
import { resolveTimelineDate } from "../date";
import { makeWatchlistItem } from "~/__test-fixtures__/factories";
import type { WatchlistItem } from "~/shared/types";

describe("resolveTimelineDate", () => {
  it("returns watchDate when present and valid", () => {
    const item = makeWatchlistItem({ watchDate: "2024-06-15" });
    const result = resolveTimelineDate(item);
    expect(result).not.toBeNull();
    expect(result!.toISOString().startsWith("2024-06-15")).toBe(true);
  });

  it("ignores empty/whitespace watchDate", () => {
    const item = makeWatchlistItem({
      watchDate: "  ",
      addedAt: "2024-01-01T00:00:00Z",
    });
    const result = resolveTimelineDate(item);
    expect(result).not.toBeNull();
    expect(result!.toISOString().startsWith("2024-01-01")).toBe(true);
  });

  it("falls back to seasonDates.end (latest) when no watchDate", () => {
    const item = makeWatchlistItem({
      watchDate: undefined,
      seasonDates: {
        "1": { start: "2024-01-01", end: "2024-03-01" },
        "2": { start: "2024-05-01", end: "2024-07-01" },
      },
    });
    const result = resolveTimelineDate(item);
    expect(result).not.toBeNull();
    expect(result!.toISOString().startsWith("2024-07-01")).toBe(true);
  });

  it("falls back to seasonDates.start when no end dates", () => {
    const item = makeWatchlistItem({
      watchDate: undefined,
      seasonDates: {
        "1": { start: "2024-01-01", end: "" },
        "2": { start: "2024-05-01", end: "" },
      },
    });
    const result = resolveTimelineDate(item);
    expect(result).not.toBeNull();
    expect(result!.toISOString().startsWith("2024-05-01")).toBe(true);
  });

  it("falls back to addedAt (ISO string) when no watchDate or seasonDates", () => {
    const item = makeWatchlistItem({
      watchDate: undefined,
      seasonDates: undefined,
      addedAt: "2024-06-01T12:00:00Z",
    });
    const result = resolveTimelineDate(item);
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2024-06-01T12:00:00.000Z");
  });

  it("handles Firestore timestamp object { seconds, nanoseconds }", () => {
    const item = makeWatchlistItem({
      watchDate: undefined,
      addedAt: { seconds: 1700000000, nanoseconds: 500000000 },
    });
    const result = resolveTimelineDate(item);
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBe(1700000000 * 1000 + 500);
  });

  it("handles Date object as addedAt", () => {
    const date = new Date("2024-06-01T00:00:00Z");
    const item = makeWatchlistItem({
      watchDate: undefined,
      addedAt: date,
    });
    const result = resolveTimelineDate(item);
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBe(date.getTime());
  });

  it("returns null when no date sources available", () => {
    const item = makeWatchlistItem({
      watchDate: undefined,
      seasonDates: undefined,
      addedAt: undefined,
    });
    expect(resolveTimelineDate(item)).toBeNull();
  });

  it("returns null for invalid date strings", () => {
    const item = makeWatchlistItem({
      watchDate: "not-a-date",
      seasonDates: undefined,
      addedAt: "also-not-a-date",
    });
    expect(resolveTimelineDate(item)).toBeNull();
  });

  it("prefers watchDate over seasonDates and addedAt", () => {
    const item = makeWatchlistItem({
      watchDate: "2024-06-15",
      seasonDates: { "1": { start: "2024-01-01", end: "2024-03-01" } },
      addedAt: "2024-01-01T00:00:00Z",
    });
    const result = resolveTimelineDate(item);
    expect(result!.toISOString().startsWith("2024-06-15")).toBe(true);
  });

  it("handles invalid Date object (NaN)", () => {
    const item = makeWatchlistItem({
      watchDate: undefined,
      seasonDates: undefined,
      addedAt: new Date("invalid"),
    });
    expect(resolveTimelineDate(item)).toBeNull();
  });
});
