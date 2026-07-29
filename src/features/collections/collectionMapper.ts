/**
 * CineLog V2 — Collection Mapper
 * ---------------------------------------------------------------------
 * Phase 8 — Collections Migration
 *
 * Maps between Supabase rows (CollectionRow + CollectionEntryRow) and
 * the application's `Collection` + `CollectionEntry` types.
 *
 * The Firestore model embedded `entries` as an array on the collection
 * document. The Supabase model normalizes this into two tables:
 * `collections` + `collection_entries`. This mapper merges them back
 * into the single `Collection` shape the UI expects.
 */

import type { CollectionRow, CollectionEntryRow } from "~/lib/supabase/repositories";
import type { Collection, CollectionEntry, CollectionType, TMDBTitle } from "~/shared/types";

// ---------------------------------------------------------------------------
// Type mapping helpers
// ---------------------------------------------------------------------------

/**
 * Map a Supabase `collection_type` enum to the app's `CollectionType`.
 *
 * Supabase: "user" | "curated" | "smart"
 * App:      "user" | "official" | "curated"
 *
 * "smart" in Supabase maps to "user" in the app (smart collections are
 * identified by `isSmart: true` on the Collection type, not by the
 * `type` field). "curated" maps directly. "official" is for TMDB
 * collections — not stored in the `collections` table.
 */
function mapCollectionType(dbType: string): CollectionType {
  if (dbType === "curated") return "curated";
  return "user"; // "user" and "smart" both map to "user"
}

// ---------------------------------------------------------------------------
// Entry mapping: CollectionEntryRow → CollectionEntry
// ---------------------------------------------------------------------------

/**
 * Map a Supabase `CollectionEntryRow` to the app's `CollectionEntry`.
 *
 * This is the SINGLE normalization point for collection entries. The
 * `collection_entries` table stores only the relationship (collection_id,
 * vault_id, position). Display metadata (title, poster_path, etc.) is
 * NOT stored — it's hydrated from TMDB via the vault's tmdb_id.
 *
 * Parameters:
 *   row        — The collection_entries row (vault_id, position)
 *   mediaType  — media_type resolved from the vault row
 *   tmdb       — TMDB metadata (title, poster_path, etc.) — optional
 *   tmdbId     — The TMDB id from the vault row — optional
 *
 * The returned `CollectionEntry.id` is the TMDB id (as a string), NOT
 * the vault UUID. This is because the UI uses `entry.id` to open the
 * Details modal, which fetches TMDB details by id. If `tmdbId` is not
 * available (vault item deleted), falls back to `vault_id`.
 *
 * If `tmdb` is provided, the entry will have:
 *   title, name, poster_path, backdrop_path, release_date, first_air_date
 * populated from the TMDB metadata. If `tmdb` is null/undefined, these
 * fields will be `undefined` — the UI shows "Untitled" as a genuine
 * fallback (not a data bug).
 */
export function entryRowToCollectionEntry(
  row: CollectionEntryRow,
  mediaType: "movie" | "tv" = "movie",
  tmdb?: TMDBTitle | null,
  tmdbId?: number
): CollectionEntry {
  return {
    // Use TMDB id as the entry id — the UI opens Details by TMDB id
    id: tmdbId != null ? String(tmdbId) : row.vault_id,
    media_type: mediaType,
    title: tmdb?.title ?? undefined,
    name: tmdb?.name ?? undefined,
    poster_path: tmdb?.poster_path ?? undefined,
    backdrop_path: tmdb?.backdrop_path ?? undefined,
    release_date: tmdb?.release_date ?? undefined,
    first_air_date: tmdb?.first_air_date ?? undefined,
    order: row.position,
    // order_index is the user-set manual order for USER collections
    // (added in migration 20260729_add_archived_at_to_collections).
    // Backfilled from `position` so existing folders start in their
    // current visual order. Falls back to 0 when null.
    orderIndex: (row as CollectionEntryRow & { order_index?: number | null }).order_index ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Collection mapping: CollectionRow + entries → Collection
// ---------------------------------------------------------------------------

/**
 * Map a Supabase `CollectionRow` (with its entries) to the app's
 * `Collection` type.
 *
 * @param row      The collection row from the `collections` table.
 * @param entries  The entry rows from the `collection_entries` table
 *                 (already fetched and ordered by position).
 */
export function collectionRowToCollection(
  row: CollectionRow,
  entries: CollectionEntry[]
): Collection {
  const archivedAt = (row as CollectionRow & { archived_at?: string | null }).archived_at ?? null;
  return {
    id: row.id,
    name: row.name,
    type: mapCollectionType(row.collection_type),
    description: row.description ?? undefined,
    coverImagePath: row.cover_url ?? undefined,
    backdrop_path: row.banner_url ?? undefined,
    poster_path: row.cover_url ?? undefined,
    accentColor: row.color ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt,
    isArchived: archivedAt !== null,
    sortOrder: row.sort_mode as Collection["sortOrder"] | undefined,
    entries,
    // Smart collection support — smartRules are not stored in the
    // collections table (no column). Smart collections are identified
    // by collection_type = "smart" but the rules themselves would need
    // a dedicated column or JSONB field. For now, smart collections
    // created via the UI will have collection_type = "smart" but no
    // persisted rules — the UI treats them as empty user collections.
    isSmart: row.collection_type === "smart",
    // isFavorites is not a column in the Supabase schema — the Favorites
    // folder is identified by name ("Favorites") in the app. The UI
    // sorts by isFavorites, so we set it based on the name.
    isFavorites: row.name === "Favorites",
  };
}

// ---------------------------------------------------------------------------
// Reverse mapping: Collection → CreateCollectionPayload / UpdateCollectionPayload
// ---------------------------------------------------------------------------

/**
 * Map the app's `Collection` fields to the Supabase `CreateCollectionPayload`.
 * Used when creating a new collection.
 */
export function collectionToCreatePayload(
  userId: string,
  name: string,
  options?: {
    collectionType?: CollectionType;
    description?: string;
    coverUrl?: string | null;
    bannerUrl?: string | null;
    color?: string | null;
  }
): import("~/lib/supabase/repositories").CreateCollectionPayload {
  // Map app collection_type to Supabase collection_type enum.
  // The app's CollectionType is "user" | "official" | "curated".
  // Supabase supports "user" | "curated" | "smart".
  // "smart" is passed separately (not via CollectionType) — the hook
  // calls createCollectionInSupabase with { collectionType: "smart" }
  // which bypasses this mapper. For normal user collections, "user"
  // maps to "user" and "curated" maps to "curated".
  const dbType: "user" | "curated" | "smart" =
    options?.collectionType === "curated" ? "curated" : "user";

  return {
    userId,
    name,
    collectionType: dbType,
    description: options?.description ?? null,
    coverUrl: options?.coverUrl ?? null,
    bannerUrl: options?.bannerUrl ?? null,
    color: options?.color ?? null,
  };
}
