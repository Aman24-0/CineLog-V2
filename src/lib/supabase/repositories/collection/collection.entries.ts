/**
 * CineLog V2 — Collection Repository: Entry Mutations
 * ---------------------------------------------------------------------
 * Write operations on the `collection_entries` table. Split out from
 * `collection.write.ts` to keep both files under 250 lines and to
 * give entry mutations their own focused, auditable home.
 *
 * RLS compliance (Database Bible §90)
 * -----------------------------------
 *   • `collection_entries` RLS: owner through collection ownership.
 *     A user can only mutate entries in collections they own (USER
 *     type). CURATED collections are read-only.
 *
 * UNIQUE constraint (Database Bible §05)
 * --------------------------------------
 *   • `collection_entries` has UNIQUE(collection_id, vault_id). The
 *     DB rejects duplicates; `addItem` does a pre-check via
 *     `itemExists` to give a friendly signal without a 409 round-trip.
 */

import type {
  AddItemPayload,
  CollectionEntryIdentity,
  CollectionEntryRow,
  CollectionResult,
  CollectionWriteResult,
  TypedSupabaseClient
} from "./collection.types";
import {
  computeNextPosition,
  toError,
  toPositionUpdate,
  validatePosition
} from "./collection.utils";
import { itemExists } from "./collection.read";

// ---------------------------------------------------------------------------
// Table name constant
// ---------------------------------------------------------------------------

const ENTRIES_TABLE = "collection_entries" as const;

// ---------------------------------------------------------------------------
// Entry mutations
// ---------------------------------------------------------------------------

/**
 * Add a vault item to a collection.
 *
 * Respects the UNIQUE(collection_id, vault_id) constraint
 * (Database Bible §05) — the DB rejects duplicates and the error is
 * surfaced. The repository also does a pre-check via `itemExists` so
 * callers get a friendly "already exists" signal without a DB
 * round-trip for the insert.
 *
 * Position handling: when `payload.position` is undefined, the entry
 * is appended to the end (computed via `computeNextPosition`).
 *
 * @returns The newly created entry row, or `null` + `error`.
 */
export async function addItem(
  supabase: TypedSupabaseClient,
  payload: AddItemPayload
): Promise<CollectionResult<CollectionEntryRow>> {
  const posError = validatePosition(payload.position);
  if (posError) return { data: null, error: posError };

  // Pre-check to give a clear signal on duplicates. The DB UNIQUE
  // constraint is the source of truth, but this avoids a 409 round-trip.
  const { exists, error: existsError } = await itemExists(supabase, {
    collectionId: payload.collectionId,
    vaultId: payload.vaultId
  });
  if (existsError) return { data: null, error: existsError };
  if (exists) {
    return {
      data: null,
      error: new Error(
        `[CollectionRepository] vault item ${payload.vaultId} is already in collection ${payload.collectionId}.`
      )
    };
  }

  const position = payload.position ?? (await computeNextPosition(supabase, payload.collectionId));
  const insert = {
    collection_id: payload.collectionId,
    vault_id: payload.vaultId,
    position
  };

  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .insert(insert)
    .select()
    .single();

  return { data, error: toError(error) };
}

/**
 * Remove a single entry from a collection (hard delete).
 *
 * Per Database Bible §05: "Collection entries disappear when the
 * collection is deleted" and "Vault remains untouched" — removing an
 * entry never deletes the vault item.
 *
 * @returns `{ error }` — null on success.
 */
export async function removeItem(
  supabase: TypedSupabaseClient,
  identity: CollectionEntryIdentity
): Promise<CollectionWriteResult> {
  const { error } = await supabase
    .from(ENTRIES_TABLE)
    .delete()
    .eq("collection_id", identity.collectionId)
    .eq("vault_id", identity.vaultId);

  return { error: toError(error) };
}

/**
 * Remove ALL entries from a collection (hard delete). The collection
 * row itself is NOT touched — use `deleteCollection` (in
 * `collection.write.ts`) for that.
 *
 * Useful for "reset collection" UX or before restoring a soft-deleted
 * collection to a clean state.
 *
 * @returns `{ error }` — null on success.
 */
export async function clearCollection(
  supabase: TypedSupabaseClient,
  collectionId: string
): Promise<CollectionWriteResult> {
  const { error } = await supabase
    .from(ENTRIES_TABLE)
    .delete()
    .eq("collection_id", collectionId);

  return { error: toError(error) };
}

/**
 * Update the position of a single entry directly. Used internally by
 * the lifecycle module's reorder/move operations; exposed here so
 * callers can do single-position patches if needed.
 *
 * @returns The updated entry row, or `null` + `error`.
 */
export async function updateEntryPosition(
  supabase: TypedSupabaseClient,
  identity: CollectionEntryIdentity,
  newPosition: number
): Promise<CollectionResult<CollectionEntryRow>> {
  const posError = validatePosition(newPosition);
  if (posError) return { data: null, error: posError };

  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .update(toPositionUpdate(newPosition))
    .eq("collection_id", identity.collectionId)
    .eq("vault_id", identity.vaultId)
    .select()
    .single();

  return { data, error: toError(error) };
}
