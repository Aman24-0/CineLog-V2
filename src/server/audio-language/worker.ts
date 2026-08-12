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
//
// IMPORTANT (spec: "FINAL DATA & REGION CORRECTION"):
//   • TMDB translations are NOT audio evidence and have been removed
//     from the pipeline entirely. They were never a real audio source
//     — they only represented translated metadata (title, overview,
//     tagline). The previous implementation mistakenly treated their
//     locales as DETECTED audio languages, which polluted the dubbed
//     list with dozens of languages for popular titles (Attack on
//     Titan, The Witcher, etc.).
//   • Only genuine audio-specific sources (currently: JustWatch
//     `offer.audioLanguages`) may populate `dubbedLanguages`.
//   • Region is NEVER hard-coded. The caller (API endpoint) reads the
//     user's profile country and passes it in. If no region is
//     provided, we fall back to "US" — never "IN".

import type {
  AudioLanguageResult,
  AudioLanguageSource,
  TitleType
} from "./types";
import { resolveAudioLanguages } from "./resolver";
import { readCache, writeCache } from "./cache";
import { JustWatchSource } from "./sources/justwatch";

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
 *
 * Per spec ("FINAL DATA & REGION CORRECTION" §1, §2):
 *   TMDB translations MUST NOT be in this list. They are metadata
 *   translations, not audio tracks. Only genuine audio-specific
 *   sources belong here.
 */
export const defaultSources: AudioLanguageSource[] = [
  new JustWatchSource()
  // Future genuine audio sources (each must surface real audio tracks,
  // NOT metadata translations or subtitle lists):
  //   new HotstarCatalogSource(),      // direct Hotstar metadata
  //   new PrimeVideoMetadataSource(),  // Prime Video public metadata
];

/**
 * Fallback region when the caller does not supply one. We use "US"
 * (not "IN") because:
 *   - "US" is the same fallback the Upcoming page uses for profile
 *     country, so behavior is consistent across the app.
 *   - JustWatch US has the densest offer coverage.
 * The caller (API endpoint) is expected to pass the user's profile
 * country; this is purely a safety net.
 */
export const DEFAULT_REGION = "US";

export interface GetAudioLanguagesOptions {
  tmdbId: number;
  type: TitleType;
  /**
   * ISO 3166-1 alpha-2 region code (e.g. "IN", "US", "DE"). The
   * caller should pass the user's profile country dynamically —
   * never hard-code "IN". Falls back to DEFAULT_REGION ("US").
   */
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
 *
 * Region handling:
 *   The region is part of the cache key (see cache.ts). A cache entry
 *   written for, say, the India region will NEVER be returned for a
 *   request from Germany — this prevents cross-region contamination.
 */
export async function getAudioLanguages(
  opts: GetAudioLanguagesOptions
): Promise<GetAudioLanguagesResponse> {
  const { tmdbId, type, region = DEFAULT_REGION, forceRefresh = false } = opts;
  const sources = opts.sources ?? defaultSources;
  const normalizedRegion = normalizeRegion(region);

  // ── 1. Check cache (region-aware) ──────────────────────────────
  if (!forceRefresh) {
    const cached = await readCache(tmdbId, type, normalizedRegion);
    if (cached.result) {
      if (cached.fresh) {
        return { result: cached.result, fromCache: true, stale: false };
      }
      // Stale cache — return immediately + trigger background refresh.
      if (opts.backgroundRefreshIfStale) {
        // Fire-and-forget background refresh. We catch all errors so
        // an unhandled rejection doesn't crash the process.
        void runWorkerAndCache(
          sources,
          tmdbId,
          type,
          normalizedRegion,
          opts.imdbId
        ).catch((err) => {
          console.warn("[audio-language/worker] background refresh failed:", err);
        });
      }
      return { result: cached.result, fromCache: true, stale: true };
    }
  }

  // ── 2. No cache (or forceRefresh) — run worker synchronously ─────
  const result = await runWorkerAndCache(
    sources,
    tmdbId,
    type,
    normalizedRegion,
    opts.imdbId
  );
  return { result, fromCache: false, stale: false };
}

/**
 * Normalize a region string: uppercase + 2-letter ISO 3166-1.
 * Falls back to DEFAULT_REGION for invalid input.
 */
function normalizeRegion(region: string | undefined): string {
  if (!region) return DEFAULT_REGION;
  const upper = region.trim().toUpperCase();
  if (upper.length === 2 && /^[A-Z]{2}$/.test(upper)) return upper;
  return DEFAULT_REGION;
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
  // Region is part of the cache key, so this entry will not be
  // returned for a different region.
  await writeCache(tmdbId, type, region, result);

  return result;
}

/**
 * Background refresh — used by cron / admin routes to refresh stale
 * entries in bulk. Returns the number of entries refreshed.
 *
 * Per spec STEP 13: "Provide a worker/job that can refresh older
 * records. This will later allow CineLog to process the existing large
 * watchlist without the user opening every movie."
 *
 * Region handling: stale entries are listed per-region (the cache key
 * now includes region), so each entry is re-fetched using its own
 * stored region. This preserves region isolation — an "IN" entry is
 * never refreshed as if it were a "DE" entry.
 */
export async function refreshStaleEntries(
  limit = 50,
  sources: readonly AudioLanguageSource[] = defaultSources
): Promise<{ refreshed: number; failed: number }> {
  const { listStaleEntries } = await import("./cache");
  const stale = await listStaleEntries(limit);
  let refreshed = 0;
  let failed = 0;
  for (const entry of stale) {
    try {
      await runWorkerAndCache(
        sources,
        entry.tmdb_id,
        entry.media_type,
        // Use the region stored on the cache entry — never a hard-coded
        // default. This preserves region isolation across refreshes.
        entry.region ?? DEFAULT_REGION
      );
      refreshed++;
    } catch (err) {
      console.warn(
        `[audio-language/worker] background refresh failed for ${entry.media_type}/${entry.tmdb_id}/${entry.region ?? "(none)"}:`,
        err
      );
      failed++;
    }
  }
  return { refreshed, failed };
}
