// src/features/watchlist/useVaultSections.ts
import { createMemo, Accessor } from "solid-js";
import { resolveTimelineDate } from "~/shared/utils/date";
import { isWatchable, getContinueWatchingList } from "~/shared/utils/progress";
import type { WatchlistItem } from "~/shared/types";

export interface VaultSection {
  id: string;
  title: string;
  icon: string;
  subtitle: string;
  items: WatchlistItem[];
  /** Whether this section should show as a rail (limited) by default */
  railByDefault: boolean;
}

interface UseVaultSectionsArgs {
  watchlist: Accessor<WatchlistItem[]>;
  /** When true (search or advanced filters active), sections collapse to a flat list */
  flatMode: Accessor<boolean>;
}

const toMs = (v: any): number => {
  if (!v) return 0;
  if (v instanceof Date) return isNaN(v.getTime()) ? 0 : v.getTime();
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  if (typeof v === "object" && typeof v.seconds === "number") {
    return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  }
  return 0;
};

/**
 * useVaultSections — the brain of the Vault browsing experience.
 *
 * ADAPTIVE SHELF ORDERING:
 *   1. In Progress — items with watchProgress.currentTime > 0, status !== Completed
 *   2. Watching — status === "Watching" but no active progress (or already in #1)
 *   3. Planned — status === "Planned" || "Plan to Watch"
 *   4. Recently Completed — status === "Completed", within last 90 days
 *   5. All Titles — everything NOT shown in shelves above (deduplicated)
 *
 * Empty shelves are skipped entirely — no empty states per shelf.
 *
 * DEDUPLICATION:
 *   Items shown in higher-priority shelves (In Progress, Watching, Planned,
 *   Recently Completed) are tracked in a "claimed" Set. The "All Titles"
 *   shelf excludes claimed items by default. When the user expands "All Titles",
 *   the full collection is shown (including claimed items) — this is the
 *   explicit "show me everything" action.
 *
 * FLAT MODE:
 *   When the user is searching or has advanced filters active, all shelves
 *   collapse into a single flat list. The search/filter intent overrides the
 *   shelf structure because the user has a specific goal.
 */
export function useVaultSections(args: UseVaultSectionsArgs) {
  const sections = createMemo<VaultSection[]>(() => {
    const list = args.watchlist();
    if (list.length === 0) return [];

    // If flat mode (search or advanced filters), return a single "All Titles" section
    if (args.flatMode()) {
      return [{
        id: "all",
        title: "All Titles",
        icon: "video_library",
        subtitle: `${list.length} title${list.length !== 1 ? "s" : ""}`,
        items: list,
        railByDefault: false
      }];
    }

    const claimed = new Set<string>();
    const result: VaultSection[] = [];

    // 1. In Progress — items with status === "Watching" (isWatchable gate)
    //    Uses the shared progress engine — no legacy V1 data can leak in.
    const inProgress = getContinueWatchingList(list.filter((m) => !claimed.has(m.id)));

    if (inProgress.length > 0) {
      inProgress.forEach((m) => claimed.add(m.id));
      result.push({
        id: "in-progress",
        title: "Continue Watching",
        icon: "play_circle",
        subtitle: `${inProgress.length} title${inProgress.length !== 1 ? "s" : ""} in progress`,
        items: inProgress,
        railByDefault: true
      });
    }

    // 2. Watching — status === "Watching" but NOT in progress (or already claimed)
    const watching = list.filter((m) => {
      if (claimed.has(m.id)) return false;
      return m.status === "Watching";
    });

    if (watching.length > 0) {
      watching.forEach((m) => claimed.add(m.id));
      result.push({
        id: "watching",
        title: "Watching",
        icon: "visibility",
        subtitle: `${watching.length} title${watching.length !== 1 ? "s" : ""} currently watching`,
        items: watching,
        railByDefault: true
      });
    }

    // 3. Planned — status === "Planned" || "Plan to Watch"
    const planned = list.filter((m) => {
      if (claimed.has(m.id)) return false;
      return m.status === "Planned" || m.status === "Plan to Watch";
    });

    if (planned.length > 0) {
      planned.forEach((m) => claimed.add(m.id));
      result.push({
        id: "planned",
        title: "Planned",
        icon: "bookmark",
        subtitle: `${planned.length} title${planned.length !== 1 ? "s" : ""} in your watchlist`,
        items: planned,
        railByDefault: true
      });
    }

    // 4. Recently Completed — status === "Completed", within last 90 days
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const recentlyCompleted = list
      .filter((m) => {
        if (claimed.has(m.id)) return false;
        if (m.status !== "Completed") return false;
        const date = resolveTimelineDate(m);
        return date !== null && date.getTime() >= ninetyDaysAgo;
      })
      .sort((a, b) => {
        const dA = resolveTimelineDate(a)?.getTime() || 0;
        const dB = resolveTimelineDate(b)?.getTime() || 0;
        return dB - dA;
      });

    if (recentlyCompleted.length > 0) {
      recentlyCompleted.forEach((m) => claimed.add(m.id));
      result.push({
        id: "recently-completed",
        title: "Recently Completed",
        icon: "task_alt",
        subtitle: `${recentlyCompleted.length} title${recentlyCompleted.length !== 1 ? "s" : ""} finished recently`,
        items: recentlyCompleted,
        railByDefault: true
      });
    }

    // 5. All Titles — everything NOT claimed (deduplicated by default)
    //    This shelf shows only items that don't fit in any higher-priority shelf.
    //    The user can expand it to see the full collection (including claimed items).
    const remaining = list.filter((m) => !claimed.has(m.id));

    if (remaining.length > 0) {
      result.push({
        id: "all",
        title: "All Titles",
        icon: "video_library",
        subtitle: `${remaining.length} title${remaining.length !== 1 ? "s" : ""} in your vault`,
        items: remaining,
        railByDefault: false
      });
    }

    return result;
  });

  /** Count of items that are "claimed" by status shelves (for dedup tracking) */
  const claimedCount = createMemo(() => {
    const list = args.watchlist();
    if (args.flatMode() || list.length === 0) return 0;
    // Count items that would be in shelves 1-4 (not "All Titles")
    // Uses isWatchable for progress, status checks for others
    return list.filter((m) => {
      const inProgress = isWatchable(m); // status === "Watching"
      const planned = m.status === "Planned" || m.status === "Plan to Watch";
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const recentCompleted = m.status === "Completed" &&
        (resolveTimelineDate(m)?.getTime() || 0) >= ninetyDaysAgo;
      return inProgress || planned || recentCompleted;
    }).length;
  });

  return {
    sections,
    claimedCount
  };
}
