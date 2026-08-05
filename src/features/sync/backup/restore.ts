// src/features/sync/backup/restore.ts
//
// Restore pipeline — writes a parsed backup into the user's V2 vault.
//
// Extracted from BackupService.ts (Phase 8 Chunk 3) so the restore loop
// (which is ~270 LOC of batch + retry + per-item fallback logic) can be
// unit-tested and reviewed in isolation.
//
// UPSERT strategy — every item from the backup is written to the vault.
// If an item already exists (same tmdb_id + media_type), it is UPDATED
// with the backup's data (status, rating, notes, watch dates, season
// dates, rewatch tracking). If it doesn't exist, it is inserted.
//
// This means:
//   - No more "10 failed" from unique-constraint violations on items
//     that were already in the vault with a different media_type.
//   - No more "4 duplicates" skipped — existing items get refreshed
//     with the backup's data instead.
//   - ALL user-owned fields (watchDate, seasonDates, rewatchCount,
//     rewatchDates, seasonRewatchCount, seasonRewatchDates, createdAt,
//     completedAt, lastActivityAt) are preserved.
//
// NEVER stops because one item fails — continues with remaining items.
//
// Reports progress via callbacks so the UI can show a progress bar for
// large restores (e.g. 1000+ titles). Supports cancellation.
//
// RESILIENCE: 30ms delay between writes keeps us under Supabase's
// rate limit. Transient failures (429, network blips, 5xx) are
// collected during the first pass and retried with exponential
// backoff (200ms → 500ms → 1500ms → 4000ms) in a second pass at the
// end. Permanent errors (RLS, constraint violations, invalid data)
// are reported immediately and never retried.

import type { WatchlistItem } from "~/shared/types";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import {
  buildFailureReason,
  isTransientError,
  sleep
} from "./errorUtils";
import {
  buildBatchPayloads,
  chunk,
  upsertVaultItemInSupabaseWithRetry,
  watchlistItemToBatchPayload
} from "./batchPayload";
import { getVaultRepository } from "~/lib/supabase/repositories";
import {
  RESTORE_BATCH_DELAY_MS,
  RESTORE_BATCH_SIZE,
  RESTORE_ITEM_DELAY_MS,
  RESTORE_RETRY_BATCH_DELAY_MS
} from "./constants";
import type { ParsedBackup, RestoreCallbacks, RestoreResult } from "./types";

/**
 * Restore a parsed backup into the user's V2 library.
 *
 * See module docstring for full details on the upsert strategy, retry
 * behaviour, and progress reporting.
 */
