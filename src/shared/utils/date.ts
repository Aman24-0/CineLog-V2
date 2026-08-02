// src/shared/utils/date.ts
import type { WatchlistItem } from "~/shared/types";

/**
 * Format an ISO timestamp as a human-friendly relative string.
 *
 *   < 1 min  → "just now"
 *   < 60 min → "5m ago"
 *   < 24 h   → "3h ago"
 *   < 7 d    → "2d ago"
 *   < 4 w    → "1w ago"
 *   < 1 y    → "Mar 14"  (no year — same-year dates omit it)
 *   ≥ 1 y    → "Mar 14, 2024"
 *
 * Used by the activity FeedItem to render "watched 3h ago" / "added
 * 2d ago" without taking too much horizontal space.
 *
 * Returns null when the input is missing or unparseable so callers
 * can fall back to a literal date or skip the timestamp entirely.
 *
 * @example formatRelativeTime("2026-08-02T10:00:00Z")  → "just now" (if now)
 * @example formatRelativeTime("2026-08-01T10:00:00Z")  → "1d ago"
 * @example formatRelativeTime(undefined)                → null
 */
export function formatRelativeTime(
  input: string | number | Date | null | undefined,
  now: Date = new Date()
): string | null {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return null;

  const diffMs = now.getTime() - d.getTime();
  // Future timestamps (clock skew) — clamp to 0 so we don't show
  // negative durations.
  const pastMs = Math.max(0, diffMs);

  const SEC = 1000;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const YEAR = 365 * DAY;

  if (pastMs < MIN) return "just now";
  if (pastMs < HOUR) {
    const m = Math.floor(pastMs / MIN);
    return `${m}m ago`;
  }
  if (pastMs < DAY) {
    const h = Math.floor(pastMs / HOUR);
    return `${h}h ago`;
  }
  if (pastMs < WEEK) {
    const d2 = Math.floor(pastMs / DAY);
    return `${d2}d ago`;
  }
  if (pastMs < 4 * WEEK) {
    const w = Math.floor(pastMs / WEEK);
    return `${w}w ago`;
  }
  if (pastMs < YEAR) {
    // Same-year dates omit the year.
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

// Firestore returns timestamps as { seconds, nanoseconds } objects (or as
// Timestamp instances which expose the same shape). Normalize any of those,
// plus Date / ISO string, to a JS Date — or null if not parseable.
const toDate = (value: WatchlistItem["addedAt"]): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(
      value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6)
    );
  }
  return null;
};

export const resolveTimelineDate = (m: WatchlistItem): Date | null => {
  if (m.watchDate && typeof m.watchDate === "string" && m.watchDate.trim()) {
    const d = new Date(m.watchDate);
    if (!isNaN(d.getTime())) return d;
  }
  // Collect all candidate dates from seasonDates + seasonRewatchDates.
  // For series, the timeline should reflect the LAST date the user set
  // — which is the latest end date across all seasons and re-watches.
  const candidates: Date[] = [];
  if (m.seasonDates && typeof m.seasonDates === "object") {
    for (const entry of Object.values(m.seasonDates)) {
      if (entry?.end) {
        const d = new Date(entry.end);
        if (!isNaN(d.getTime())) candidates.push(d);
      }
      if (entry?.start) {
        const d = new Date(entry.start);
        if (!isNaN(d.getTime())) candidates.push(d);
      }
    }
  }
  if (Array.isArray(m.seasonRewatchDates)) {
    for (const pass of m.seasonRewatchDates) {
      if (pass && typeof pass === "object") {
        for (const entry of Object.values(pass)) {
          if (entry?.end) {
            const d = new Date(entry.end);
            if (!isNaN(d.getTime())) candidates.push(d);
          }
          if (entry?.start) {
            const d = new Date(entry.start);
            if (!isNaN(d.getTime())) candidates.push(d);
          }
        }
      }
    }
  }
  if (candidates.length > 0) {
    return new Date(Math.max(...candidates.map((d) => d.getTime())));
  }
  return toDate(m.addedAt);
};
