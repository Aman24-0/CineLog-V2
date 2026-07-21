// src/features/admin/collectionEditor/types.ts
//
// CineLog V2 — Shared types for the admin collection editor.
// ---------------------------------------------------------------------

export interface AdminUniverse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  default_view: "timeline" | "release" | "story";
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

export type SortMode = "position" | "release" | "story" | "timeline";

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
