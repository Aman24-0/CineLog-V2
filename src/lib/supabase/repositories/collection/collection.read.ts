/**
 * CineLog V2 — Collection Repository: Read Operations
 * ---------------------------------------------------------------------
 * Pure, stateless read functions over the `collections` and
 * `collection_entries` tables. Each function takes a typed Supabase
 * client as its first argument so the main repository class can pass
 * its configured client (and tests can pass a mock).
 *
 * RLS compliance (Database Bible §90)
 * -----------------------------------
 *   • `collections` RLS:
 *       - USER:    owner only (user_id = auth.uid())
 *       - CURATED: read-only, readable by all authenticated users
 *       - SMART:   generated (not stored)
 *   • `collection_entries` RLS: owner through collection ownership.
 *   • The functions never use the service role key.
 *
 * Soft-delete handling
 * --------------------
 *   • All collection reads exclude soft-deleted rows
 *     (`deleted_at IS NULL`) so trashed collections are invisible to
 *     normal reads (Database Bible §04 partial index).
 *   • `collection_entries` has no `deleted_at` column — entries are
 *     hard-deleted when removed (Bible §05: "Collection entries
 *     disappear when the collection is deleted").
 */

import type {
  CollectionEntryIdentity,
  CollectionEntryRow,
  CollectionListFilter,
  CollectionPagination,
  CollectionResult,
  CollectionRow,
  CollectionSearchQuery,
  CollectionSort,
  TypedSupabaseClient
} from "./collection.types";
import { applyPagination, applySort, toError } from "./collection.utils";

// ---------------------------------------------------------------------------
// Table name constants — single source of truth for this module
// ---------------------------------------------------------------------------

const COLLECTIONS_TABLE = "collections" as const;
const ENTRIES_TABLE = "collection_entries" as const;

// ---------------------------------------------------------------------------
// Collection reads
// ---------------------------------------------------------------------------

/**
 * Get a single collection by id. Excludes soft-deleted rows.
 *
 * @returns The collection row, or `null` if not found / error.
 */
export async function getCollection(
  supabase: TypedSupabaseClient,
  collectionId: string
): Promise<CollectionResult<CollectionRow>> {
  const { data, error } = await supabase
    .from(COLLECTIONS_TABLE)
    .select()
    .eq("id", collectionId)
    .is("deleted_at", null)
    .maybeSingle();

  return { data, error: toError(error) };
}

/**
 * List collections with optional filtering, sorting, and pagination.
 * Excludes soft-deleted rows. By default also excludes archived rows
 * (`archived_at IS NOT NULL`); pass `includeArchived: true` to include
 * them (used by the "Show Archived" toggle on the Collections page).
 *
 * @returns An array of rows (empty if none match). `error` is null on success.
 */
export async function getCollections(
  supabase: TypedSupabaseClient,
  filter?: CollectionListFilter & { sort?: CollectionSort; pagination?: CollectionPagination }
): Promise<{ data: CollectionRow[]; error: Error | null }> {
  let query = supabase
    .from(COLLECTIONS_TABLE)
    .select()
    .is("deleted_at", null);

  // Default: exclude archived rows. The Collections grid only shows
  // active folders; archived ones live behind the "Show Archived"
  // toggle which calls back with includeArchived=true and then
  // filters client-side.
  if (!filter?.includeArchived) {
    query = query.is("archived_at", null);
  }

  if (filter?.userId !== undefined) {
    query = query.eq("user_id", filter.userId);
  }
  if (filter?.collectionType !== undefined) {
    query = query.eq("collection_type", filter.collectionType);
  }

  query = applySort(query, filter?.sort);
  query = applyPagination(query, filter?.pagination);

  const { data, error } = await query;
  return { data: data ?? [], error: toError(error) };
}

/**
 * Search the user's collections by free-text fragment against the
 * `name` column (case-insensitive, PostgREST `ilike`). Excludes
 * soft-deleted rows.
 *
 * The search term is wrapped in `%…%` so it matches as a substring.
 */
export async function searchCollections(
  supabase: TypedSupabaseClient,
  query: CollectionSearchQuery
): Promise<{ data: CollectionRow[]; error: Error | null }> {
  const pattern = `%${query.searchTerm}%`;
  let dbQuery = supabase
    .from(COLLECTIONS_TABLE)
    .select()
    .eq("user_id", query.userId)
    .ilike("name", pattern)
    .is("deleted_at", null);

  if (query.collectionType !== undefined) {
    dbQuery = dbQuery.eq("collection_type", query.collectionType);
  }

  dbQuery = applySort(dbQuery, query.sort);
  dbQuery = applyPagination(dbQuery, query.pagination);

  const { data, error } = await dbQuery;
  return { data: data ?? [], error: toError(error) };
}

// ---------------------------------------------------------------------------
// Collection entry reads
// ---------------------------------------------------------------------------

/**
 * Get all entries in a collection, ordered by `position` ascending
 * (Database Bible §05: "Manual display order"). The composite index
 * `(collection_id, position)` is used.
 *
 * @returns An array of entry rows (empty if collection is empty).
 */
export async function getItems(
  supabase: TypedSupabaseClient,
  collectionId: string
): Promise<{ data: CollectionEntryRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .select()
    .eq("collection_id", collectionId)
    .order("position", { ascending: true });

  return { data: data ?? [], error: toError(error) };
}

/**
 * Check whether a vault item is already in a collection. Uses the
 * UNIQUE(collection_id, vault_id) constraint (Database Bible §05) —
 * at most one row can match.
 *
 * Cheaper than {@link getItems} when the caller only needs a boolean.
 */
export async function itemExists(
  supabase: TypedSupabaseClient,
  identity: CollectionEntryIdentity
): Promise<{ exists: boolean; error: Error | null }> {
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .select("id")
    .eq("collection_id", identity.collectionId)
    .eq("vault_id", identity.vaultId)
    .limit(1)
    .maybeSingle();

  return { exists: data !== null, error: toError(error) };
}

/**
 * Get a single entry by its composite key. Useful for confirming an
 * entry's current position before a move/reorder operation.
 *
 * @returns The entry row, or `null` if not found / error.
 */
export async function getEntry(
  supabase: TypedSupabaseClient,
  identity: CollectionEntryIdentity
): Promise<CollectionResult<CollectionEntryRow>> {
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .select()
    .eq("collection_id", identity.collectionId)
    .eq("vault_id", identity.vaultId)
    .maybeSingle();

  return { data, error: toError(error) };
}
