/**
 * CineLog V2 — Collection Repository (Barrel)
 * ---------------------------------------------------------------------
 * Public surface of the Supabase Collection Repository. Application
 * code should import from here (or from the parent
 * `repositories/index.ts`) so the internal file layout can evolve
 * without touching call-sites.
 *
 * Module structure (Single Responsibility, files kept < 250 lines):
 *   collection.types.ts       — shared types
 *   collection.utils.ts       — validation + payload-mapping helpers
 *   collection.read.ts        — read queries (collections + entries)
 *   collection.write.ts       — collection CRUD + simple entry mutations
 *   collection.lifecycle.ts   — reorder / move entry logic
 *   collection.repository.ts  — main class composing read + write + lifecycle
 *   index.ts                  — this barrel
 *
 * Covers BOTH the `collections` and `collection_entries` tables
 * (Database Bible §04 + §05) because they are always accessed together.
 */

export {
  CollectionRepository,
  getCollectionRepository
} from "./collection.repository";

export type {
  // Row / Insert / Update aliases
  CollectionRow,
  CollectionEntryRow,
  CollectionInsert,
  CollectionUpdate,
  CollectionEntryInsert,
  CollectionEntryUpdate,
  // Enum aliases — CollectionType is unique to this repository.
  // SortModeType / CollectionViewType are also exported from the
  // profile repository (they alias the same generated enums); they
  // are intentionally NOT re-exported here to avoid duplicate
  // identifier errors in the parent barrel.
  CollectionType,
  // Input payload types
  CreateCollectionPayload,
  UpdateCollectionPayload,
  CollectionEntryIdentity,
  AddItemPayload,
  MoveItemPayload,
  CollectionSortField,
  CollectionSort,
  CollectionPagination,
  CollectionListFilter,
  CollectionSearchQuery,
  // Result types
  CollectionResult,
  CollectionWriteResult
} from "./collection.types";
