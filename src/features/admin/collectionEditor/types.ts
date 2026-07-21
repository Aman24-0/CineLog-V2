// src/features/admin/collectionEditor/types.ts
//
// CineLog V2 — Shared types for the admin collection editor.
// ---------------------------------------------------------------------

export interface AdminUniverse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  default_view: "timeline" | "release" | "story" | "franchise";
  color: string | null;
  cover_url: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminEntry {
  id: string;
  universe_id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  position: number;
  release_position: number;
  story_position: number;
  timeline_position: number;
  note: string | null;
  created_at: string;
  // Enriched by the API (not stored in DB):
  title?: string | null;
  poster_path?: string | null;
  release_date?: string | null;
}

/**
 * SortMode — the 3 unified sort modes used in BOTH the admin collection
 * editor AND the consumer collection detail page. Labels are kept in
 * sync with `UNIVERSE_VIEWING_ORDERS` in curatedUniverseAdapter.ts.
 *
 *   - "story"     → Storyline    (uses story_position)
 *   - "release"   → Release Year (uses release_position)
 *   - "franchise" → Franchise    (grouped by movie series; within each
 *                                 group, uses story_position)
 *
 * Legacy "position" and "timeline" modes are no longer exposed in the
 * UI. The DB columns `position` (admin's primary) and `timeline_position`
 * are still maintained — the consumer never sees them, but the admin
 * can still edit them via the per-entry Edit modal.
 */
export type SortMode = "story" | "release" | "franchise";

export interface EntryUpdate {
  position?: number;
  release_position?: number;
  story_position?: number;
  timeline_position?: number;
  note?: string | null;
}

/** Build a TMDB poster URL from a poster_path. */
export function posterUrl(path: string | null | undefined, size = "w185"): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

/** Extract a 4-digit year from a TMDB release_date string. */
export function releaseYear(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const m = dateStr.match(/^(\d{4})/);
  return m ? m[1] : "";
}
