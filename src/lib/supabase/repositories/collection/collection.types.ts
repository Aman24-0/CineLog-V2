/**
 * CineLog V2 — Collection Repository: Shared Types
 * ---------------------------------------------------------------------
 * Type definitions shared across the collection repository modules
 * (read, write, utils, repository). Covers BOTH tables the repository
 * owns — `collections` and `collection_entries` — since they are
 * always accessed together (a collection is meaningless without its
 * entries).
 *
 * Every type here is derived from the official CLI-generated
 * `database.types.ts` — no hand-rolled shapes, no `any`.
 */

import type {
  Database,
  Enums,
  Tables,
  TablesInsert,
  TablesUpdate
} from "../../database.types";

// ---------------------------------------------------------------------------
// Row / Insert / Update types — direct aliases to the generated types
// ---------------------------------------------------------------------------

/** A single row from the `collections` table. */
export type CollectionRow = Tables<"collections">;

/** A single row from the `collection_entries` table. */
export type CollectionEntryRow = Tables<"collection_entries">;

/** Insert payload for the `collections` table. */
export type CollectionInsert = TablesInsert<"collections">;

/** Update payload for the `collections` table. */
export type CollectionUpdate = TablesUpdate<"collections">;

/** Insert payload for the `collection_entries` table. */
export type CollectionEntryInsert = TablesInsert<"collection_entries">;

/** Update payload for the `collection_entries` table. */
export type CollectionEntryUpdate = TablesUpdate<"collection_entries">;

// ---------------------------------------------------------------------------
// Enum aliases — re-exported so callers do not need to know the enum names
// ---------------------------------------------------------------------------

/** `"user" | "curated" | "smart"` — mirrors the `collection_type` enum. */
export type CollectionType = Enums<"collection_type">;

/** Mirrors `sort_mode_type` — Manual / Rating / Year / Title / … */
export type SortModeType = Enums<"sort_mode_type">;

/** Mirrors `collection_view_type` — Grid / Carousel / Timeline / List. */
export type CollectionViewType = Enums<"collection_view_type">;

// ---------------------------------------------------------------------------
// Input payload types — narrow, documented subsets of Insert/Update
// ---------------------------------------------------------------------------

/**
 * Payload for {@link createCollection}.
 *
 * `userId` is the owner (NULL for global curated collections —
 * Database Bible §04). `name` is required (NOT NULL in the live
 * schema). `collectionType` defaults to `"user"`.
 */
export interface CreateCollectionPayload {
  /** Owner; NULL for global curated collections (Bible §04). */
  readonly userId: string | null;
  readonly name: string;
  readonly collectionType?: CollectionType;
  readonly description?: string | null;
  readonly coverUrl?: string | null;
  readonly bannerUrl?: string | null;
  /** HEX color, e.g. "#7C3AED". */
  readonly color?: string | null;
  readonly sortMode?: SortModeType;
  readonly viewMode?: CollectionViewType;
}

/**
 * Payload for {@link updateCollection}. Every field is optional.
 *
 * Excludes `id` (immutable), `created_at` / `updated_at` (auto-managed
 * by the `set_updated_at()` trigger, Bible §91), and `deleted_at`
 * (use the dedicated `deleteCollection` / `restoreCollection` methods).
 */
export interface UpdateCollectionPayload {
  readonly name?: string;
  readonly collectionType?: CollectionType;
  readonly description?: string | null;
  readonly coverUrl?: string | null;
  readonly bannerUrl?: string | null;
  readonly color?: string | null;
  readonly sortMode?: SortModeType;
  readonly viewMode?: CollectionViewType;
  /** ISO timestamp to archive; `null` to unarchive. */
  readonly archivedAt?: string | null;
}

/**
 * Identity for a collection entry — the composite key
 * `(collection_id, vault_id)` per Database Bible §05.
 */
export interface CollectionEntryIdentity {
  readonly collectionId: string;
  readonly vaultId: string;
}

/**
 * Payload for {@link addItem}. The position is optional; when omitted
 * the item is appended to the end of the collection (computed by the
 * write module).
 */
export interface AddItemPayload {
  readonly collectionId: string;
  readonly vaultId: string;
  /** Optional explicit position. Defaults to "append to end". */
  readonly position?: number;
}

/**
 * Payload for {@link moveItem} — move a single entry to a new
 * absolute position within the same collection, shifting the
 * intervening entries.
 */
export interface MoveItemPayload {
  readonly collectionId: string;
  readonly vaultId: string;
  /** Zero-indexed target position. */
  readonly toPosition: number;
}

/**
 * Sort options for listing collections. Mirrors the indexes defined
 * in Bible §04 (created_at, collection_type).
 */
export type CollectionSortField = "created_at" | "updated_at" | "name";

/** Sort direction. */
export type SortDirection = "asc" | "desc";

/** Sort specification for collection list queries. */
export interface CollectionSort {
  readonly field: CollectionSortField;
  readonly direction?: SortDirection;
}

/** Pagination cursor (offset + limit). */
export interface CollectionPagination {
  readonly limit: number;
  readonly offset?: number;
}

/**
 * Filter for {@link getCollections}. All fields optional — when
 * omitted, no filter is applied for that field.
 *
 * `includeArchived` (default `false`): when false, archived rows
 * (`archived_at IS NOT NULL`) are excluded. When true, archived rows
 * are included so the "Show Archived" section on the Collections
 * page can list them.
 */
export interface CollectionListFilter {
  readonly userId?: string;
  readonly collectionType?: CollectionType;
  readonly includeArchived?: boolean;
}

/**
 * Search query for {@link searchCollections}. Searches the `name`
 * column case-insensitively (PostgREST `ilike`).
 */
export interface CollectionSearchQuery {
  readonly userId: string;
  readonly searchTerm: string;
  readonly collectionType?: CollectionType;
  readonly sort?: CollectionSort;
  readonly pagination?: CollectionPagination;
}

// ---------------------------------------------------------------------------
// Result types — uniform `{ data, error }` shape across all methods
// ---------------------------------------------------------------------------

/**
 * Result of a single-row read or write. `data` is `null` when the row
 * is not found or when an error occurred.
 */
export interface CollectionResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
}

/**
 * Result of a write that has no meaningful return value (e.g. delete,
 * clear, reorder).
 */
export interface CollectionWriteResult {
  readonly error: Error | null;
}

// ---------------------------------------------------------------------------
// Internal: typed Supabase client used by all repository modules
// ---------------------------------------------------------------------------

/**
 * The Supabase client generic over the CineLog `Database` schema.
 * Shared by all read/write functions so they get full type inference
 * on `.from("collections")`, `.eq("user_id", …)`, etc.
 */
export type TypedSupabaseClient = import("@supabase/supabase-js").SupabaseClient<Database>;
