// src/server/ott-providers/worker.ts
//
// CineLog V2 — OTT Provider Availability Worker
// ---------------------------------------------------------------------
// This is the SINGLE entry point the rest of the app uses to fetch
// provider availability data for a title.
//
// PUBLIC API:
//
//   import { getProviderAvailability } from "~/server/ott-providers/worker";
//   const response = await getProviderAvailability({ tmdbId, type, region });
//
// FLOW:
//   1. Check ott_provider_availability cache for (media_type, tmdb_id, region).
//   2. Fresh cache?  → return immediately.
//   3. Stale cache?  → if backgroundRefreshIfStale, return stale + trigger
//      non-blocking refresh. If error, preserve stale data.
//   4. No cache?     → run worker synchronously (first-time load).
//   5. Worker runs:  fetch from JustWatch → save to cache.
//
// KEY INVARIANTS:
//   - Errors (network/GraphQL/temporary) are NOT cached as empty results.
//   - Only confirmed "no providers" results are cached as empty.
//   - A failed refresh NEVER overwrites valid cached data.

import type {
  ProviderAvailabilityResult,
  TitleType,
  GetProviderAvailabilityOptions,
  GetProviderAvailabilityResponse,
  ProviderFetchResult
} from "./types";
import { fetchProvidersFromJustWatch, normalizeRegion } from "./justwatch";
import { readCache, writeCache } from "./cache";

export const DEFAULT_REGION = "US";

export async function getProviderAvailability(
  opts: GetProviderAvailabilityOptions
): Promise<GetProviderAvailabilityResponse> {
  const {
    tmdbId,
    type,
    region = DEFAULT_REGION,
    forceRefresh = false,
    backgroundRefreshIfStale = false
  } = opts;
  const normalizedRegion = normalizeRegion(region);

  // ── 1. Check cache (region-aware) ──────────────────────────────
  if (!forceRefresh) {
    const cached = await readCache(tmdbId, type, normalizedRegion);
    if (cached.result) {
      if (cached.fresh) {
        return { result: cached.result, fromCache: true, stale: false };
      }
      // Stale cache.
      if (backgroundRefreshIfStale) {
        // Return stale immediately; trigger background refresh (non-blocking).
        // If the refresh fails, the stale data remains in cache and will be
        // used for subsequent requests until it expires or is refreshed.
        void runWorker(
          tmdbId,
          type,
          normalizedRegion,
          opts.title,
          opts.nodeId ?? cached.result?.justWatchNodeId,
          opts.year,
          cached.result ?? undefined
        );
        return { result: cached.result, fromCache: true, stale: true };
      }
      // Synchronous refresh — wait for fresh data.
      // If the refresh fails, we preserve the stale cached data.
      const result = await runWorker(
        tmdbId,
        type,
        normalizedRegion,
        opts.title,
        opts.nodeId ?? cached.result?.justWatchNodeId,
        opts.year,
        cached.result ?? undefined
      );
      return { result, fromCache: false, stale: false };
    }
  }

  // ── 2. No cache (or forceRefresh) — run worker synchronously ─────
  const result = await runWorker(
    tmdbId,
    type,
    normalizedRegion,
    opts.title,
    opts.nodeId,
    opts.year,
    undefined
  );
  return { result, fromCache: false, stale: false };
}

/**
 * Run the JustWatch fetch + write the result to cache.
 *
 * Error handling:
 *  - If JustWatch returns an error (network/GraphQL/temporary), we do NOT
 *    cache the result and return a result with an empty providers list.
 *    The caller (and subsequent requests) will still get the stale cached
 *    data if it exists (handled by the caller passing `staleResult`).
 *  - If JustWatch confirms "no providers" (noData: true), we cache it.
 *  - If JustWatch returns providers, we cache them.
 *
 * Stale data preservation:
 *  - If `staleResult` is provided (stale cache exists) and the worker fails,
 *    return the stale result instead of the error result.
 *  - Only replace stale data when the refresh produces a valid result.
 */
