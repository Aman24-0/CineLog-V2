// src/shared/utils/__tests__/format.test.ts
import { describe, it, expect } from "vitest";
import { formatRuntime } from "../format";

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
