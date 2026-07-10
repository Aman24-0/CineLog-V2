// src/features/collections/components/timelineSort.ts
import { findInVault } from "~/shared/utils/vaultMatch";
import type {
  CollectionEntry,
  ViewingOrder,
  WatchlistItem,
} from "~/shared/types";

/**
 * timelineSort — pure sorting + grouping helpers for TimelineEngine.
 *
 * Extracted from TimelineEngine.tsx to keep that file under the 250-line
 * limit. All functions are pure (no signals, no side effects).
 */

export interface TimelineItem {
  entry: CollectionEntry;
  vaultItem: WatchlistItem | null;
  inVault: boolean;
  status: string | null;
  rating: number | null;
}

/** Sort entries based on the viewing order, then enrich with vault status. */
export function sortAndEnrich(
  entries: CollectionEntry[],
  vault: WatchlistItem[],
  order: ViewingOrder,
): TimelineItem[] {
  const sorted = [...entries];

  switch (order) {
    case "release":
      sorted.sort((a, b) => {
        const dateA = a.release_date || a.first_air_date || "";
        const dateB = b.release_date || b.first_air_date || "";
        return dateA.localeCompare(dateB);
      });
      break;
    case "chronological":
      // Use the curated order (default from data)
      sorted.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      break;
    case "saga":
      sorted.sort((a, b) => {
        const phaseA = a.phase ?? "Other";
        const phaseB = b.phase ?? "Other";
        if (phaseA !== phaseB) return phaseA.localeCompare(phaseB);
        return (a.order ?? 0) - (b.order ?? 0);
      });
      break;
    case "story":
      sorted.sort((a, b) => {
        const yearA = a.storyYear ?? 9999;
        const yearB = b.storyYear ?? 9999;
        if (yearA !== yearB) return yearA - yearB;
        return (a.order ?? 0) - (b.order ?? 0);
      });
      break;
    case "custom":
      sorted.sort((a, b) => {
        // Pinned items first
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (a.customOrder ?? a.order ?? 0) - (b.customOrder ?? b.order ?? 0);
      });
      break;
  }

  return sorted.map((e) => {
    const vaultItem = findInVault(vault, { id: e.id, media_type: e.media_type });
    return {
      entry: e,
      vaultItem,
      inVault: vaultItem !== null,
      status: vaultItem?.status ?? null,
      rating: vaultItem?.rating ?? null,
    };
  });
}

/** Group entries by phase (for saga mode). Returns null when order isn't "saga". */
export function groupByPhase(
  items: TimelineItem[],
  order: ViewingOrder,
): { phase: string; items: TimelineItem[] }[] | null {
  if (order !== "saga") return null;
  const groups: { phase: string; items: TimelineItem[] }[] = [];
  let current: { phase: string; items: TimelineItem[] } | null = null;
  for (const item of items) {
    const phase = item.entry.phase ?? "Other";
    if (!current || current.phase !== phase) {
      current = { phase, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}

/** Group entries by story year (for story mode). Returns null when order isn't "story". */
export function groupByStoryYear(
  items: TimelineItem[],
  order: ViewingOrder,
): { yearLabel: string; items: TimelineItem[] }[] | null {
  if (order !== "story") return null;
  const groups: { yearLabel: string; items: TimelineItem[] }[] = [];
  let current: { yearLabel: string; items: TimelineItem[] } | null = null;
  for (const item of items) {
    const sy = item.entry.storyYear;
    let yearLabel: string;
    if (sy === undefined || sy === null) {
      yearLabel = "Unknown";
    } else if (sy < 0) {
      yearLabel = `${Math.abs(sy)} BBY`;
    } else if (sy === 0) {
      yearLabel = "0 BBY / ABY";
    } else {
      yearLabel = `${sy} ABY`;
    }
    // For non-Star-Wars, use regular year format
    if (sy !== undefined && sy !== null && sy > 1800) {
      yearLabel = `${sy}`;
    }
    if (!current || current.yearLabel !== yearLabel) {
      current = { yearLabel, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}
