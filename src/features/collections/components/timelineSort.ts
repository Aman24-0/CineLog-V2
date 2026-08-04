// src/features/collections/components/timelineSort.ts
import { findInVault } from "~/shared/utils/vaultMatch";
import type {
  CollectionEntry,
  ViewingOrder,
  WatchlistItem
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
 *   - "story"     → sort by entry.incidentYear (the in-universe "year of
 *                   incident" set by the admin, e.g. 1943 for Captain
 *                   America: The First Avenger, 1995 for Captain Marvel).
 *                   Lower year = earlier in the timeline. Entries with
 *                   no incidentYear fall back to storyOrder, then to
 *                   admin's primary `order`.
 *                   Legacy "chronological" maps here too.
 *   - "release"   → sort by release_date / first_air_date string. Falls
 *                   back to entry.releaseOrder when dates are missing.
 *   - "franchise" → group by entry.franchise (derived from title), then
 *                   sort within each group by incidentYear (or storyOrder
 *                   as fallback). The grouping itself is applied in
 *                   TimelineEngine via groupByFranchise().
 *                   Here we just sort by (franchise, incidentYear) so the
 *                   entries arrive pre-grouped for the renderer.
 *
 * Legacy orders ("saga", "custom", "chronological") are preserved for
 * backward-compat with existing user preferences but no longer exposed
 * in the UI. They map onto "story" semantics.
 */
export function sortAndEnrich(
  entries: CollectionEntry[],
  vault: WatchlistItem[],
  order: ViewingOrder
): TimelineItem[] {
  const sorted = [...entries];

  switch (order) {
    case "release":
      sorted.sort((a, b) => {
        const dateA = a.release_date || a.first_air_date || "";
        const dateB = b.release_date || b.first_air_date || "";
        if (dateA && dateB && dateA !== dateB)
          return dateA.localeCompare(dateB);
        // Tiebreaker: admin's primary order (Phase 4 Task 6 dropped release_position).
        const ra = a.releaseOrder ?? a.order ?? 0;
        const rb = b.releaseOrder ?? b.order ?? 0;
        if (ra !== rb) return ra - rb;
        return (a.order ?? 0) - (b.order ?? 0);
      });
      break;
    case "franchise":
      // Pre-sort by (franchise, incidentYear, storyOrder) so groupByFranchise
      // can walk a single pass and build consecutive groups. Within each
      // franchise group, earlier in-universe incident years come first.
      sorted.sort((a, b) => {
        const fa = a.franchise ?? "Standalone & Other";
        const fb = b.franchise ?? "Standalone & Other";
        if (fa !== fb) return fa.localeCompare(fb);
        // Within a franchise: incidentYear first, then storyOrder fallback.
        const ia = a.incidentYear;
        const ib = b.incidentYear;
        if (ia !== undefined && ib !== undefined && ia !== ib) return ia - ib;
        if (ia !== undefined && ib === undefined) return -1; // known year first
        if (ia === undefined && ib !== undefined) return 1;
        const sa = a.storyOrder ?? a.order ?? 0;
        const sb = b.storyOrder ?? b.order ?? 0;
        if (sa !== sb) return sa - sb;
        return (a.order ?? 0) - (b.order ?? 0);
      });
      break;
    case "story":
    case "chronological":
    default:
      // Storyline order. Primary sort: incidentYear (admin-set in-universe
      // year of incident). Entries without an incidentYear sink to the
      // bottom and are sorted by admin's primary `order` as fallback
      // (Phase 4 Task 6 dropped the legacy story_position column).
      sorted.sort((a, b) => {
        const ia = a.incidentYear;
        const ib = b.incidentYear;
        if (ia !== undefined && ib !== undefined && ia !== ib) return ia - ib;
        if (ia !== undefined && ib === undefined) return -1; // known year first
        if (ia === undefined && ib !== undefined) return 1;
        // Both undefined → fall back to admin primary order.
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
        return (
          (a.customOrder ?? a.order ?? 0) - (b.customOrder ?? b.order ?? 0)
        );
      });
      break;
  }

  return sorted.map((e) => {
    const vaultItem = findInVault(vault, {
      id: e.id,
      media_type: e.media_type
    });
    return {
      entry: e,
      vaultItem,
      inVault: vaultItem !== null,
      status: vaultItem?.status ?? null,
      rating: vaultItem?.rating ?? null
    };
  });
}

/** Group entries by franchise (for the "franchise" viewing order).
 *  Returns null when order isn't "franchise". */
export function groupByFranchise(
  items: TimelineItem[],
  order: ViewingOrder
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
  order: ViewingOrder
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
  order: ViewingOrder
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
