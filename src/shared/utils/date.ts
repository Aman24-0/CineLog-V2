// src/shared/utils/date.ts
import type { WatchlistItem } from "~/shared/types";

// Normalize a WatchlistItem date field to a JS Date, or null if not parseable.
// Handles: Date instances, ISO strings, and Firestore-style { seconds, nanoseconds }
// objects (kept for backward compatibility with imported V1 backup data).
const toDate = (value: WatchlistItem["addedAt"]): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  // Firestore Timestamp shape — only present in data imported from V1 backups.
  // The `seconds` brand check prevents misinterpreting random JSON objects.
  if (typeof value === "object" && typeof value.seconds === "number" && "nanoseconds" in value) {
    return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
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
