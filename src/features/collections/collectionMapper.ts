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
import type { Collection, CollectionEntry, CollectionType } from "~/shared/types";

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
 * The `collection_entries` table stores only the relationship
 * (collection_id, vault_id, position). TMDB metadata (title,
 * poster_path, etc.) is NOT stored — the UI fetches it from TMDB or
 * the vault.
 *
 * `media_type` is NOT on the `collection_entries` table — it's on the
 * `vault` row. The caller MUST resolve it from the vault and pass it
 * via the `mediaType` parameter. If `mediaType` is undefined, the
 * entry's `media_type` defaults to `"movie"` ONLY because the
 * `CollectionEntry` type requires a value — but this is a last-resort
 * fallback, not an assumption. Callers should always resolve
 * media_type from the vault before calling this function.
 *
 * @param row        The collection_entries row.
 * @param mediaType  media_type resolved from the vault row. If
 *                   undefined, defaults to "movie" as a type-level
 *                   requirement only — callers should resolve it.
 */
export function entryRowToCollectionEntry(
  row: CollectionEntryRow,
  mediaType: "movie" | "tv" = "movie"
): CollectionEntry {
  return {
    id: row.vault_id,
    media_type: mediaType,
    order: row.position,
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
