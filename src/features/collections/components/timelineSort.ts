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

/** Sort entries based on the viewing order, then enrich with vault status.
 *
 * Three unified orders (used by BOTH admin + consumer UI):
 *   - "story"     → sort by entry.storyOrder (DB story_position). Falls
 *                   back to entry.order if storyOrder is missing (legacy
 *                   user collections that don't have separate story indices).
 *                   Legacy "chronological" maps here too.
 *   - "release"   → sort by release_date / first_air_date string. Falls
 *                   back to entry.releaseOrder when dates are missing.
 *   - "franchise" → group by entry.franchise (derived from title), then
 *                   sort within each group by storyOrder. The grouping
 *                   itself is applied in TimelineEngine via groupByFranchise().
 *                   Here we just sort by (franchise, storyOrder) so the
 *                   entries arrive pre-grouped for the renderer.
 *
 * Legacy orders ("saga", "custom", "chronological") are preserved for
 * backward-compat with existing user preferences but no longer exposed
 * in the UI. They map onto "story" semantics.
 */
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
        if (dateA && dateB && dateA !== dateB) return dateA.localeCompare(dateB);
        // Tiebreaker: releaseOrder (DB release_position), then admin order.
        const ra = a.releaseOrder ?? a.order ?? 0;
        const rb = b.releaseOrder ?? b.order ?? 0;
        if (ra !== rb) return ra - rb;
        return (a.order ?? 0) - (b.order ?? 0);
      });
      break;
    case "franchise":
      // Pre-sort by (franchise, storyOrder) so groupByFranchise can
      // walk a single pass and build consecutive groups.
      sorted.sort((a, b) => {
        const fa = a.franchise ?? "Standalone & Other";
        const fb = b.franchise ?? "Standalone & Other";
        if (fa !== fb) return fa.localeCompare(fb);
        const sa = a.storyOrder ?? a.order ?? 0;
        const sb = b.storyOrder ?? b.order ?? 0;
        if (sa !== sb) return sa - sb;
        return (a.order ?? 0) - (b.order ?? 0);
      });
      break;
    case "story":
    case "chronological":
    default:
      // Storyline order. Use the DB story_position if present; otherwise
      // fall back to the admin's primary position. The legacy
      // "chronological" case is kept so old preferences continue to work.
      sorted.sort((a, b) => {
        const sa = a.storyOrder ?? a.order ?? 0;
        const sb = b.storyOrder ?? b.order ?? 0;
        if (sa !== sb) return sa - sb;
        return (a.order ?? 0) - (b.order ?? 0);
      });
      break;
    case "saga":
      // Legacy saga grouping — sort by phase then storyOrder. Kept for
      // backward-compat with old preferences rows; the UI no longer
      // exposes this option.
      sorted.sort((a, b) => {
        const phaseA = a.phase ?? "Other";
        const phaseB = b.phase ?? "Other";
        if (phaseA !== phaseB) return phaseA.localeCompare(phaseB);
        return (a.storyOrder ?? a.order ?? 0) - (b.storyOrder ?? b.order ?? 0);
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

/** Group entries by franchise (for the "franchise" viewing order).
 *  Returns null when order isn't "franchise". */
export function groupByFranchise(
  items: TimelineItem[],
  order: ViewingOrder,
): { franchise: string; items: TimelineItem[] }[] | null {
  if (order !== "franchise") return null;
  const groups: { franchise: string; items: TimelineItem[] }[] = [];
  let current: { franchise: string; items: TimelineItem[] } | null = null;
  for (const item of items) {
    const f = item.entry.franchise ?? "Standalone & Other";
    if (!current || current.franchise !== f) {
      current = { franchise: f, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
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