async function runWorker(
  tmdbId: number,
  type: TitleType,
  region: string,
  title?: string,
  nodeId?: string,
  year?: number,
  staleResult?: ProviderAvailabilityResult
): Promise<ProviderAvailabilityResult> {
  // If we don't have a title or nodeId, we can't search JustWatch.
  // Return stale data if available, otherwise empty result (no cache write).
  if (!title && !nodeId) {
    if (staleResult) {
      console.warn(
        `[ott-providers/worker] No title/nodeId for ${type}/${tmdbId}, keeping stale data`
      );
      return staleResult;
    }
    const emptyResult: ProviderAvailabilityResult = {
      tmdbId,
      type,
      region,
      providers: [],
      checkedAt: new Date().toISOString()
    };
    return emptyResult;
  }

  let jwResult: ProviderFetchResult;
  try {
    jwResult = await fetchProvidersFromJustWatch(
      title ?? "",
      region,
      type,
      nodeId,
      year
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[ott-providers/worker] worker threw:", errMsg);

    // On error: preserve stale data if available, do NOT write to cache.
    if (staleResult) {
      console.warn(
        `[ott-providers/worker] Error for ${type}/${tmdbId}, preserving stale data`
      );
      return staleResult;
    }

    // No stale data to fall back to.
    return {
      tmdbId,
      type,
      region,
      providers: [],
      checkedAt: new Date().toISOString()
    };
  }

  // Check for error result (network/GraphQL/temporary failure).
  if ("error" in jwResult) {
    console.warn(
      `[ott-providers/worker] JustWatch error for ${type}/${tmdbId}: ${jwResult.error}`
    );

    // Do NOT cache the error. Preserve stale data if available.
    if (staleResult) {
      return staleResult;
    }

    // No stale data to fall back to.
    return {
      tmdbId,
      type,
      region,
      providers: [],
      checkedAt: new Date().toISOString()
    };
  }

  // Success result — build the availability result.
  const result: ProviderAvailabilityResult = {
    tmdbId,
    type,
    region,
    providers: jwResult.providers,
    checkedAt: new Date().toISOString(),
    justWatchNodeId: jwResult.justWatchNodeId,
    noData: jwResult.noData
  };

  // Cache the result (best-effort — cache write failure is non-fatal).
  await writeCache(tmdbId, type, region, result);

  return result;
}

/**
 * Background refresh — refresh stale entries in bulk.
 * Returns the number of entries refreshed and failed.
 *
 * Uses the cached `justWatchNodeId` (if available) to skip the title
 * search step — this is faster and more accurate than re-searching.
 * If a background refresh fails, the existing stale data is preserved
 * (not overwritten with an empty result).
 */
export async function refreshStaleEntries(
  limit = 50
): Promise<{ refreshed: number; failed: number }> {
  const { listStaleEntries, readCache } = await import("./cache");
  const stale = await listStaleEntries(limit);
  let refreshed = 0;
  let failed = 0;
  for (const entry of stale) {
    try {
      // Read the cached result to get the justWatchNodeId.
      const cached = await readCache(entry.tmdb_id, entry.media_type, entry.region);
      const nodeId = cached.result?.justWatchNodeId;

      // Pass the cached result as staleResult so failed refreshes
      // preserve the existing data.
      const result = await runWorker(
        entry.tmdb_id,
        entry.media_type,
        entry.region ?? DEFAULT_REGION,
        undefined,
        nodeId,
        undefined,
        cached.result ?? undefined
      );

      // Only count as refreshed if we got a successful result
      // (not a preserved stale result due to error).
      if (!result.noData && result.providers.length > 0) {
        refreshed++;
      } else if (cached.result) {
        // Could be a confirmed noData or a preserved stale result.
        refreshed++;
      }
    } catch (err) {
      console.warn(
        `[ott-providers/worker] background refresh failed for ${entry.media_type}/${entry.tmdb_id}/${entry.region ?? "(none)"}:`,
        err
      );
      failed++;
    }
  }
  return { refreshed, failed };
}
