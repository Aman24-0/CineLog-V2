/**
 * CineLog V2 — Shared Vault Utilities
 * ---------------------------------------------------------------------
 * Shared constants and helpers used by vaultAdapter, userLibraryAdapter,
 * and dashboardAdapter. Extracted to eliminate duplicate STATUS_TO_UI
 * and toMs functions.
 */

import type { WatchlistItem } from "~/shared/types";

// ---------------------------------------------------------------------------
// Status mapping: Supabase lowercase enum → UI Title Case
// ---------------------------------------------------------------------------

/**
 * Map a Supabase `vault_status_type` enum value to the Title Case
 * status the UI expects.
 */
export const STATUS_TO_UI: Record<string, WatchlistItem["status"]> = {
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  on_hold: "Plan to Watch",
  dropped: "Dropped",
};

/**
 * Reverse map: UI Title Case → Supabase lowercase enum.
 */
export const STATUS_TO_DB = {
  Planned: "planned",
  Watching: "watching",
  Completed: "completed",
  "Plan to Watch": "on_hold",
  Dropped: "dropped",
} satisfies Record<WatchlistItem["status"], string>;

// ---------------------------------------------------------------------------
// Timestamp conversion (replaces 3 duplicate toMs functions)
// ---------------------------------------------------------------------------

/**
 * Convert a timestamp value (ISO string, Date, or object with seconds)
 * to milliseconds. Used for sorting and display.
 *
 * Replaces the duplicate `toMs` functions that existed in
 * WatchlistView.tsx, useVaultSections.ts, and RecentlyAdded.tsx.
 */
export function toMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value !== null && "seconds" in value) {
    const v = value as { seconds: number };
    return v.seconds * 1000;
  }
  return 0;
}

/**
 * Format a relative time string (e.g. "2h ago", "3d ago").
 * Uses toMs internally.
 */
export function timeAgo(addedAt: unknown): string {
  const ms = toMs(addedAt);
  if (!ms) return "";
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
