// src/features/watchlist/vaultAdapter.ts
/**
 * CineLog V2 — Vault Adapter (Full Supabase Migration)
 * ---------------------------------------------------------------------
 * Phase 7.2 — Complete Vault Migration
 *
 * The SOLE bridge between the application's `WatchlistItem` shape and
 * the Supabase `vault` table. All Vault reads and writes go through
 * this adapter → VaultRepository → Supabase → PostgreSQL.
 *
 * Architecture:
 *   UI → useVault() → vaultAdapter → VaultRepository → Supabase → PostgreSQL
 *
 * No Firestore. No watchlistService. No optimistic workarounds.
 *
 * Field mapping (WatchlistItem ↔ VaultRow):
 *   WatchlistItem.id (string)        ↔ vault.tmdb_id (number)
 *   WatchlistItem.media_type          ↔ vault.media_type (enum)
 *   WatchlistItem.status (Title Case) ↔ vault.status (lowercase enum)
 *   WatchlistItem.rating              ↔ vault.rating
 *   WatchlistItem.notes               ↔ vault.notes
 *   WatchlistItem.watchDate           ↔ vault.watched_on
 *   WatchlistItem.addedAt             ↔ vault.created_at (auto)
 *   WatchlistItem.updatedAt           ↔ vault.updated_at (auto)
 *
 * TMDB metadata fields (title, poster_path, genresList, etc.) are NOT
 * stored in the vault table — the UI fetches them from TMDB. The vault
 * table stores only user-owned state.
 *
 * READ operations live in `vaultReadAdapter.ts`. This file owns WRITE
 * operations (update / toggle / delete / restore).
 */
import { getVaultRepository } from "~/lib/supabase/repositories";
import type {
  VaultIdentity,
  VaultStatus,
  VaultUpdate,
} from "~/lib/supabase/repositories";
import { STATUS_TO_DB } from "~/shared/utils/vaultStatus";
import type { WatchlistItem } from "~/shared/types";

// Re-export READ operations so existing consumers can keep importing
// everything from vaultAdapter.ts.
export {
  vaultRowToWatchlistItem,
  fetchVaultFromSupabase,
  vaultIdentity,
  createVaultItemInSupabase,
} from "./vaultReadAdapter";

// ---------------------------------------------------------------------------
// WRITE: WatchlistItem → VaultRow operations
// ---------------------------------------------------------------------------

/** Update a vault item's status in Supabase. */
export async function updateStatusInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  status: string,
): Promise<void> {
  const repo = getVaultRepository();
  const vaultStatus = (STATUS_TO_DB[status as WatchlistItem["status"]] ?? "planned") as VaultStatus;
  const { error } = await repo.updateStatus(
    { userId, tmdbId: Number(itemId), mediaType },
    vaultStatus,
  );
  if (error) throw error;
}

/** Update a vault item's rating in Supabase. */
export async function updateRatingInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  rating: number,
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateRating(
    { userId, tmdbId: Number(itemId), mediaType },
    rating,
  );
  if (error) throw error;
}

/** Update a vault item's notes in Supabase. */
export async function updateNotesInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  notes: string,
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateNotes(
    { userId, tmdbId: Number(itemId), mediaType },
    notes,
  );
  if (error) throw error;
}

/** Update a vault item's watch date in Supabase (maps to `watched_on`). */
export async function updateWatchDateInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  watchDate: string,
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    { watched_on: watchDate },
  );
  if (error) throw error;
}

/**
 * Update a vault item's re-watch tracking (count + dates).
 *
 * `rewatch_count` is a plain integer column on the vault table (already
 * exists in the schema). `rewatch_dates` is a `text[]` column that must
 * be added via the migration script `scripts/add_rewatch_dates_column.sql`.
 *
 * Both fields are written in a single PATCH so the update is atomic.
 * Empty strings in the dates array are filtered out before persisting
 * so we don't store sentinel values.
 *
 * RESILIENCE: If the `rewatch_dates` column hasn't been added yet (the
 * migration hasn't been run), the PATCH will fail with a column-not-found
 * error. We catch that, log a warning, and re-try with ONLY `rewatch_count`
 * so the count at least persists. The dates will be lost until the
 * migration is run.
 */
