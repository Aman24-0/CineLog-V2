// src/shared/utils/date.ts
import type { WatchlistItem } from "~/shared/types";

// Firestore returns timestamps as { seconds, nanoseconds } objects (or as
// Timestamp instances which expose the same shape). Normalize any of those,
// plus Date / ISO string, to a JS Date — or null if not parseable.
const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
  }
  return null;
};

export const resolveTimelineDate = (m: WatchlistItem): Date | null => {
  if (m.watchDate && typeof m.watchDate === "string" && m.watchDate.trim()) {
    const d = new Date(m.watchDate);
    if (!isNaN(d.getTime())) return d;
  }
  if (m.seasonDates && typeof m.seasonDates === "object") {
    const ends = Object.values(m.seasonDates)
      .map((s) => (s?.end ? new Date(s.end) : null))
      .filter((d) => d && !isNaN(d.getTime())) as Date[];
    if (ends.length > 0) return new Date(Math.max(...ends.map((d) => d.getTime())));
    const starts = Object.values(m.seasonDates)
      .map((s) => (s?.start ? new Date(s.start) : null))
      .filter((d) => d && !isNaN(d.getTime())) as Date[];
    if (starts.length > 0) return new Date(Math.max(...starts.map((d) => d.getTime())));
  }
  return toDate(m.addedAt);
};
