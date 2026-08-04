/**
 * CineLog V2 — Collection Repository: Internal Helpers
 * ---------------------------------------------------------------------
 * Pure, side-effect-free utilities used by the read and write modules.
 * Kept separate so the query modules stay focused on Supabase calls
 * and the business-rule validation + payload mapping lives in one
 * auditable place.
 */

import type {
  CollectionEntryInsert,
  CollectionInsert,
  CollectionUpdate,
  CollectionEntryUpdate,
  CreateCollectionPayload,
  UpdateCollectionPayload,
  TypedSupabaseClient
} from "./collection.types";

// ---------------------------------------------------------------------------
// Constants — Database Bible §04 / §05 constraints
// ---------------------------------------------------------------------------

/** Minimum valid position for a collection entry (zero-indexed). */
export const MIN_POSITION = 0 as const;

// ---------------------------------------------------------------------------
// Validation — fail fast before hitting the database
// ---------------------------------------------------------------------------

/**
 * Validate a collection name. Returns `null` if valid, or an `Error`
 * if the name is empty.
 *
 * The live schema has `name` as NOT NULL (Database Bible §04: "Name
 * required"). Duplicate names ARE allowed (Bible §04: "Duplicate
 * names allowed") so no uniqueness check is performed.
 */
export function validateName(name: string | undefined): Error | null {
  if (name === undefined) return null;
  if (typeof name !== "string" || name.trim().length === 0) {
    return new Error("[CollectionRepository] name must be a non-empty string.");
  }
  return null;
}

/**
 * Validate a collection entry position. Returns `null` if valid, or
 * an `Error` if the position is negative (Database Bible §05 implies
 * non-negative integer positions).
 */
export function validatePosition(position: number | undefined): Error | null {
  if (position === undefined) return null;
  if (!Number.isInteger(position) || position < MIN_POSITION) {
    return new Error(
      `[CollectionRepository] position must be a non-negative integer (received ${position}).`
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Payload mapping — translate camelCase input payloads to snake_case DB rows
// ---------------------------------------------------------------------------

/**
 * Map a {@link CreateCollectionPayload} to the snake-case
 * `CollectionInsert` shape the DB expects.
 */
export function toCollectionInsert(
  payload: CreateCollectionPayload
): CollectionInsert {
  return {
    user_id: payload.userId,
    name: payload.name,
    collection_type: payload.collectionType ?? "user",
    description: payload.description ?? null,
    cover_url: payload.coverUrl ?? null,
    banner_url: payload.bannerUrl ?? null,
    color: payload.color ?? null,
    sort_mode: payload.sortMode ?? "manual",
    view_mode: payload.viewMode ?? "grid",
    // Phase 4 Task 1: persist smart-collection rules when provided.
    // NULL for non-smart collections (the DB default).
    rules: payload.rules ?? null
  };
}

/**
 * Map an {@link UpdateCollectionPayload} to the snake-case
 * `CollectionUpdate` shape. Only sets fields that are present.
 */
export function toCollectionUpdate(
  payload: UpdateCollectionPayload
): CollectionUpdate {
  const update: CollectionUpdate = {};
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.collectionType !== undefined)
    update.collection_type = payload.collectionType;
  if (payload.description !== undefined)
    update.description = payload.description;
  if (payload.coverUrl !== undefined) update.cover_url = payload.coverUrl;
  if (payload.bannerUrl !== undefined) update.banner_url = payload.bannerUrl;
  if (payload.color !== undefined) update.color = payload.color;
  if (payload.sortMode !== undefined) update.sort_mode = payload.sortMode;
  if (payload.viewMode !== undefined) update.view_mode = payload.viewMode;
  // archived_at — NULL = active, ISO timestamp = archived.
  // The dedicated archive/unarchive helpers below set this via the
  // repository, but we also surface it on UpdateCollectionPayload so
  // the generic updateCollection path can clear/set it if needed.
  if (payload.archivedAt !== undefined) update.archived_at = payload.archivedAt;
  // Phase 4 Task 1: smart-collection rules. Only set when explicitly
  // provided (undefined = leave unchanged). Pass null to clear.
  if (payload.rules !== undefined) update.rules = payload.rules;
  return update;
}

/**
 * Map an {@link AddItemPayload} to the snake-case
 * `CollectionEntryInsert` shape. `position` is optional — when
 * undefined the write module computes "append to end".
 */
export function toCollectionEntryInsert(
  payload: import("./collection.types").AddItemPayload,
  resolvedPosition: number
): CollectionEntryInsert {
  return {
    collection_id: payload.collectionId,
    vault_id: payload.vaultId,
    position: resolvedPosition
  };
}

/**
 * Build a `CollectionEntryUpdate` for a position-only change.
 */
export function toPositionUpdate(newPosition: number): CollectionEntryUpdate {
  return { position: newPosition };
}

// ---------------------------------------------------------------------------
// Error normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a Supabase / PostgREST error into a plain `Error`.
 *
 * Supabase errors are already `Error` instances in v2, but the union
 * type includes `null`. This helper keeps call-sites tidy.
/**
 * Apply a sort spec to a query builder. Returns the builder so it can
 * be chained. No-op if `sort` is undefined.
 *
 * Generic over the builder type so it works for both the `collections`
 * and `collection_entries` tables.
 */
export function applySort<
  TQuery extends {
    order: (column: string, opts?: { ascending?: boolean }) => TQuery;
  }
>(
  query: TQuery,
  sort: { field: string; direction?: "asc" | "desc" } | undefined
): TQuery {
  if (!sort) return query;
  return query.order(sort.field, { ascending: sort.direction !== "desc" });
}

/**
 * Apply a pagination spec to a query builder. Returns the builder so
 * it can be chained. No-op if `pagination` is undefined.
 *
 * Uses PostgREST's `.range(from, to)` which is inclusive on both ends.
 */
export function applyPagination<
  TQuery extends { range: (from: number, to: number) => TQuery }
>(
  query: TQuery,
  pagination: { limit: number; offset?: number } | undefined
): TQuery {
  if (!pagination) return query;
  const from = pagination.offset ?? 0;
  const to = from + pagination.limit - 1;
  return query.range(from, to);
}

// ---------------------------------------------------------------------------
// Position arithmetic — used by addItem / moveItem / reorderItems
// ---------------------------------------------------------------------------

/**
 * Compute the "append to end" position for a new entry — one past the
 * current maximum position in the collection.
 *
 * Queries the `collection_entries` table for `MAX(position)` where
 * `collection_id = collectionId`. Returns 0 if the collection is
 * empty.
 *
 * Exposed as a separate function so the write module can call it
 * without duplicating the query logic.
 */
export async function computeNextPosition(
  supabase: TypedSupabaseClient,
  collectionId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("collection_entries")
    .select("position")
    .eq("collection_id", collectionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return 0;
  return (data.position as number) + 1;
}

// Re-export toError from shared (eliminates duplicate)
export { toError } from "../shared";
