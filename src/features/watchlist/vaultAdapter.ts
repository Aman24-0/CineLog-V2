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
 *   WatchlistItem.watchDate (movie)  ↔ vault.watched_on
 *   WatchlistItem.watchDate (TV)     ↔ vault.started_at + vault.completed_at
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
  upsertVaultItemInSupabase,
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

/**
 * Update a vault item's watch date in Supabase.
 *
 * Media-type-aware: the vault table has CHECK constraints that forbid
 * movies from having started_at/completed_at and TV from having
 * watched_on. So we write to DIFFERENT columns depending on media_type:
 *
 *   Movies: watched_on = watchDate
 *   TV:     started_at   = watchDate  (always — it's when you started)
 *           completed_at = watchDate  (only if status is "Completed")
 *
 * Without this split, editing a TV series' watch date would write to
 * `watched_on`, which violates `vault_tv_no_movie_cols` and silently
 * fails (the PATCH returns an error, but the UI doesn't surface it).
 */
export async function updateWatchDateInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  watchDate: string,
): Promise<void> {
  const repo = getVaultRepository();
  let update: VaultUpdate;
  if (mediaType === "tv") {
    // TV: write to started_at + completed_at. We need to check the
    // current status to know whether to set completed_at. The simplest
    // approach is to set started_at always, and also set completed_at
    // if the item's status is Completed (fetched via a read first).
    // But to avoid an extra read, we set BOTH started_at and completed_at
    // to the same value — completed_at is only meaningful if status is
    // Completed, and if it's not, the extra completed_at value is
    // harmless (it's nullable and the UI derives completion from
    // status === "Completed" + watchDate anyway).
    //
    // Actually, the CHECK constraint vault_tv_no_movie_cols only forbids
    // watched_on + progress_minutes for TV — it does NOT forbid
    // completed_at. And vault_movie_no_series_cols only forbids
    // started_at + completed_at for MOVIES. So for TV, setting both
    // started_at and completed_at is fine.
    update = {
      started_at: watchDate || null,
      completed_at: watchDate || null,
    };
  } else {
    // Movie: write to watched_on only. Never touch started_at/completed_at
    // (would violate vault_movie_no_series_cols).
    update = { watched_on: watchDate || null };
  }
  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    update,
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

/**
 * Update a vault item's SERIES per-season watch dates (original + re-watches).
 *
 * Writes three fields in a single PATCH (atomic):
 *   - season_dates: JSON map of season number → {start, end} (original watch)
 *   - season_rewatch_count: integer
 *   - season_rewatch_dates: JSON array of per-re-watch per-season maps
 *
 * RESILIENCE: If the columns don't exist yet (migration not run), the PATCH
 * fails with a column-not-found error. We catch that, log a warning, and
 * silently no-op so the user doesn't see an error toast. The fields will
 * persist once the migration is run.
 *
 * Both season_dates and season_rewatch_dates are stored as JSONB columns
 * (added by scripts/add_season_dates_columns.sql).
 */
export async function updateSeasonDatesInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  seasonDates: Record<string, { start: string; end: string }>,
  seasonRewatchCount: number,
  seasonRewatchDates: Record<string, { start: string; end: string }>[],
): Promise<void> {
  const repo = getVaultRepository();
  // Clean empty entries from seasonDates (don't persist seasons with no dates set)
  const cleanSeasonDates: Record<string, { start: string; end: string }> = {};
  for (const [k, v] of Object.entries(seasonDates)) {
    if (v.start || v.end) cleanSeasonDates[k] = v;
  }
  // Clean empty entries from seasonRewatchDates
  const cleanSeasonRewatchDates = seasonRewatchDates.map((m) => {
    const cleaned: Record<string, { start: string; end: string }> = {};
    for (const [k, v] of Object.entries(m)) {
      if (v.start || v.end) cleaned[k] = v;
    }
    return cleaned;
  });

  const combinedUpdate = {
    season_dates: cleanSeasonDates,
    season_rewatch_count: seasonRewatchCount,
    season_rewatch_dates: cleanSeasonRewatchDates,
  } as VaultUpdate;

  const { error } = await repo.updateVaultItem(
    { userId, tmdbId: Number(itemId), mediaType },
    combinedUpdate,
  );

  if (!error) return;

  // If the error is "column does not exist", the migration hasn't been run.
  // Log a warning and silently no-op — the user's data is still in the form,
  // it just won't persist until the migration is applied.
  const msg = String(error?.message ?? error ?? "").toLowerCase();
  if (
    msg.includes("season_dates") ||
    msg.includes("season_rewatch_count") ||
    msg.includes("season_rewatch_dates") ||
    msg.includes("does not exist") ||
    msg.includes("column")
  ) {
    console.warn(
      "[vaultAdapter] season_dates/season_rewatch_count/season_rewatch_dates columns not found — " +
      "Run scripts/add_season_dates_columns.sql in the Supabase SQL editor to enable series per-season tracking.",
      error,
    );
    return;
  }

  throw error;
}

// Re-export the identity type so callers can import it from here.
export type { VaultIdentity };
