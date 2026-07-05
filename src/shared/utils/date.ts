// src/shared/utils/date.ts
import type { WatchlistItem } from "~/shared/types";

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
  if (m.addedAt) {
    if (m.addedAt instanceof Date) return m.addedAt;
    if (typeof m.addedAt === "string") {
      const d = new Date(m.addedAt);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
};