export async function restoreBackup(
  parsed: ParsedBackup,
  existingWatchlist: WatchlistItem[],
  callbacks?: RestoreCallbacks
): Promise<RestoreResult> {
  const uid = getCurrentUid();
  if (!uid) {
    throw new Error("You must be signed in to restore a backup.");
  }

  const existingByTmdb = new Set(existingWatchlist.map((w) => String(w.id)));
  const existingByTitle = new Set(
    existingWatchlist
      .map((w) => (w.title || w.name || "").toLowerCase().trim())
      .filter(Boolean)
  );

  let imported = 0;
  const skipped = 0;
  let failed = 0;
  let duplicates = 0;
  const failureLog: { reason: string; title?: string }[] = [];
  const total = parsed.items.length;

  // ── BATCH UPSERT STRATEGY ──────────────────────────────────────────
  // Chunk the items into batches of RESTORE_BATCH_SIZE (100) and send
  // each batch as a SINGLE Supabase upsert request. For 1029 items this
  // means ~11 network calls instead of 1029, eliminating the rate-limit
  // failures that plagued the per-item approach.
  const batches = chunk(parsed.items, RESTORE_BATCH_SIZE);

  // Track transient-failed batches for a second-pass retry at the end.
  const transientFailedBatches: {
    items: WatchlistItem[];
    batchStartIdx: number;
  }[] = [];

  let processed = 0;
  for (let b = 0; b < batches.length; b++) {
    if (callbacks?.shouldCancel?.()) break;

    const batchItems = batches[b];
    const batchStartIdx = processed;

    // Pre-count duplicates for items in this batch (for accurate reporting).
    // The batch upsert itself doesn't tell us which rows were inserts vs
    // updates — both count as "imported" since the upsert succeeds either way.
    let batchDuplicates = 0;
    for (const item of batchItems) {
      const tmdbId = String(item.id);
      const titleKey = (item.title || item.name || "").toLowerCase().trim();
      if (
        existingByTmdb.has(tmdbId) ||
        (!!titleKey && existingByTitle.has(titleKey))
      ) {
        batchDuplicates++;
      }
      // Track these ids so we don't re-count duplicates in a later batch
      // of the same restore (in case the same item appears twice).
      existingByTmdb.add(tmdbId);
      if (titleKey) existingByTitle.add(titleKey);
    }

    // Build the batch payload.
    const payloads = buildBatchPayloads(uid, batchItems);

    try {
      const repo = getVaultRepository();
      const { error } = await repo.upsertVaultItemsBatch(payloads);
      if (error) throw error;

      // Batch succeeded — every item in it counts as imported.
      imported += batchItems.length;
      duplicates += batchDuplicates;
    } catch (err) {
      const detailedReason = buildFailureReason(err);

      if (isTransientError(err)) {
        // Save for second-pass retry at the end.
        transientFailedBatches.push({ items: batchItems, batchStartIdx });
        console.warn(
          `[restoreBackup] Batch ${b + 1}/${batches.length} transient failure (${batchItems.length} items, will retry): ${detailedReason}`
        );
      } else {
        // Permanent failure — fall back to per-item upsert so we can salvage
        // the items in this batch that ARE valid. The bad ones get logged
        // individually so the user can see exactly what failed.
        console.error(
          `[restoreBackup] Batch ${b + 1}/${batches.length} permanent failure — retrying items individually: ${detailedReason}`,
          { err }
        );
        let itemIdx = 0;
        for (const item of batchItems) {
          // Check cancel BEFORE each item so the cancel button feels
          // responsive — even mid-batch-fallback the user can stop.
          if (callbacks?.shouldCancel?.()) break;
          itemIdx++;
          try {
            await upsertVaultItemInSupabaseWithRetry(uid, item);
            imported++;
          } catch (itemErr) {
            const iReason = buildFailureReason(itemErr);
            failed++;
            failureLog.push({
              reason: iReason,
              title: item.title || item.name || undefined
            });
          }
          // Report progress every 5 items so the UI updates frequently
          // during per-item fallback (otherwise a 100-item batch shows
          // no progress for ~5 seconds while it grinds through items).
          if (itemIdx % 5 === 0 && callbacks) {
            callbacks.onProgress(
              processed + itemIdx,
              total,
              imported,
              skipped,
              failed
            );
          }
          // Small delay between per-item upserts to stay under Supabase's
          // free-tier rate limit (~2 req/sec sustained). Without this, 100
          // sequential requests in a few seconds triggers 429 errors.
          await sleep(RESTORE_ITEM_DELAY_MS);
        }
      }
    }

    processed += batchItems.length;

    // Small delay between batches. 100 items per request = ~10 batches for
    // 1000 items. Even with a 300ms delay between batches, the whole
    // restore takes ~3 seconds + network RTT — well within Supabase's
    // 500 req/min limit (we're only making ~10-15 requests total).
    if (batches.length > 5) {
      await sleep(RESTORE_BATCH_DELAY_MS);
    }

    // Report progress per batch.
    if (callbacks) {
      callbacks.onProgress(processed, total, imported, skipped, failed);
    }
  }

  // ── SECOND PASS: retry transient-failed batches ──────────────────
  // These are batches that failed due to rate-limiting or network blips
  // during the first pass. The main rush of writes is over now, so we
  // retry with the same batch approach — most should succeed.
  //
  // SAFETY VALVE: If ALL batches went to the transient queue (highly
  // unusual for a real transient failure), it's almost certainly a
  // systematic error that was misclassified as transient. Skip the
  // second-pass batch retry and go straight to per-item fallback so the
  // user sees actual failure reasons instead of a 5-minute hang.
  const allBatchesTransient =
    transientFailedBatches.length > 0 &&
    transientFailedBatches.length === batches.length;

  if (allBatchesTransient) {
    console.warn(
      `[restoreBackup] ALL ${transientFailedBatches.length} batches failed transiently in first pass — ` +
        `this is unusual; skipping batch retry and going straight to per-item fallback ` +
        `(if errors are actually permanent, per-item retry will report them immediately).`
    );
  }

  if (transientFailedBatches.length > 0 && !allBatchesTransient) {
    if (import.meta.env?.DEV) {
      console.log(
        `[restoreBackup] Retrying ${transientFailedBatches.length} transient-failed batches...`
      );
    }
    for (const { items } of transientFailedBatches) {
      if (callbacks?.shouldCancel?.()) break;
      const payloads = items.map((item) =>
        watchlistItemToBatchPayload(uid, item)
      );
      try {
        const repo = getVaultRepository();
        // Retry each batch with one retry — if it fails again, fall back to
        // per-item upsert so we salvage what we can.
        const { error } = await repo.upsertVaultItemsBatch(payloads);
        if (error) throw error;
        imported += items.length;
        // Report progress so the UI doesn't look frozen during the second pass.
        if (callbacks) {
          callbacks.onProgress(processed, total, imported, skipped, failed);
        }
      } catch (err) {
        // Batch retry failed — try per-item as a last resort.
        console.warn(
          `[restoreBackup] Batch retry failed — falling back to per-item upsert for ${items.length} items`,
          err
        );
        let itemIdx = 0;
        for (const item of items) {
          // Check cancel BEFORE each item so the cancel button is
          // responsive even during the second-pass retry loop.
          if (callbacks?.shouldCancel?.()) break;
          itemIdx++;
          try {
            await upsertVaultItemInSupabaseWithRetry(uid, item);
            imported++;
          } catch (itemErr) {
            const iReason = buildFailureReason(itemErr);
            failed++;
            failureLog.push({
              reason: iReason,
              title: item.title || item.name || undefined
            });
          }
          // Report progress every 5 items so the UI updates during the
          // second-pass per-item fallback (which can take minutes for
          // large batches). Without this, the progress bar stays frozen
          // at the first-pass value and the user thinks the app hung.
          if (itemIdx % 5 === 0 && callbacks) {
            callbacks.onProgress(processed, total, imported, skipped, failed);
          }
          await sleep(RESTORE_ITEM_DELAY_MS);
        }
      }
      await sleep(RESTORE_RETRY_BATCH_DELAY_MS);
    }
  } else if (allBatchesTransient) {
    // All batches failed transiently — go straight to per-item fallback
    // WITHOUT retrying the batch first (the batch retry would just fail
    // again with the same error, wasting time). This ensures the user
    // sees failure reasons quickly instead of waiting for a 5-minute
    // batch retry that produces no visible progress.
    if (import.meta.env?.DEV) {
      console.log(
        `[restoreBackup] Skipping batch retry — going straight to per-item fallback for ${transientFailedBatches.reduce((n, b) => n + b.items.length, 0)} items.`
      );
    }
    for (const { items } of transientFailedBatches) {
      if (callbacks?.shouldCancel?.()) break;
      let itemIdx = 0;
      for (const item of items) {
        if (callbacks?.shouldCancel?.()) break;
        itemIdx++;
        try {
          await upsertVaultItemInSupabaseWithRetry(uid, item);
          imported++;
        } catch (itemErr) {
          const iReason = buildFailureReason(itemErr);
          failed++;
          failureLog.push({
            reason: iReason,
            title: item.title || item.name || undefined
          });
        }
        if (itemIdx % 5 === 0 && callbacks) {
          callbacks.onProgress(processed, total, imported, skipped, failed);
        }
        await sleep(RESTORE_ITEM_DELAY_MS);
      }
    }
  }

  // Final progress report so the UI shows the complete counts before
  // the result panel replaces the progress bar.
  if (callbacks) {
    callbacks.onProgress(processed, total, imported, skipped, failed);
  }

  // Build the summary string.
  const parts: string[] = [`${imported} imported`];
  if (duplicates > 0) parts.push(`${duplicates} updated`);
  if (parsed.repairedCount > 0) parts.push(`${parsed.repairedCount} repaired`);
  if (failed > 0) parts.push(`${failed} failed`);

  return {
    imported,
    skipped,
    failed,
    repaired: parsed.repairedCount,
    duplicates,
    summary: parts.join(", "),
    failureLog
  };
}
