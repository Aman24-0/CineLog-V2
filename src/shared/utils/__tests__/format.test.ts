// src/shared/utils/__tests__/format.test.ts
import { describe, it, expect } from "vitest";
import { formatRuntime, formatDateShort, formatDateLong, formatVoteCount } from "../format";

describe("formatRuntime", () => {
  it("returns null for undefined", () => {
    expect(formatRuntime(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(formatRuntime(null)).toBeNull();
  });

  it("returns null for 0", () => {
    expect(formatRuntime(0)).toBeNull();
  });

  it("returns null for negative", () => {
    expect(formatRuntime(-10)).toBeNull();
  });

  it("formats minutes only when < 60", () => {
    expect(formatRuntime(45)).toBe("45m");
  });

  it("formats hours only when exact multiple of 60", () => {
    expect(formatRuntime(120)).toBe("2h");
  });

  it("formats hours + minutes", () => {
    expect(formatRuntime(90)).toBe("1h 30m");
  });

  it("formats 60 minutes as 1h", () => {
    expect(formatRuntime(60)).toBe("1h");
  });

  it("formats 150 minutes as 2h 30m", () => {
    expect(formatRuntime(150)).toBe("2h 30m");
  });
});

describe("formatDateShort", () => {
  it("returns null for undefined", () => {
    expect(formatDateShort(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(formatDateShort(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(formatDateShort("")).toBeNull();
  });

  it("formats a valid ISO date string", () => {
    const result = formatDateShort("2026-07-14T12:00:00Z");
    // Locale-dependent day/month but always includes year
    expect(result).toMatch(/2026$/);
  });

  it("formats a YYYY-MM-DD date string", () => {
    const result = formatDateShort("2026-02-12");
    expect(result).toMatch(/2026$/);
  });

  it("formats a Date object", () => {
    const d = new Date("2026-07-14");
    expect(formatDateShort(d)).toMatch(/2026$/);
  });

  it("returns the original string for an invalid date string", () => {
    expect(formatDateShort("not-a-date")).toBe("not-a-date");
  });

  it("returns null for an invalid Date object", () => {
    expect(formatDateShort(new Date("invalid"))).toBeNull();
  });
});

describe("formatDateLong", () => {
  it("returns null for undefined", () => {
    expect(formatDateLong(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(formatDateLong(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(formatDateLong("")).toBeNull();
  });

  it("formats a YYYY-MM-DD date string with full month name", () => {
    // September 1, 2000 — the example from the spec
    expect(formatDateLong("2000-09-01")).toBe("September 1, 2000");
  });

  it("formats an ISO datetime string with full month name", () => {
    expect(formatDateLong("2026-07-14T12:00:00Z")).toMatch(/^July 14, 2026$/);
  });

  it("formats a Date object", () => {
    const d = new Date("2026-02-12T00:00:00Z");
    expect(formatDateLong(d)).toMatch(/^February 12, 2026$/);
  });

  it("formats an epoch number", () => {
    // 2000-01-01T00:00:00Z = 946684800000 ms
    expect(formatDateLong(946684800000)).toMatch(/^January 1, 2000$/);
  });

  it("returns the original string for an invalid date string", () => {
    expect(formatDateLong("not-a-date")).toBe("not-a-date");
  });

  it("returns null for an invalid Date object", () => {
    expect(formatDateLong(new Date("invalid"))).toBeNull();
  });

  it("preserves the year at the end of the formatted string", () => {
    expect(formatDateLong("1999-12-31")).toMatch(/1999$/);
  });

  it("uses the long (full) month name, not the abbreviation", () => {
    const result = formatDateLong("2026-03-08");
    expect(result).toBe("March 8, 2026");
    // Guard against accidentally reverting to "Mar 8, 2026"
    expect(result?.startsWith("Mar ")).toBe(false);
  });
});

describe("formatVoteCount", () => {
  it("returns '0' for undefined", () => {
    expect(formatVoteCount(undefined)).toBe("0");
  });

  it("returns '0' for null", () => {
    expect(formatVoteCount(null)).toBe("0");
  });

  it("returns '0' for negative numbers", () => {
    expect(formatVoteCount(-5)).toBe("0");
  });

  it("returns '0' for NaN strings", () => {
    expect(formatVoteCount("not-a-number")).toBe("0");
  });

  it("returns '0' for zero", () => {
    expect(formatVoteCount(0)).toBe("0");
  });

  it("returns the number as-is for values under 1000", () => {
    expect(formatVoteCount(432)).toBe("432");
    expect(formatVoteCount(1)).toBe("1");
    expect(formatVoteCount(999)).toBe("999");
  });

  it("accepts string input (MDBList returns strings sometimes)", () => {
    expect(formatVoteCount("432")).toBe("432");
    expect(formatVoteCount("11000")).toBe("11K");
  });

  it("formats 1000 as '1K' (no trailing .0)", () => {
    expect(formatVoteCount(1000)).toBe("1K");
  });

  it("formats 1500 as '1.5K' (one decimal)", () => {
    expect(formatVoteCount(1500)).toBe("1.5K");
  });

  it("formats 8500 as '8.5K'", () => {
    expect(formatVoteCount(8500)).toBe("8.5K");
  });

  it("formats 11000 as '11K' (no decimal at tens of K)", () => {
    expect(formatVoteCount(11000)).toBe("11K");
  });

  it("formats 11500 as '12K' (rounds 11.5 up to 12)", () => {
    expect(formatVoteCount(11500)).toBe("12K");
  });

  it("formats 100000 as '100K'", () => {
    expect(formatVoteCount(100000)).toBe("100K");
  });

  it("formats 999999 as '1000K' (rounds up to 1000K)", () => {
    // 999999 / 1000 = 999.999 → rounds to 1000
    expect(formatVoteCount(999999)).toBe("1000K");
  });

  it("formats 1500000 as '1.5M'", () => {
    expect(formatVoteCount(1500000)).toBe("1.5M");
  });

  it("formats 1000000 as '1M' (no trailing .0)", () => {
    expect(formatVoteCount(1000000)).toBe("1M");
  });

  it("formats 2300000 as '2.3M'", () => {
    expect(formatVoteCount(2300000)).toBe("2.3M");
  });

  it("formats 100000000 as '100M'", () => {
    expect(formatVoteCount(100000000)).toBe("100M");
  });

  it("formats 1500000000 as '1.5B'", () => {
    expect(formatVoteCount(1500000000)).toBe("1.5B");
  });

  it("handles Infinity as '0' (defensive)", () => {
    expect(formatVoteCount(Infinity)).toBe("0");
  });
});
