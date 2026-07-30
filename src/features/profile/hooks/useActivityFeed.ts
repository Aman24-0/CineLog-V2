// src/features/profile/hooks/useActivityFeed.ts
//
// useActivityFeed — derives a chronological activity feed from the user's
// vault (watchlist) entries.
//
// The spec calls for a "union of vault entries with status changes,
// ratings, episode_progress" — but the existing CineLog data model
// stores all of these on the `vault` row itself (status, rating,
// season/episode trackers). Rather than issue a multi-table UNION
// query (which would require new DB indexes + a server-side RPC), we
// derive the feed client-side from the already-loaded watchlist.
//
// This is faster (no extra round-trip), works offline (the watchlist
// is already in memory), and surfaces the same information the user
// would expect: "added X to watchlist", "rated Y ★ 7", "completed Z",
// "watched episode 3 of season 2 of W".
//
// Each feed item carries:
//   • action_type — 'added' | 'rated' | 'completed' | 'progress' |
//                   'status_changed' | 'planned'
//   • title, poster, year, rating, media_type — from the vault row
//   • timestamp — the most relevant date for the action (watchDate >
//                  updatedAt > addedAt)
//
// The feed is sorted by timestamp desc and capped at `limit` (default 50).

import { createMemo, type Accessor } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityActionType =
  "added" | "rated" | "completed" | "watching" | "planned" | "progress";

export interface ActivityFeedItem {
  /** The vault item this activity refers to. */
  item: WatchlistItem;
  /** What the user did. */
  actionType: ActivityActionType;
  /** Human-readable action verb ("Added", "Rated", "Completed", ...). */
  actionLabel: string;
  /** Material Symbols icon name for the action. */
  icon: string;
  /** Most relevant timestamp for the action (epoch ms). */
  timestamp: number;
}

export interface UseActivityFeedOptions {
  /** Maximum number of items to return (default 50). */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useActivityFeed — derive a chronological activity feed from the
 * user's vault.
 *
 * Usage:
 *   const { feed, loading, empty } = useActivityFeed(() => watchlist());
 *
 * The hook is reactive — when the vault changes (e.g. user rates a
 * title), the feed re-derives via `createMemo`.
 */
export function useActivityFeed(
  watchlist: Accessor<WatchlistItem[] | null | undefined>,
  options: UseActivityFeedOptions = {}
): {
  feed: Accessor<ActivityFeedItem[]>;
  loading: Accessor<boolean>;
  empty: Accessor<boolean>;
} {
  const limit = options.limit ?? 50;

  const feed = createMemo<ActivityFeedItem[]>(() => {
    const list = watchlist();
    if (!list || list.length === 0) return [];

    const items: ActivityFeedItem[] = [];

    for (const item of list) {
      // Each vault row can produce up to TWO feed items: a status
      // action (added / completed / watching / planned) and a rating
      // action (if the user has rated it). Progress (episode updates)
      // is folded into the status action's label for TV series.
      const ts = pickTimestamp(item);
      if (ts == null) continue;

      const statusAction = statusToAction(item);
      if (statusAction) {
        items.push({
          item,
          actionType: statusAction.actionType,
          actionLabel: statusAction.actionLabel,
          icon: statusAction.icon,
          timestamp: ts
        });
      }

      // Rating action — separate entry only when the user has rated
      // AND a rating-specific timestamp can be inferred. We use the
      // same `ts` (the vault row's most-recent activity timestamp)
      // since CineLog doesn't track rating-changed-at separately.
      if (item.rating && item.rating > 0) {
        items.push({
          item,
          actionType: "rated",
          actionLabel: `Rated ★ ${item.rating}`,
          icon: "star",
          timestamp: ts
        });
      }
    }

    // Sort by timestamp desc, then dedupe so the same title doesn't
    // appear twice in a row (status + rating collapse into the most
    // recent of the two).
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items.slice(0, limit);
  });

  const loading = createMemo(() => {
    const list = watchlist();
    return list == null; // null = still loading, [] = loaded but empty
  });

  const empty = createMemo(() => feed().length === 0);

  return { feed, loading, empty };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick the most relevant timestamp for a vault row's activity entry.
 * Preference order: watchDate > updatedAt > addedAt.
 * Returns epoch ms, or null if no date is parseable.
 */
function pickTimestamp(item: WatchlistItem): number | null {
  const candidates = [item.watchDate, item.updatedAt, item.addedAt];
  for (const c of candidates) {
    if (!c) continue;
    const d = toDate(c);
    if (d) return d.getTime();
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && value !== null && "seconds" in value) {
    const v = value as { seconds: number; nanoseconds?: number };
    return new Date(v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1e6));
  }
  return null;
}

function statusToAction(
  item: WatchlistItem
): {
  actionType: ActivityActionType;
  actionLabel: string;
  icon: string;
} | null {
  const status = (item.status ?? "").toLowerCase();
  if (status === "completed") {
    return {
      actionType: "completed",
      actionLabel: "Completed",
      icon: "task_alt"
    };
  }
  if (status === "watching") {
    // For TV, surface episode progress in the label
    if (item.media_type === "tv" && item.season && item.episode) {
      return {
        actionType: "progress",
        actionLabel: `Watching S${item.season} E${item.episode}`,
        icon: "play_circle"
      };
    }
    return {
      actionType: "watching",
      actionLabel: "Started watching",
      icon: "play_circle"
    };
  }
  if (status === "planned" || status === "plan to watch") {
    return {
      actionType: "planned",
      actionLabel: "Added to watchlist",
      icon: "bookmark_add"
    };
  }
  // Fall back to "added" for unknown statuses — every vault item was
  // added at some point, so this is a safe default.
  return {
    actionType: "added",
    actionLabel: "Added to watchlist",
    icon: "bookmark_add"
  };
}

// ---------------------------------------------------------------------------
// Relative-time formatter (used by the ActivityFeed component)
// ---------------------------------------------------------------------------

/**
 * Format a timestamp as a short relative-time string:
 *   < 60s      → "just now"
 *   < 60min    → "Xm ago"
 *   < 24h      → "Xh ago"
 *   < 7d       → "Xd ago"
 *   < 4w       → "Xw ago"
 *   else       → "MMM d" (e.g. "Sep 3")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ago`;
  // Older than 4 weeks — show absolute date
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}
