// src/shared/utils/__tests__/vaultStatus.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { STATUS_TO_UI, STATUS_TO_DB, toMs, timeAgo } from "../vaultStatus";
import type { WatchlistItem } from "~/shared/types";

describe("STATUS_TO_UI", () => {
  it("maps 'planned' → 'Planned'", () => {
    expect(STATUS_TO_UI["planned"]).toBe("Planned");
  });

  it("maps 'watching' → 'Watching'", () => {
    expect(STATUS_TO_UI["watching"]).toBe("Watching");
  });

  it("maps 'completed' → 'Completed'", () => {
    expect(STATUS_TO_UI["completed"]).toBe("Completed");
  });

  it("maps 'on_hold' → 'Plan to Watch'", () => {
    expect(STATUS_TO_UI["on_hold"]).toBe("Plan to Watch");
  });

  it("maps 'dropped' → 'Dropped'", () => {
    expect(STATUS_TO_UI["dropped"]).toBe("Dropped");
  });

  it("returns undefined for unknown status", () => {
    expect(STATUS_TO_UI["unknown"]).toBeUndefined();
  });
});

describe("STATUS_TO_DB", () => {
  it("maps 'Planned' → 'planned'", () => {
    expect(STATUS_TO_DB["Planned"]).toBe("planned");
  });

  it("maps 'Watching' → 'watching'", () => {
    expect(STATUS_TO_DB["Watching"]).toBe("watching");
  });

  it("maps 'Completed' → 'completed'", () => {
    expect(STATUS_TO_DB["Completed"]).toBe("completed");
  });

  it("maps 'Plan to Watch' → 'planned'", () => {
    expect(STATUS_TO_DB["Plan to Watch"]).toBe("planned");
  });

  it("maps 'Dropped' → 'dropped'", () => {
    expect(STATUS_TO_DB["Dropped"]).toBe("dropped");
  });

  it("covers all WatchlistItem status values", () => {
    const statuses: WatchlistItem["status"][] = [
      "Planned",
      "Watching",
      "Completed",
      "Plan to Watch",
      "Dropped",
    ];
    for (const s of statuses) {
      expect(STATUS_TO_DB[s]).toBeDefined();
    }
  });
});

describe("toMs", () => {
  it("returns 0 for falsy values", () => {
    expect(toMs(null)).toBe(0);
    expect(toMs(undefined)).toBe(0);
    expect(toMs("")).toBe(0);
    expect(toMs(0)).toBe(0);
  });

  it("returns the number directly for numeric input", () => {
    expect(toMs(123456789)).toBe(123456789);
  });

  it("parses ISO string to milliseconds", () => {
    const result = toMs("2024-06-01T00:00:00Z");
    expect(result).toBe(new Date("2024-06-01T00:00:00Z").getTime());
  });

  it("returns 0 for invalid date string", () => {
    expect(toMs("not-a-date")).toBe(0);
  });

  it("returns getTime() for Date object", () => {
    const date = new Date("2024-06-01");
    expect(toMs(date)).toBe(date.getTime());
  });

  it("handles Firestore timestamp { seconds }", () => {
    expect(toMs({ seconds: 1700000000 })).toBe(1700000000 * 1000);
  });

  it("returns 0 for unknown object shape", () => {
    expect(toMs({ foo: "bar" })).toBe(0);
  });
});

describe("timeAgo", () => {
  beforeEach(() => {
    // Fix Date.now to 2024-06-01T00:00:00Z for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty string for falsy input", () => {
    expect(timeAgo(null)).toBe("");
    expect(timeAgo(undefined)).toBe("");
    expect(timeAgo("")).toBe("");
  });

  it("returns 'just now' for < 1 minute ago", () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe("just now");
  });

  it("returns 'Xm ago' for minutes", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(timeAgo(fiveMinAgo)).toBe("5m ago");
  });

  it("returns 'Xh ago' for hours", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60000).toISOString();
    expect(timeAgo(threeHoursAgo)).toBe("3h ago");
  });

  it("returns 'Xd ago' for days", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60000).toISOString();
    expect(timeAgo(twoDaysAgo)).toBe("2d ago");
  });

  it("returns 'Xw ago' for weeks", () => {
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60000).toISOString();
    expect(timeAgo(threeWeeksAgo)).toBe("3w ago");
  });

  it("returns 'Xmo ago' for months", () => {
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60000).toISOString();
    expect(timeAgo(twoMonthsAgo)).toBe("2mo ago");
  });

  it("returns 'Xy ago' for years", () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60000).toISOString();
    expect(timeAgo(twoYearsAgo)).toBe("2y ago");
  });

  it("accepts Date object", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60000);
    expect(timeAgo(oneHourAgo)).toBe("1h ago");
  });

  it("accepts Firestore timestamp", () => {
    const oneHourAgoSeconds = Math.floor((Date.now() - 60 * 60000) / 1000);
    expect(timeAgo({ seconds: oneHourAgoSeconds })).toBe("1h ago");
  });
});
