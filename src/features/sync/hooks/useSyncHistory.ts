// src/features/sync/hooks/useSyncHistory.ts
//
// useSyncHistory — derives a human-readable timeline of recent library
// activity for the Sync History section.
//
// DATA SOURCE:
//   The user's watchlist (from useUserLibrary). Each item may have:
//     - addedAt      — when the title was added to the library
//     - updatedAt    — when the title was last modified (rating, notes, status)
//     - watchDate    — when the title was watched
//
//   We derive timeline entries by sorting these timestamps descending
//   and grouping by day (Today, Yesterday, date).
//
// FUTURE:
//   When a real sync log is implemented (server-side audit table), this
//   hook can swap its data source without changing the UI contract.

import { createMemo, type Accessor } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import type { WatchlistItem } from "~/shared/types";

export interface SyncHistoryEntry {
  id: string;
  timestamp: number;
  /** Material Symbols icon name. */
  icon: string;
  /** Human-readable description, e.g. "Added Dune". */
  label: string;
  /** Day group label: "Today", "Yesterday", or "Jul 11". */
  dayLabel: string;
}

export interface SyncHistoryGroup {
  dayLabel: string;
  entries: SyncHistoryEntry[];
}

export function useSyncHistory(): { groups: Accessor<SyncHistoryGroup[]>; total: Accessor<number> } {
  const library = useUserLibrary();

  const groups = createMemo<SyncHistoryGroup[]>(() => {
    const list = library.watchlist();
    const entries: SyncHistoryEntry[] = [];

    for (const item of list) {
      // Added event
      const addedAt = parseTimestamp(item.addedAt);
      if (addedAt) {
        entries.push({
          id: `${item.id}-added`,
          timestamp: addedAt,
          icon: "add_circle",
          label: `Added ${item.title || item.name || "a title"}`,
          dayLabel: dayLabelFor(addedAt),
        });
      }
      // Updated event (rating/status/notes change) — only if different from addedAt
      const updatedAt = parseTimestamp(item.updatedAt);
      if (updatedAt && updatedAt !== addedAt) {
        let icon = "edit";
        let label = `Updated ${item.title || item.name || "a title"}`;
        if (item.rating != null && item.rating > 0) {
          icon = "star";
          label = `Rated ${item.title || item.name || "a title"} ${item.rating}/10`;
        } else if (item.status === "Completed") {
          icon = "check_circle";
          label = `Completed ${item.title || item.name || "a title"}`;
        }
        entries.push({
          id: `${item.id}-updated`,
          timestamp: updatedAt,
          icon,
          label,
          dayLabel: dayLabelFor(updatedAt),
        });
      }
    }

    // Sort descending by timestamp.
    entries.sort((a, b) => b.timestamp - a.timestamp);

    // Group by dayLabel, preserving order.
    const groupMap = new Map<string, SyncHistoryEntry[]>();
    for (const entry of entries) {
      const existing = groupMap.get(entry.dayLabel) ?? [];
      existing.push(entry);
      groupMap.set(entry.dayLabel, existing);
    }

    return Array.from(groupMap.entries()).map(([dayLabel, es]) => ({ dayLabel, entries: es }));
  });

  const total = createMemo(() => groups().reduce((sum, g) => sum + g.entries.length, 0));

  return { groups, total };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTimestamp(value: WatchlistItem["addedAt"] | WatchlistItem["updatedAt"]): number | null {
  if (!value) return null;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return isNaN(ms) ? null : ms;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "seconds" in value) {
    return Number(value.seconds) * 1000;
  }
  return null;
}

function dayLabelFor(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  if (timestamp >= startOfToday) return "Today";
  if (timestamp >= startOfYesterday) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
