/**
 * CineLog V2 — Collection Repository
 * ---------------------------------------------------------------------
 * Composes the read, write, and lifecycle modules into a single class
 * with a clean public API. This is the only file callers should import
 * directly (via the barrel at `repositories/collection/index.ts`).
 *
 * The class holds a typed Supabase client and delegates every method
 * to the corresponding function in `collection.read.ts`,
 * `collection.write.ts`, or `collection.lifecycle.ts`. This keeps the
 * class thin (Single Responsibility: orchestration) while the query
 * logic lives in testable, stateless functions.
 *
 * Covers BOTH `collections` and `collection_entries` tables (Database
 * Bible §04 + §05) because they are always accessed together.
 *
 * Pattern (Supabase Integration Guide §05):
 *
 *     Component → CollectionRepository → Supabase → Database
 *
 * Phase scope
 * -----------
 * Foundation only. NOT wired into the application — the existing
 * Firebase-backed `watchlistService.ts` collection methods remain the
 * sole source of truth until the migration explicitly cuts over
 * (Integration Guide §07, Phase 4–5).
 */

import { getClient } from "../../client";
import type { TypedSupabaseClient } from "./collection.types";
import {
  getCollection,
  getCollections,
  getEntry,
  getItems,
  itemExists,
  searchCollections
} from "./collection.read";
import {
  addItem,
  clearCollection,
  removeItem
} from "./collection.entries";
import {
  archiveCollection,
  createCollection,
  deleteCollection,
  restoreCollection,
  unarchiveCollection,
  updateCollection
} from "./collection.write";
import {
  moveItem,
  reorderAndGetItems,
  reorderItems
} from "./collection.lifecycle";
import type {
  AddItemPayload,
  CollectionEntryIdentity,
  CollectionEntryRow,
  CollectionListFilter,
  CollectionPagination,
  CollectionResult,
  CollectionRow,
  CollectionSearchQuery,
  CollectionSort,
  CollectionWriteResult,
  CreateCollectionPayload,
  MoveItemPayload,
  UpdateCollectionPayload
} from "./collection.types";

// ---------------------------------------------------------------------------
// CollectionRepository
// ---------------------------------------------------------------------------

export class CollectionRepository {
  private readonly supabase: TypedSupabaseClient;

  /**
   * @param client  Optional Supabase client. Defaults to the
   *                environment-aware `getClient()` (browser singleton
   *                or SSR per-request client). Pass an explicit client
   *                for tests or per-request isolation.
   */
  constructor(client: TypedSupabaseClient = getClient()) {
    this.supabase = client;
  }

  // ---- Collection reads ------------------------------------------------

  /** Get a collection by id. Excludes soft-deleted rows. */
  getCollection(collectionId: string): Promise<CollectionResult<CollectionRow>> {
    return getCollection(this.supabase, collectionId);
  }

  /** List collections with optional filter / sort / pagination. */
  getCollections(
    filter?: CollectionListFilter & { sort?: CollectionSort; pagination?: CollectionPagination }
  ): Promise<{ data: CollectionRow[]; error: Error | null }> {
    return getCollections(this.supabase, filter);
  }

  /** Search collections by name (ilike). */
  searchCollections(
    query: CollectionSearchQuery
  ): Promise<{ data: CollectionRow[]; error: Error | null }> {
    return searchCollections(this.supabase, query);
  }

  // ---- Collection CRUD -------------------------------------------------

  /** Create a new collection. */
  createCollection(payload: CreateCollectionPayload): Promise<CollectionResult<CollectionRow>> {
    return createCollection(this.supabase, payload);
  }

  /** Partially update a collection. */
  updateCollection(
    collectionId: string,
    payload: UpdateCollectionPayload
  ): Promise<CollectionResult<CollectionRow>> {
    return updateCollection(this.supabase, collectionId, payload);
  }

  /** Soft-delete a collection (sets deleted_at). */
  deleteCollection(collectionId: string): Promise<CollectionResult<CollectionRow>> {
    return deleteCollection(this.supabase, collectionId);
  }

  /** Restore a soft-deleted collection (clears deleted_at). */
  restoreCollection(collectionId: string): Promise<CollectionResult<CollectionRow>> {
    return restoreCollection(this.supabase, collectionId);
  }

  /** Archive a collection (sets archived_at = NOW()). */
  archiveCollection(collectionId: string): Promise<CollectionResult<CollectionRow>> {
    return archiveCollection(this.supabase, collectionId);
  }

  /** Unarchive a collection (clears archived_at). */
  unarchiveCollection(collectionId: string): Promise<CollectionResult<CollectionRow>> {
    return unarchiveCollection(this.supabase, collectionId);
  }

  // ---- Entry reads -----------------------------------------------------

  /** Get all entries in a collection, ordered by position ascending. */
  getItems(collectionId: string): Promise<{ data: CollectionEntryRow[]; error: Error | null }> {
    return getItems(this.supabase, collectionId);
  }

  /** Check whether a vault item is in a collection (UNIQUE key lookup). */
  itemExists(
    identity: CollectionEntryIdentity
  ): Promise<{ exists: boolean; error: Error | null }> {
    return itemExists(this.supabase, identity);
  }

  /** Get a single entry by its composite key (collection_id, vault_id). */
  getEntry(identity: CollectionEntryIdentity): Promise<CollectionResult<CollectionEntryRow>> {
    return getEntry(this.supabase, identity);
  }

  // ---- Entry mutations -------------------------------------------------

  /** Add a vault item to a collection (respects UNIQUE constraint). */
  addItem(payload: AddItemPayload): Promise<CollectionResult<CollectionEntryRow>> {
    return addItem(this.supabase, payload);
  }

  /** Remove a single entry from a collection (hard delete). */
  removeItem(identity: CollectionEntryIdentity): Promise<CollectionWriteResult> {
    return removeItem(this.supabase, identity);
  }

  /** Remove ALL entries from a collection (hard delete). Collection row untouched. */
  clearCollection(collectionId: string): Promise<CollectionWriteResult> {
    return clearCollection(this.supabase, collectionId);
  }

  /** Reorder all entries to match the supplied vault-id order. */
  reorderItems(
    collectionId: string,
    orderedVaultIds: string[]
  ): Promise<CollectionWriteResult> {
    return reorderItems(this.supabase, collectionId, orderedVaultIds);
  }

  /** Reorder AND return the refreshed entries in one call. */
  reorderAndGetItems(
    collectionId: string,
    orderedVaultIds: string[]
  ): Promise<CollectionResult<CollectionEntryRow[]>> {
    return reorderAndGetItems(this.supabase, collectionId, orderedVaultIds);
  }

  /** Move a single entry to a new absolute position, shifting intervening entries. */
  moveItem(payload: MoveItemPayload): Promise<CollectionWriteResult> {
    return moveItem(this.supabase, payload);
  }
}

// ---------------------------------------------------------------------------
// Default singleton — browser caches; SSR is always fresh
// ---------------------------------------------------------------------------

let _defaultInstance: CollectionRepository | null = null;

/**
 * Get the default CollectionRepository instance.
 *
 * Browser: lazily-initialised singleton sharing the singleton browser
 * client. SSR: fresh instance per call (auth state isolation).
 */
export function getCollectionRepository(): CollectionRepository {
  if (typeof window === "undefined") {
    return new CollectionRepository();
  }
  if (!_defaultInstance) {
    _defaultInstance = new CollectionRepository();
  }
  return _defaultInstance;
}