export async function updateRewatchInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  rewatchCount: number,
  rewatchDates: string[],
): Promise<void> {
  const repo = getVaultRepository();
  // Filter out empty strings — only persist dates that are actually set.
  const cleanDates = rewatchDates.filter((d) => d && d.trim().length > 0);

  // First attempt: write both count + dates together.
  const combinedUpdate = {
    rewatch_count: rewatchCount,
    rewatch_dates: cleanDates,
  } as VaultUpdate;
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    combinedUpdate,
  );

  if (!error) return;

  // If the error looks like "column rewatch_dates does not exist",
  // fall back to writing only rewatch_count (which already exists).
  const msg = String(error?.message ?? error ?? "").toLowerCase();
  if (msg.includes("rewatch_dates") || msg.includes("does not exist") || msg.includes("column")) {
    console.warn(
      "[vaultAdapter] rewatch_dates column not found — falling back to rewatch_count only. " +
      "Run scripts/add_rewatch_dates_column.sql in the Supabase SQL editor to enable date tracking.",
      error,
    );
    const { error: countOnlyError } = await repo.updateVaultItem(
      { userId, tmdbId: Number(itemId), mediaType },
      { rewatch_count: rewatchCount } as VaultUpdate,
    );
    if (countOnlyError) throw countOnlyError;
    return;
  }

  // Any other error — throw so the caller can show a toast.
  throw error;
}

/** Update a vault item's progress (minutes) in Supabase (movies only). */
export async function updateProgressInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  progressMinutes: number,
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateProgress(
    { userId, tmdbId: Number(itemId), mediaType },
    progressMinutes,
  );
  if (error) throw error;
}

/** Toggle the `is_favorite` flag on a vault item. */
export async function toggleFavoriteInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  currentValue: boolean,
): Promise<void> {
  const repo = getVaultRepository();
  const update: VaultUpdate = { is_favorite: !currentValue };
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    update,
  );
  if (error) throw error;
}

/** Toggle the `is_pinned` flag on a vault item. */
export async function togglePinnedInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  currentValue: boolean,
): Promise<void> {
  const repo = getVaultRepository();
  const update: VaultUpdate = { is_pinned: !currentValue };
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    update,
  );
  if (error) throw error;
}

/** Soft-delete a vault item in Supabase (sets `deleted_at`).
 *
 * CASCADE CLEANUP: Also hard-deletes any `collection_entries` rows that
 * reference this vault item. Without this, the collection_entries row
 * would be orphaned — the entry would still appear in collections
 * (including Favorites) but with no resolvable vault/TMDB data, rendering
 * as a "blank card" that opens the wrong title's detail modal.
 *
 * This is the data-layer fix that pairs with the UI-layer skip in
 * collectionEntryAdapter.fetchEntriesForCollection.
 */
export async function deleteVaultItemInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
): Promise<void> {
  const repo = getVaultRepository();
  const { data: vaultRow, error: lookupError } = await repo.getVaultByTmdbId(
    userId, Number(itemId), mediaType,
  );
  if (lookupError) throw lookupError;
  const vaultId = vaultRow?.id;

  // 1. Soft-delete the vault row.
  const { error } = await repo.deleteVaultItem({
    userId,
    tmdbId: Number(itemId),
    mediaType,
  });
  if (error) throw error;

  // 2. Cascade: hard-delete any collection_entries referencing this vault id.
  //    Best-effort — if this fails, the orphaned rows are still skipped
  //    on read by collectionEntryAdapter, so the UI is unaffected. We
  //    log a warning so it's visible in dev without blocking the user.
  if (vaultId) {
    try {
      const { getClient } = await import("~/lib/supabase/client");
      const supabase = getClient();
      const { error: cascadeError } = await supabase
        .from("collection_entries")
        .delete()
        .eq("vault_id", vaultId);
      if (cascadeError) {
        console.warn(
          `[vaultAdapter] cascade delete of collection_entries failed for vault ${vaultId}:`,
          cascadeError,
        );
      }
    } catch (err) {
      console.warn(
        `[vaultAdapter] cascade delete threw for vault ${vaultId}:`,
        err,
      );
    }
  }
}

/** Restore a soft-deleted vault item in Supabase (clears `deleted_at`). */
export async function restoreVaultItemInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.restoreVaultItem({
    userId,
    tmdbId: Number(itemId),
    mediaType,
  });
  if (error) throw error;
}

/** General-purpose vault item update (for fields not covered by targeted updaters). */
export async function updateVaultItemInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  update: VaultUpdate,
): Promise<void> {
  const repo = getVaultRepository();
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    update,
  );
  if (error) throw error;
}

// Re-export the identity type so callers can import it from here.
export type { VaultIdentity };
