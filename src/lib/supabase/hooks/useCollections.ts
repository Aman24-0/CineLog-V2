/**
 * CineLog V2 — Supabase Collections Hook
 * ---------------------------------------------------------------------
 * Wraps {@link CollectionRepository} into a Solid-friendly hook.
 * Covers both the `collections` and `collection_entries` tables.
 *
 * No business logic. No UI logic. Thin
 * reactive adapter — does NOT cache or dedupe.
 */

import { getCollectionRepository } from "../repositories";
import type {
  AddItemPayload,
  CollectionEntryIdentity,
  CollectionEntryRow,
  CollectionListFilter,
  CollectionPagination,
  CollectionResult,
  CollectionRow,
  CollectionSort,
  CollectionWriteResult,
  CreateCollectionPayload,
  MoveItemPayload,
  UpdateCollectionPayload
} from "../repositories";
import { createAsyncState } from "./_shared";

/**
 * Result type for single-row collection operations.
 */
type CollectionItemResult = { data: CollectionRow | null; error: Error | null };
/**
 * Result type for list collection operations.
 */
type CollectionRowsResult = { data: CollectionRow[]; error: Error | null };
/**
 * Result type for entry-list operations.
 */
type EntryListResult = { data: CollectionEntryRow[]; error: Error | null };

/**
 * The return type of {@link useCollections}.
 */
export interface UseCollectionsReturn {
  readonly loading: () => boolean;
  readonly error: () => Error | null;
  readonly clearError: () => void;

  // ---- Collection reads ----
  readonly getCollection: (collectionId: string) => Promise<CollectionItemResult>;
  readonly getCollections: (
    filter?: CollectionListFilter & { sort?: CollectionSort; pagination?: CollectionPagination }
  ) => Promise<CollectionRowsResult>;
  readonly searchCollections: (
    query: import("../repositories").CollectionSearchQuery
  ) => Promise<CollectionRowsResult>;

  // ---- Collection CRUD ----
  readonly createCollection: (payload: CreateCollectionPayload) => Promise<CollectionItemResult>;
  readonly updateCollection: (
    collectionId: string,
    payload: UpdateCollectionPayload
  ) => Promise<CollectionItemResult>;
  readonly deleteCollection: (collectionId: string) => Promise<CollectionItemResult>;
  readonly restoreCollection: (collectionId: string) => Promise<CollectionItemResult>;

  // ---- Entry reads ----
  readonly getItems: (collectionId: string) => Promise<EntryListResult>;
  readonly itemExists: (identity: CollectionEntryIdentity) => Promise<{ exists: boolean; error: Error | null }>;
  readonly getEntry: (identity: CollectionEntryIdentity) => Promise<CollectionResult<CollectionEntryRow>>;

  // ---- Entry mutations ----
  readonly addItem: (payload: AddItemPayload) => Promise<CollectionResult<CollectionEntryRow>>;
  readonly removeItem: (identity: CollectionEntryIdentity) => Promise<CollectionWriteResult>;
  readonly clearCollection: (collectionId: string) => Promise<CollectionWriteResult>;
  readonly reorderItems: (collectionId: string, orderedVaultIds: string[]) => Promise<CollectionWriteResult>;
  readonly reorderAndGetItems: (
    collectionId: string,
    orderedVaultIds: string[]
  ) => Promise<CollectionResult<CollectionEntryRow[]>>;
  readonly moveItem: (payload: MoveItemPayload) => Promise<CollectionWriteResult>;
}

/**
 * useCollections — reactive adapter over {@link CollectionRepository}.
 */
export function useCollections(): UseCollectionsReturn {
  const { loading, error, run, clearError } = createAsyncState();
  const repo = () => getCollectionRepository();

  return {
    loading,
    error,
    clearError,

    // ---- Collection reads ----
    getCollection: (collectionId) => run(() => repo().getCollection(collectionId)),
    getCollections: (filter) => run(() => repo().getCollections(filter)),
    searchCollections: (query) => run(() => repo().searchCollections(query)),

    // ---- Collection CRUD ----
    createCollection: (payload) => run(() => repo().createCollection(payload)),
    updateCollection: (collectionId, payload) => run(() => repo().updateCollection(collectionId, payload)),
    deleteCollection: (collectionId) => run(() => repo().deleteCollection(collectionId)),
    restoreCollection: (collectionId) => run(() => repo().restoreCollection(collectionId)),

    // ---- Entry reads ----
    getItems: (collectionId) => run(() => repo().getItems(collectionId)),
    itemExists: (identity) => run(() => repo().itemExists(identity)),
    getEntry: (identity) => run(() => repo().getEntry(identity)),

    // ---- Entry mutations ----
    addItem: (payload) => run(() => repo().addItem(payload)),
    removeItem: (identity) => run(() => repo().removeItem(identity)),
    clearCollection: (collectionId) => run(() => repo().clearCollection(collectionId)),
    reorderItems: (collectionId, orderedVaultIds) => run(() => repo().reorderItems(collectionId, orderedVaultIds)),
    reorderAndGetItems: (collectionId, orderedVaultIds) => run(() => repo().reorderAndGetItems(collectionId, orderedVaultIds)),
    moveItem: (payload) => run(() => repo().moveItem(payload))
  };
}
