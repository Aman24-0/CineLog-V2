// src/shared/utils/__tests__/relativeTime.test.ts
//
// Unit tests for the formatRelativeTime helper added in src/shared/utils/date.ts.
// Covers all the boundary cases (just now, m/h/d/w, calendar fallback,
// invalid input) so the FeedItem timestamp rendering is predictable.

import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "../date";

describe("formatRelativeTime", () => {
  // Use a fixed "now" so the tests are deterministic across runs.
  const NOW = new Date("2026-08-02T12:00:00Z");

  it("returns null for null/undefined/empty input", () => {
    expect(formatRelativeTime(null, NOW)).toBeNull();
    expect(formatRelativeTime(undefined, NOW)).toBeNull();
    expect(formatRelativeTime("", NOW)).toBeNull();
  });

  it("returns null for unparseable strings", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBeNull();
    expect(formatRelativeTime("2026-13-99", NOW)).toBeNull();
  });

  it("returns 'just now' for timestamps < 1 minute ago", () => {
    expect(formatRelativeTime(NOW.toISOString(), NOW)).toBe("just now");
    expect(
      formatRelativeTime(new Date(NOW.getTime() - 30_000).toISOString(), NOW)
    ).toBe("just now");
    expect(
      formatRelativeTime(new Date(NOW.getTime() - 59_999).toISOString(), NOW)
    ).toBe("just now");
  });

  it("returns 'Xm ago' for timestamps < 1 hour ago", () => {
    expect(
      formatRelativeTime(new Date(NOW.getTime() - 60_000).toISOString(), NOW)
    ).toBe("1m ago");
    expect(
      formatRelativeTime(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)
    ).toBe("5m ago");
    expect(
      formatRelativeTime(
        new Date(NOW.getTime() - 59 * 60_000).toISOString(),
        NOW
      )
    ).toBe("59m ago");
  });

  it("returns 'Xh ago' for timestamps < 1 day ago", () => {
    expect(
      formatRelativeTime(new Date(NOW.getTime() - 60 * 60_000).toISOString(), NOW)
    ).toBe("1h ago");
    expect(
      formatRelativeTime(
        new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString(),
        NOW
      )
    ).toBe("3h ago");
    expect(
      formatRelativeTime(
        new Date(NOW.getTime() - 23 * 60 * 60_000).toISOString(),
        NOW
      )
    ).toBe("23h ago");
  });

  it("returns 'Xd ago' for timestamps < 1 week ago", () => {
    expect(
      formatRelativeTime(
        new Date(NOW.getTime() - 24 * 60 * 60_000).toISOString(),
        NOW
      )
    ).toBe("1d ago");
    expect(
      formatRelativeTime(
        new Date(NOW.getTime() - 3 * 24 * 60 * 60_000).toISOString(),
        NOW
      )
    ).toBe("3d ago");
    expect(
      formatRelativeTime(
        new Date(NOW.getTime() - 6 * 24 * 60 * 60_000).toISOString(),
        NOW
      )
    ).toBe("6d ago");
  });

  it("returns 'Xw ago' for timestamps < 4 weeks ago", () => {
    expect(
      formatRelativeTime(
        new Date(NOW.getTime() - 7 * 24 * 60 * 60_000).toISOString(),
        NOW
      )
    ).toBe("1w ago");
    expect(
      formatRelativeTime(
        new Date(NOW.getTime() - 3 * 7 * 24 * 60 * 60_000).toISOString(),
        NOW
      )
    ).toBe("3w ago");
  });

  it("returns 'MMM d' (no year) for same-year timestamps older than 4 weeks", () => {
    // 60 days ago = ~June 3, 2026
    const result = formatRelativeTime(
      new Date(NOW.getTime() - 60 * 24 * 60 * 60_000).toISOString(),
      NOW
    );
    // The exact day depends on DST/timezone, but it should start with "Jun".
    expect(result).toMatch(/^Jun \d+$/);
  });

  it("returns 'MMM d, YYYY' for timestamps older than 1 year", () => {
    // 400 days ago = ~June 28, 2025
    const result = formatRelativeTime(
      new Date(NOW.getTime() - 400 * 24 * 60 * 60_000).toISOString(),
      NOW
    );
    expect(result).toMatch(/^Jun \d+, 2025$/);
  });

  it("clamps future timestamps to 'just now' (clock skew tolerance)", () => {
    // 30 seconds in the future — could happen with NTP drift.
    expect(
      formatRelativeTime(
        new Date(NOW.getTime() + 30_000).toISOString(),
        NOW
      )
    ).toBe("just now");
  });

  it("accepts Date objects directly", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe(
      "5m ago"
    );
  });

  it("accepts epoch milliseconds", () => {
    expect(formatRelativeTime(NOW.getTime() - 5 * 60_000, NOW)).toBe(
      "5m ago"
    );
  });
});
