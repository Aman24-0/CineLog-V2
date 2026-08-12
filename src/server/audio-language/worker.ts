// src/server/audio-language/worker.ts
//
// CineLog V2 — Audio Language Worker (public entry point)
// ---------------------------------------------------------------------
// This is the SINGLE entry point the rest of the app uses to fetch
// dubbed-audio language data for a title.
//
// PUBLIC API:
//
//   import { getAudioLanguages } from "~/server/audio-language/worker";
//   const result = await getAudioLanguages({ tmdbId, type, region });
//
// FLOW (per spec STEP 12):
//
//   1. Check audio_languages_cache for (media_type, tmdb_id, region).
//   2. Fresh cache?  → return immediately.
//   3. Stale cache?  → return stale data + trigger background refresh.
//   4. No cache?     → run worker synchronously (first-time load).
//   5. Worker runs:  fetch TMDB metadata → run all sources →
//                    normalize → subtract originals → save to cache.
//   6. Background refresh: re-runs the worker for stale entries.
//
// SOURCE REGISTRY (per spec STEP 26):
//   Sources are registered in `defaultSources`. Adding a new source =
//   add it to this array. Each source is independent — if one fails,
//   the others still produce data.

import type {
  AudioLanguageResult,
  AudioLanguageSource,
  TitleType
} from "./types";
import { resolveAudioLanguages } from "./resolver";
import { readCache, writeCache } from "./cache";
import { JustWatchSource } from "./sources/justwatch";
import { TmdbTranslationsSource } from "./sources/tmdb-translations";

/**
 * The registered source adapters, in order of preference. The resolver
 * runs them all in parallel; order only affects which source's name
 * appears first in the merged result's `sources` array.
 *
 * To add a new source:
 *   1. Implement `AudioLanguageSource` in `sources/<name>.ts`.
 *   2. Import and add it to this array.
 *
 * Per spec STEP 26: each source is independent. If one stops working,
 * the others still produce data.
 */
export const defaultSources: AudioLanguageSource[] = [
  new JustWatchSource(),
  new TmdbTranslationsSource()
  // Future sources:
  //   new HotstarCatalogSource(),      // direct Hotstar metadata
  //   new PrimeVideoMetadataSource(),  // Prime Video public metadata
  //   new NetflixCatalogSource(),      // (requires auth — skipped)
];

export interface GetAudioLanguagesOptions {
  tmdbId: number;
  type: TitleType;
  region?: string;
  /** Pre-resolved IMDb ID (skips the TMDB external_ids fetch). */
  imdbId?: string;
  /**
   * If true, force a fresh worker run even if the cache is fresh.
   * Used by the background refresh job + admin refresh buttons.
   */
  forceRefresh?: boolean;
  /**
   * If true, do NOT block — return stale cache immediately and trigger
   * a background refresh. Used by the on-demand endpoint when cache is
   * stale. Default: false (caller decides).
   */
  backgroundRefreshIfStale?: boolean;
  /**
   * Override the source list (for testing).
   */
  sources?: AudioLanguageSource[];
}

export interface GetAudioLanguagesResponse {
  result: AudioLanguageResult;
  fromCache: boolean;
  stale: boolean;
}

/**
 * Fetch audio-language data for a title.
 *
 * Behavior:
 *   - Cache fresh  → return cached result, fromCache=true, stale=false.
 *   - Cache stale  → return cached result + background refresh,
 *                    fromCache=true, stale=true. The refresh writes a
 *                    new cache entry that subsequent calls will pick up.
 *   - No cache     → run worker synchronously, write to cache, return
 *                    fresh result, fromCache=false, stale=false.
 *   - forceRefresh → ignore cache, run worker synchronously, write to
 *                    cache, return fresh result, fromCache=false.
 *
 * Errors:
 *   - This function does NOT throw. On a worker failure, it returns a
 *     result with `status: "error"` so the UI can show an error state.
 *   - If the worker fails AND we have stale cache, we return the stale
 *     cache (better than nothing) with stale=true.
 */
export async function getAudioLanguages(
  opts: GetAudioLanguagesOptions
): Promise<GetAudioLanguagesResponse> {
  const { tmdbId, type, region = "IN", forceRefresh = false } = opts;
  const sources = opts.sources ?? defaultSources;

  // ── 1. Check cache ───────────────────────────────────────────────
  if (!forceRefresh) {
    const cached = await readCache(tmdbId, type);
    if (cached.result) {
      if (cached.fresh) {
        return { result: cached.result, fromCache: true, stale: false };
      }
      // Stale cache — return immediately + trigger background refresh.
      if (opts.backgroundRefreshIfStale) {
        // Fire-and-forget background refresh. We catch all errors so
        // an unhandled rejection doesn't crash the process.
        void runWorkerAndCache(sources, tmdbId, type, region, opts.imdbId).catch(
          (err) => {
            console.warn("[audio-language/worker] background refresh failed:", err);
          }
        );
      }
      return { result: cached.result, fromCache: true, stale: true };
    }
  }

  // ── 2. No cache (or forceRefresh) — run worker synchronously ─────
  const result = await runWorkerAndCache(sources, tmdbId, type, region, opts.imdbId);
  return { result, fromCache: false, stale: false };
}

/**
 * Run the resolver + write the result to cache. Internal helper.
 *
 * On resolver error, returns a result with `status: "error"` (does
 * NOT throw).
 */
async function runWorkerAndCache(
  sources: readonly AudioLanguageSource[],
  tmdbId: number,
  type: TitleType,
  region: string,
  imdbId?: string
): Promise<AudioLanguageResult> {
  let result: AudioLanguageResult;
  try {
    result = await resolveAudioLanguages(sources, tmdbId, type, { region, imdbId });
  } catch (err) {
    // Defensive: resolver is not supposed to throw, but if it does we
    // return a structured error result.
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[audio-language/worker] resolver threw:", errMsg);
    result = {
      tmdbId,
      type,
      originalLanguages: [],
      dubbedLanguages: [],
      detectedAudioLanguages: [],
      sources: [],
      status: "error",
      region,
      checkedAt: new Date().toISOString()
    };
  }

  // Write to cache (best-effort — cache write failure is non-fatal).
  await writeCache(tmdbId, type, result);

  return result;
}

/**
 * Background refresh — used by cron / admin routes to refresh stale
 * entries in bulk. Returns the number of entries refreshed.
 *
 * Per spec STEP 13: "Provide a worker/job that can refresh older
 * records. This will later allow CineLog to process the existing large
 * watchlist without the user opening every movie."
 */
export async function refreshStaleEntries(
  limit = 50,
  sources: readonly AudioLanguageSource[] = defaultSources
): Promise<{ refreshed: number; failed: number }> {
  const stale = await import("./cache").then((m) => m.listStaleEntries(limit));
  let refreshed = 0;
  let failed = 0;
  for (const entry of stale) {
    try {
      await runWorkerAndCache(
        sources,
        entry.tmdb_id,
        entry.media_type,
        // Use a default region for background refresh. In future, store
        // per-region results. For now, IN is the primary use case.
        "IN"
      );
      refreshed++;
    } catch (err) {
      console.warn(
        `[audio-language/worker] background refresh failed for ${entry.media_type}/${entry.tmdb_id}:`,
        err
      );
      failed++;
    }
  }
  return { refreshed, failed };
}
