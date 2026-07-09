/**
 * CineLog V2 — Collection Repository: Entry Lifecycle / Reordering
 * ---------------------------------------------------------------------
 * Position-shifting operations on `collection_entries`. Split out from
 * `collection.write.ts` to keep both files under 250 lines and to
 * give the (more complex) reorder/move logic its own auditable home.
 *
 * Why no RPC / transaction?
 * --------------------------
 * The Supabase JS client does not support multi-statement transactions
 * directly. The reorder/move operations below use a sequence of
 * single-row UPDATEs. For high-contention collections this is
 * eventually consistent; for CineLog's per-user collections (single
 * editor) the race window is negligible.
 *
 * If atomicity becomes a hard requirement later, the natural
 * migration path is a Postgres RPC function (`reorder_collection_entries`)
 * that takes a JSON array of `{ vault_id, position }` and does the
 * reorder in a single DB transaction. That function would live in the
 * SQL package (Bible §97) and be invoked via `supabase.rpc(...)`.
 *
 * Ordering model (Database Bible §05)
 * -----------------------------------
 *   • `position` is a non-negative integer.
 *   • Entries are displayed ordered by `position` ascending.
 *   • Gaps in the sequence are allowed (e.g. after a remove) — the
 *     display order is still correct.
 *   • Duplicates are NOT allowed during reorder — `reorderItems`
 *     normalises the input to a dense 0..N-1 sequence first.
 */

import type {
  CollectionEntryRow,
  CollectionResult,
  CollectionWriteResult,
  MoveItemPayload,
  TypedSupabaseClient
} from "./collection.types";
import { getItems, itemExists } from "./collection.read";
import { updateEntryPosition } from "./collection.entries";
import { toError } from "./collection.utils";

// ---------------------------------------------------------------------------
// Reorder — full replacement of the collection's ordering
// ---------------------------------------------------------------------------

/**
 * Reorder ALL entries in a collection to match the supplied
 * `orderedVaultIds` array.
 *
 * The array must contain exactly the vault IDs currently in the
 * collection (no more, no less). Positions are assigned densely as
 * `0..N-1` in the order of the array.
 *
 * Implementation: fetch the current entries, verify the input matches
 * the set of vault IDs, then issue one UPDATE per entry with its new
 * position. Returns on the first error (no rollback of prior updates
 * — see the file header for the atomicity note).
 *
 * @param collectionId      Target collection.
 * @param orderedVaultIds   Desired order, vault IDs only. Length must
 *                          equal the current entry count.
 * @returns `{ error }` — null on success.
 */
export async function reorderItems(
  supabase: TypedSupabaseClient,
  collectionId: string,
  orderedVaultIds: string[]
): Promise<CollectionWriteResult> {
  // 1. Fetch current entries to validate the input set.
  const { data: current, error: fetchError } = await getItems(supabase, collectionId);
  if (fetchError) return { error: fetchError };

  const currentSet = new Set(current.map((e: CollectionEntryRow) => e.vault_id));
  const inputSet = new Set(orderedVaultIds);

  if (currentSet.size !== inputSet.size) {
    return {
      error: new Error(
        `[CollectionRepository] reorderItems: input length (${orderedVaultIds.length}) does not match collection size (${currentSet.size}).`
      )
    };
  }
  for (const id of inputSet) {
    if (!currentSet.has(id)) {
      return {
        error: new Error(
          `[CollectionRepository] reorderItems: vault id ${id} is not in collection ${collectionId}.`
        )
      };
    }
  }

  // 2. Issue one UPDATE per entry with its new dense position.
  for (let i = 0; i < orderedVaultIds.length; i++) {
    const vaultId = orderedVaultIds[i]!;
    const { error } = await updateEntryPosition(
      supabase,
      { collectionId, vaultId },
      i
    );
    if (error) return { error };
  }

  return { error: null };
}

// ---------------------------------------------------------------------------
// Move — shift a single entry to an absolute position
// ---------------------------------------------------------------------------

/**
 * Move a single entry to a new absolute position within its
 * collection, shifting the intervening entries by one.
 *
 * Behaviour (standard list-move semantics):
 *   - If `toPosition` is beyond the end, the entry is moved to the end.
 *   - Entries between the old and new position are shifted by ±1 to
 *     make room.
 *
 * Implementation: fetch all entries ordered by position, remove the
 * moving entry, re-insert it at the target index, then reassign dense
 * positions 0..N-1 via `reorderItems`. This is O(N) UPDATEs but keeps
 * the logic simple and correct; for very large collections an RPC
 * would be preferable (see file header).
 *
 * @returns `{ error }` — null on success.
 */
export async function moveItem(
  supabase: TypedSupabaseClient,
  payload: MoveItemPayload
): Promise<CollectionWriteResult> {
  // 1. Validate the entry exists.
  const { exists, error: existsError } = await itemExists(supabase, {
    collectionId: payload.collectionId,
    vaultId: payload.vaultId
  });
  if (existsError) return { error: existsError };
  if (!exists) {
    return {
      error: new Error(
        `[CollectionRepository] moveItem: vault item ${payload.vaultId} is not in collection ${payload.collectionId}.`
      )
    };
  }

  // 2. Fetch the current ordering.
  const { data: entries, error: fetchError } = await getItems(supabase, payload.collectionId);
  if (fetchError) return { error: fetchError };

  // 3. Remove the moving entry, clamp the target index, re-insert.
  const withoutMoved = entries
    .filter((e: CollectionEntryRow) => e.vault_id !== payload.vaultId)
    .map((e: CollectionEntryRow) => e.vault_id);

  const clampedIndex = Math.max(0, Math.min(payload.toPosition, withoutMoved.length));
  const reordered = [
    ...withoutMoved.slice(0, clampedIndex),
    payload.vaultId,
    ...withoutMoved.slice(clampedIndex)
  ];

  // 4. Persist the new dense ordering via reorderItems.
  return reorderItems(supabase, payload.collectionId, reordered);
}

// ---------------------------------------------------------------------------
// Convenience: return the entries after a successful reorder (for UI)
// ---------------------------------------------------------------------------

/**
 * Reorder AND return the refreshed entries in one call. Convenience
 * wrapper around {@link reorderItems} + {@link getItems} for callers
 * that need the new ordering immediately.
 *
 * @returns The refreshed entry rows, or `null` + `error`.
 */
export async function reorderAndGetItems(
  supabase: TypedSupabaseClient,
  collectionId: string,
  orderedVaultIds: string[]
): Promise<CollectionResult<CollectionEntryRow[]>> {
  const { error } = await reorderItems(supabase, collectionId, orderedVaultIds);
  if (error) return { data: null, error };

  const { data, error: fetchError } = await getItems(supabase, collectionId);
  return { data, error: toError(fetchError) };
}
