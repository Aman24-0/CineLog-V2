// src/features/discover/hooks/__tests__/usePersonalizedDiscover.test.ts
import { describe, it, expect } from "vitest";
import {
  fnv1aHash,
  todayDateString,
  formatTopGenreLabel
} from "../usePersonalizedDiscover";

describe("fnv1aHash", () => {
  it("returns a non-negative 32-bit integer", () => {
    const hash = fnv1aHash("test-string");
    expect(typeof hash).toBe("number");
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  it("is deterministic — same input → same output", () => {
    const a = fnv1aHash("2026-07-27:user-123:5");
    const b = fnv1aHash("2026-07-27:user-123:5");
    expect(a).toBe(b);
  });

  it("differs for different inputs", () => {
    // Two different days for the same user should produce different
    // hashes (this is the daily-rotation guarantee).
    const day1 = fnv1aHash("2026-07-27:user-123:5");
    const day2 = fnv1aHash("2026-07-28:user-123:5");
    expect(day1).not.toBe(day2);
  });

  it("differs for different users on the same day", () => {
    const user1 = fnv1aHash("2026-07-27:user-A:5");
    const user2 = fnv1aHash("2026-07-27:user-B:5");
    expect(user1).not.toBe(user2);
  });

  it("produces a valid modulo index for any candidate count", () => {
    // The Discover page picks a seed via `hash % candidateCount`. For
    // any candidateCount >= 1, the result must be a valid index.
    const hash = fnv1aHash("any-input");
    for (let count = 1; count <= 50; count++) {
      const idx = hash % count;
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(count);
    }
  });

  it("returns a stable value for the empty string", () => {
    // FNV-1a of "" is the offset basis (non-zero). We just assert
    // it's stable and non-negative.
    const empty = fnv1aHash("");
    expect(empty).toBeGreaterThanOrEqual(0);
    expect(fnv1aHash("")).toBe(empty);
  });
});

describe("todayDateString", () => {
  it("returns a YYYY-MM-DD formatted string", () => {
    const today = todayDateString();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("pads month and day with leading zeros", () => {
    const today = todayDateString();
    const [, month, day] = today.split("-");
    expect(month).toHaveLength(2);
    expect(day).toHaveLength(2);
  });

  it("matches the current local date", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(todayDateString()).toBe(expected);
  });
});

describe("formatTopGenreLabel", () => {
  it("formats a genre name into the 'Trending in {Genre}' label", () => {
    expect(formatTopGenreLabel("Action")).toBe("Trending in Action");
    expect(formatTopGenreLabel("Sci-Fi")).toBe("Trending in Sci-Fi");
    expect(formatTopGenreLabel("Comedy")).toBe("Trending in Comedy");
  });

  it("returns an empty string for null", () => {
    expect(formatTopGenreLabel(null)).toBe("");
  });

  it("handles multi-word genre names", () => {
    expect(formatTopGenreLabel("Action & Adventure")).toBe(
      "Trending in Action & Adventure"
    );
    expect(formatTopGenreLabel("Science Fiction")).toBe(
      "Trending in Science Fiction"
    );
  });
});
