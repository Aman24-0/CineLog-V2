/**
 * CineLog V2 — Collection Repository: Collection CRUD Writes
 * ---------------------------------------------------------------------
 * Write operations on the `collections` table only (create / update /
 * soft-delete / restore). Entry mutations (addItem, removeItem,
 * clearCollection, updateEntryPosition) live in `./collection.entries.ts`;
 * entry reorder/move logic lives in `./collection.lifecycle.ts`.
 *
 * RLS compliance (Database Bible §90)
 * -----------------------------------
 *   • `collections` USER: owner only (user_id = auth.uid()).
 *   • `collections` CURATED: read-only — writes will be RLS-rejected.
 *
 * Trigger compliance (Database Bible §91)
 * ---------------------------------------
 *   • `updated_at` is auto-maintained by `set_updated_at()` — never
 *     written manually.
 *   • `created_at` is auto-defaulted — never written manually.
 */

import type {
  CollectionInsert,
  CollectionResult,
  CollectionRow,
  CreateCollectionPayload,
  TypedSupabaseClient,
  UpdateCollectionPayload
} from "./collection.types";
import {
  toCollectionInsert,
  toCollectionUpdate,
  toError,
  validateName
} from "./collection.utils";

// ---------------------------------------------------------------------------
// Table name constant
// ---------------------------------------------------------------------------

const COLLECTIONS_TABLE = "collections" as const;

// ---------------------------------------------------------------------------
// Collection CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new collection row.
 *
 * @returns The newly created collection row, or `null` + `error`.
 */
export async function createCollection(
  supabase: TypedSupabaseClient,
  payload: CreateCollectionPayload
): Promise<CollectionResult<CollectionRow>> {
  const nameError = validateName(payload.name);
  if (nameError) return { data: null, error: nameError };

  const insert: CollectionInsert = toCollectionInsert(payload);
  const { data, error } = await supabase
    .from(COLLECTIONS_TABLE)
    .insert(insert)
    .select()
    .single();

  return { data, error: toError(error) };
}

/**
 * Partially update a collection by id.
 *
 * @returns The updated collection row, or `null` + `error`.
 */
export async function updateCollection(
  supabase: TypedSupabaseClient,
  collectionId: string,
  payload: UpdateCollectionPayload
): Promise<CollectionResult<CollectionRow>> {
  const nameError = validateName(payload.name);
  if (nameError) return { data: null, error: nameError };

  const update = toCollectionUpdate(payload);
  const { data, error } = await supabase
    .from(COLLECTIONS_TABLE)
    .update(update)
    .eq("id", collectionId)
    .is("deleted_at", null)
    .select()
    .single();

  return { data, error: toError(error) };
}

/**
 * Soft-delete a collection by setting `deleted_at`. The row remains
 * in the table so it can be restored (Database Bible §04: "Delete →
 * Trash → Restore"). Collection entries are NOT touched here — they
 * are cleaned up by a separate cascade or by `clearCollection`.
 *
 * @returns The soft-deleted collection row, or `null` + `error`.
 */
export async function deleteCollection(
  supabase: TypedSupabaseClient,
  collectionId: string
): Promise<CollectionResult<CollectionRow>> {
  const deletedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from(COLLECTIONS_TABLE)
    .update({ deleted_at: deletedAt })
    .eq("id", collectionId)
    .is("deleted_at", null)
    .select()
    .single();

  return { data, error: toError(error) };
}

/**
 * Restore a soft-deleted collection by clearing `deleted_at`.
 *
 * @returns The restored collection row, or `null` + `error`.
 */
export async function restoreCollection(
  supabase: TypedSupabaseClient,
  collectionId: string
): Promise<CollectionResult<CollectionRow>> {
  const { data, error } = await supabase
    .from(COLLECTIONS_TABLE)
    .update({ deleted_at: null })
    .eq("id", collectionId)
    .not("deleted_at", "is", null)
    .select()
    .single();

  return { data, error: toError(error) };
}
