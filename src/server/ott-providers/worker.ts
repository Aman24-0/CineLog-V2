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
//   3. No cache?     → run worker synchronously (first-time load).
//   4. Worker runs:  fetch from JustWatch → save to cache.
//
// The worker does NOT throw. On a JustWatch failure, it returns a
// result with an empty providers array so the UI can show an empty
// state gracefully.

import type {
  ProviderAvailabilityResult,
  TitleType,
  GetProviderAvailabilityOptions,
  GetProviderAvailabilityResponse
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
        void runWorker(
          tmdbId,
          type,
          normalizedRegion,
          opts.title,
          opts.nodeId ?? cached.result.justWatchNodeId
        );
        return { result: cached.result, fromCache: true, stale: true };
      }
      // Synchronous refresh — wait for fresh data.
      const result = await runWorker(
        tmdbId,
        type,
        normalizedRegion,
        opts.title,
        opts.nodeId ?? cached.result.justWatchNodeId
      );
      return { result, fromCache: false, stale: false };
    }
  }

  // ── 2. No cache (or forceRefresh) — run worker synchronously ─────
  const result = await runWorker(tmdbId, type, normalizedRegion, opts.title, opts.nodeId);
  return { result, fromCache: false, stale: false };
}

/**
 * Run the JustWatch fetch + write the result to cache.
 * Does NOT throw — returns a result with empty providers on failure.
 */
async function runWorker(
  tmdbId: number,
  type: TitleType,
  region: string,
  title?: string,
  nodeId?: string
): Promise<ProviderAvailabilityResult> {
  let result: ProviderAvailabilityResult;

  try {
    // We need the title for JustWatch search. If not provided,
    // we can't search — return empty result.
    if (!title) {
      result = {
        tmdbId,
        type,
        region,
        providers: [],
        checkedAt: new Date().toISOString()
      };
      await writeCache(tmdbId, type, region, result);
      return result;
    }

    const jwResult = await fetchProvidersFromJustWatch(title, region, type, nodeId);

    result = {
      tmdbId,
      type,
      region,
      providers: jwResult.providers,
      checkedAt: new Date().toISOString(),
      justWatchNodeId: jwResult.justWatchNodeId
    };

    if (jwResult.error) {
      console.warn(
        `[ott-providers/worker] JustWatch error for ${type}/${tmdbId}: ${jwResult.error}`
      );
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[ott-providers/worker] worker threw:", errMsg);
    result = {
      tmdbId,
      type,
      region,
      providers: [],
      checkedAt: new Date().toISOString()
    };
  }

  // Write to cache (best-effort — cache write failure is non-fatal).
  await writeCache(tmdbId, type, region, result);

  return result;
}

/**
 * Background refresh — refresh stale entries in bulk.
 * Returns the number of entries refreshed.
 *
 * Uses the cached `justWatchNodeId` (if available) to skip the title
 * search step — this is faster and more accurate than re-searching.
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
      await runWorker(
        entry.tmdb_id,
        entry.media_type,
        entry.region ?? DEFAULT_REGION,
        undefined,
        nodeId
      );
      refreshed++;
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
