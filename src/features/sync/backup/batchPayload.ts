// src/features/sync/backup/batchPayload.ts
//
// Maps a WatchlistItem to the CreateVaultItemPayload that the vault
// repository expects.
//
// Extracted from BackupService.ts (Phase 8 Chunk 3) so the mapping logic
// can be unit-tested in isolation and reused by other modules.
//
// This function mirrors the mapping in vaultReadAdapter's
// upsertVaultItemInSupabase so the batch path persists the SAME fields
// (rewatchCount, rewatchDates, seasonDates, createdAt, completedAt,
// lastActivityAt, progressMinutes) as the single-item path.
//
// ── DB CHECK CONSTRAINT AWARENESS ─────────────────────────────────
// The `vault` table has two media-type-specific CHECK constraints:
//
//   vault_movie_no_series_cols:
//     media_type <> 'movie' OR (started_at IS NULL AND completed_at IS NULL)
//     → Movies MUST NOT have started_at or completed_at.
//
//   vault_tv_no_movie_cols:
//     media_type <> 'tv' OR (progress_minutes IS NULL AND watched_on IS NULL)
//     → TV MUST NOT have progress_minutes or watched_on.
//
// To respect these, we partition the date/progress fields by media_type:
//   • Movies: use `watchedOn` (when watched) + `progressMinutes` (player progress).
//   • TV:     use `startedAt` (when first watched) + `completedAt` (when finished).
//
// V1's `watchDate` field is overloaded — for movies it's the watch date,
// for TV it's derived from the latest seasonDates.end. We map both
// correctly below so imports no longer violate the CHECK constraints
// (previously ~25% of V1 imports failed with "violates check constraint
// vault_movie_no_series_cols" / "vault_tv_no_movie_cols").

import type { WatchlistItem } from "~/shared/types";
import {
  getVaultRepository,
  type CreateVaultItemPayload,
  type VaultStatus
} from "~/lib/supabase/repositories";
import { STATUS_TO_DB } from "~/shared/utils/vaultStatus";
import { isTransientError, sleep } from "./errorUtils";
import { TRANSIENT_RETRY_DELAYS_MS } from "./constants";
import { upsertVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";

/**
 * Convert a WatchlistItem to the CreateVaultItemPayload that the vault
 * repository expects. See module docstring for full details.
 */
export function watchlistItemToBatchPayload(
  uid: string,
  item: WatchlistItem
): CreateVaultItemPayload {
  const isMovie = item.media_type === "movie";
  const isTV = item.media_type === "tv";
  const isCompleted = item.status === "Completed";
  const watchDate = item.watchDate;

  // Movies use watched_on + progress_minutes.
  // TV uses started_at + completed_at.
  // (Setting both sides for one media_type would violate the CHECK
  // constraints and the entire batch upsert would fail atomically.)
  const watchedOn = isMovie ? watchDate : undefined;
  const progressMinutes =
    isMovie &&
    typeof item.runtime === "number" &&
    item.watchProgress &&
    item.watchProgress.duration > 0
      ? Math.min(
          item.watchProgress.currentTime || 0,
          item.watchProgress.duration
        )
      : undefined;
  const startedAt = isTV ? watchDate : undefined;
  const completedAt = isTV && isCompleted && watchDate ? watchDate : undefined;

  return {
    userId: uid,
    tmdbId: Number(item.id),
    mediaType: item.media_type,
    status: (STATUS_TO_DB[item.status ?? "Planned"] ??
      "planned") as VaultStatus,
    rating: item.rating,
    notes: item.notes,
    watchedOn,
    rewatchCount: item.rewatchCount,
    rewatchDates: item.rewatchDates,
    seasonDates: item.seasonDates,
    seasonRewatchCount: item.seasonRewatchCount,
    seasonRewatchDates: item.seasonRewatchDates,
    progressMinutes,
    startedAt,
    completedAt,
    createdAt:
      typeof item.addedAt === "string"
        ? item.addedAt
        : item.addedAt &&
            typeof item.addedAt === "object" &&
            "seconds" in item.addedAt
          ? new Date(item.addedAt.seconds * 1000).toISOString()
          : undefined,
    lastActivityAt:
      item.updatedAt ??
      (typeof item.addedAt === "string" ? item.addedAt : undefined)
  };
}

/**
 * Upsert a single vault item with retry on transient errors.
 * Wraps upsertVaultItemInSupabase with exponential backoff so per-item
 * fallback during restore doesn't cascade into hundreds of 429 failures.
 */
export async function upsertVaultItemInSupabaseWithRetry(
  uid: string,
  item: WatchlistItem
): Promise<void> {
  const delays = TRANSIENT_RETRY_DELAYS_MS;
  let lastErr: unknown;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      await upsertVaultItemInSupabase(uid, item);
      return;
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || attempt === delays.length - 1) throw err;
      await sleep(delays[attempt]);
    }
  }
  throw lastErr;
}

/**
 * Build a batch payload array from a list of WatchlistItems.
 * Convenience wrapper around `watchlistItemToBatchPayload`.
 */
export function buildBatchPayloads(
  uid: string,
  items: WatchlistItem[]
): CreateVaultItemPayload[] {
  return items.map((item) => watchlistItemToBatchPayload(uid, item));
}

/**
 * Upsert a batch of vault items in a single Supabase request.
 * Returns the error from the repository (does NOT throw) so the caller
 * can decide whether to retry, fall back to per-item, or report.
 */
export async function upsertBatch(
  uid: string,
  items: WatchlistItem[]
): Promise<{ error: unknown | null }> {
  const payloads = buildBatchPayloads(uid, items);
  const repo = getVaultRepository();
  const { error } = await repo.upsertVaultItemsBatch(payloads);
  return { error };
}

/** Chunk an array into batches of `size`. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
