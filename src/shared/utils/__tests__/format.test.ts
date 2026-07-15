// src/shared/utils/__tests__/format.test.ts
import { describe, it, expect } from "vitest";
import { formatRuntime, formatDateShort } from "../format";

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
