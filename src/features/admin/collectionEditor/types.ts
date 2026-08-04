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
  /** In-universe "year of incident" set by the admin. Drives the
   *  Storyline sort order. NULL = unknown (falls back to position). */
  incident_year: number | null;
  /** Admin's primary manual ordering. After Phase 4 Task 6, this is the
   *  only sort column remaining on curated_universe_entries — the legacy
   *  release_position / story_position / timeline_position columns were
   *  dropped. */
  position: number;
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
 *   - "story"     → Storyline    (uses incident_year; falls back to position)
 *   - "release"   → Release Year (uses TMDB release_date; falls back to position)
 *   - "franchise" → Franchise    (grouped by movie series; within each
 *                                 group, uses incident_year → position)
 *
 * Phase 4 Task 6 dropped the legacy `release_position`, `story_position`,
 * and `timeline_position` DB columns. The sort modes now derive their
 * order from `incident_year` and the TMDB `release_date`, with `position`
 * as the admin's primary manual order and universal tiebreaker.
 */
export type SortMode = "story" | "release" | "franchise";

export interface EntryUpdate {
  /** The only editable sort-related field — the in-universe year of
   *  incident. Drives the Storyline sort. NULL clears it. */
  incident_year?: number | null;
  /** Admin-only note shown in admin UI only. */
  note?: string | null;
}

/** Build a TMDB poster URL from a poster_path. */
export function posterUrl(
  path: string | null | undefined,
  size = "w185"
): string {
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
