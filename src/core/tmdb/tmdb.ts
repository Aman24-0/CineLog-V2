// src/core/tmdb/tmdb.ts
import type {
  TMDBDetails,
  TMDBSeasonDetails,
  TMDBCollection,
  TMDBTitle,
  TMDBPerson,
  TMDBPersonCombinedCredits,
  TMDBVideo,
  TMDBWatchProviderResults,
  TMDBWatchProviderResponse
} from "~/shared/types";
import { cachedFetch, buildCacheKey, TMDB_TTL } from "~/shared/utils/apiCache";
import {
  applyPosterQuality,
  effectiveTMDBLanguage,
  tmdbIncludeAdult
} from "~/core/preferences";
import { isServer } from "solid-js/web";
import { getBaseUrl } from "~/shared/utils/share";
import { fetchWithRetry, TMDBError } from "./fetchHelpers";

// TMDB_KEY has been removed from the client bundle for security.
// The server proxy (/api/media/) injects the API key from TMDB_API_KEY
// (server-only env var). No client-side code should ever need direct
// access to the API key. If server-side code needs the key, use
// getTmdbApiKey() below; calling it on the client will throw.
export function getTmdbApiKey(): string {
  if (!isServer) {
    throw new Error("getTmdbApiKey() must not be called on the client");
  }
  const key = process.env.TMDB_API_KEY ?? process.env.VITE_TMDB_API_KEY ?? "";
  return key;
}

/**
 * Detect whether an error is an expected TMDB 404 (Not Found).
 *
 * Phase 15 QA Bug #3: 404s from TMDB are EXPECTED in several flows:
 *   • Auto-mapped AniList↔TMDB IDs that point to deleted/stale TMDB entries.
 *   • Collection detail pages where the collection was removed from TMDB.
 *   • Season fetches for seasons that TMDB doesn't have metadata for.
 *
 * These 404s are NOT bugs — they're normal data drift. Logging them as
 * red `console.error` floods the browser console and drowns out real
 * errors. Callers should use this helper to detect 404s and silently
 * skip them (return null / empty array) instead of logging.
 *
 * @example
 *   try { return await fetchTmdbDetails(...); }
 *   catch (err) {
 *     if (isTmdb404(err)) return null; // expected — silent
 *     console.warn("[my-feature] TMDB fetch failed:", err); // real error
 *     return null;
 *   }
 */
export function isTmdb404(err: unknown): boolean {
  return err instanceof TMDBError && err.status === 404;
}

/**
 * Module-level cache of TMDB IDs that have previously returned a 404.
 *
 * Phase 15 QA Bug #3 (round 3): browser network 404s are logged by the
 * browser NATIVELY (in the Console + Network tabs) and CANNOT be
 * silenced via JavaScript — the browser logs the failed fetch before
 * our .catch() handler even runs. The only way to stop the red noise
 * is to NOT MAKE THE REQUEST in the first place.
 *
 * This Set records every "{mediaType}/{id}" combination that has
 * previously 404'd. `fetchTmdbMetadata` checks this Set BEFORE issuing
 * the network request and short-circuits to null if the ID is known to
 * be missing. This means:
 *   • The FIRST 404 for a given ID still appears in the browser console
 *     (unavoidable — we have to try once to discover it's missing).
 *   • SUBSEQUENT fetches for the same ID (e.g. on the next page load,
 *     or from a different component) are skipped entirely — no network
 *     request, no 404, no console noise.
 *
 * The Set is module-level (not per-component) so the knowledge persists
 * across navigations within the same page session. It's cleared on full
 * page reload (module re-evaluates). This is the right scope: a TMDB
 * entry that's missing now is very likely still missing 5 minutes later,
 * but might be added back by TMDB eventually — a reload re-tries.
 *
 * The Set is bounded (MAX_FAILED_404_ENTRIES) to prevent unbounded
 * memory growth in pathological cases (e.g. a script that iterates
 * over thousands of stale IDs). When the cap is hit, the oldest
 * entries are evicted (FIFO via Set insertion order).
 *
 * Phase 18 deep fix: the Set is now BACKED by localStorage so the
 * 404 knowledge persists across full page reloads + browser restarts.
 * The previous version (module-level only) lost all 404 knowledge on
 * every reload, so the FIRST page load after a reload re-issued 20+
 * 404s for stale AniList↔TMDB mappings — flooding the Network tab
 * with red on every fresh visit. The localStorage layer has a 7-day
 * TTL: after 7 days, a 404'd ID is re-tried (TMDB may have re-added
 * it). The localStorage layer is best-effort + SSR-safe (no-op on the
 * server).
 */
const MAX_FAILED_404_ENTRIES = 500;
const failedTmdb404s = new Set<string>();

/** localStorage key for the persistent 404 cache.
 *  The value is a JSON object: { "<mediaType>/<id>": <timestamp-ms> }. */
const FAILED_404_LS_KEY = "cinelog:tmdb:failed404";
/** 7-day TTL for the persistent 404 cache (ms). */
const FAILED_404_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** True when running in a browser with localStorage access. */
function hasLocalStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

/** True when running in a browser with localStorage access. */
function hasLocalStorageSafe(): boolean {
  return hasLocalStorage();
}

/**
 * Load the persistent 404 cache from localStorage, pruning entries
 * older than FAILED_404_TTL_MS. Returns a Map of key → timestamp.
 * SSR-safe (returns an empty Map on the server).
 *
 * Side-effect: if any expired entries were found, the pruned map is
 * written back to localStorage so we don't repeatedly re-read stale
 * entries on every load.
 */
function loadPersistent404Cache(): Map<string, number> {
  if (!hasLocalStorageSafe()) return new Map();
  try {
    const raw = window.localStorage.getItem(FAILED_404_LS_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return new Map();
    }
    const now = Date.now();
    const result = new Map<string, number>();
    let pruned = false;
    for (const [key, ts] of Object.entries(parsed)) {
      if (typeof ts !== "number") {
        pruned = true;
        continue;
      }
      if (now - ts < FAILED_404_TTL_MS) {
        result.set(key, ts);
      } else {
        pruned = true;
      }
    }
    if (pruned) {
      writePersistent404Cache(result);
    }
    return result;
  } catch {
    return new Map();
  }
}

/** Serialize + write the persistent 404 cache to localStorage. */
function writePersistent404Cache(map: Map<string, number>): void {
  if (!hasLocalStorageSafe()) return;
  try {
    const obj: Record<string, number> = {};
    map.forEach((ts, key) => {
      obj[key] = ts;
    });
    window.localStorage.setItem(FAILED_404_LS_KEY, JSON.stringify(obj));
  } catch (err) {
    // Quota exceeded or serialization error — non-fatal. The in-memory
    // Set still works for this session; we just won't persist across
    // reloads.
    console.warn("[tmdb] Failed to persist 404 cache:", err);
  }
}

/**
 * Hydrate the in-memory Set from localStorage on module init. This
 * runs ONCE per page load (module evaluation) so the first fetch
 * after a reload already knows about 404'd IDs from previous sessions.
 *
 * We hydrate the timestamp map into the Set (the Set is what
 * isKnownTmdb404() checks). We keep the timestamps in localStorage
 * for TTL pruning, but the in-memory Set is the hot-path lookup.
 */
function hydrateFromPersistentCache(): void {
  const persistent = loadPersistent404Cache();
  if (persistent.size === 0) return;
  // Insert in insertion order (Map preserves it) so the FIFO eviction
  // in recordFailedTmdb404() matches the oldest-first order from
  // localStorage.
  for (const key of persistent.keys()) {
    failedTmdb404s.add(key);
  }
  // If the persistent cache had more entries than the in-memory cap
  // (shouldn't happen, but defensive), trim the in-memory Set.
  while (failedTmdb404s.size > MAX_FAILED_404_ENTRIES) {
    const firstKey = failedTmdb404s.values().next().value;
    if (firstKey === undefined) break;
    failedTmdb404s.delete(firstKey);
  }
}

// Hydrate on module init. This is a no-op on the server (loadPersistent404Cache
// returns an empty Map when hasLocalStorage() is false).
hydrateFromPersistentCache();

/**
 * Record a TMDB ID as known-missing (404). Called from fetchTmdbMetadata's
 * catch block when a 404 is observed. Bounds the Set size by evicting the
 * oldest entries when the cap is reached.
 *
 * Phase 16 upgrade: EXPORTED so the media proxy route
 * (src/routes/api/media/[...path].ts) can also record 404s it observes
 * at the proxy level — this gives the proxy a second layer of 404
 * prevention for server-side fetchTmdbMetadata calls that go through
 * the proxy.
 *
 * Phase 18 deep fix: also persists the 404 to localStorage so it
 * survives page reloads. We merge the new entry into the existing
 * persistent map + write it back. The write is throttled implicitly
 * (we only write when a NEW entry is added, not when the entry is
 * already known).
 */
export function recordFailedTmdb404(key: string): void {
  if (failedTmdb404s.has(key)) return;
  // Evict oldest entries (Set preserves insertion order) when the cap
  // is hit. This keeps memory bounded in pathological cases.
  if (failedTmdb404s.size >= MAX_FAILED_404_ENTRIES) {
    const firstKey = failedTmdb404s.values().next().value;
    if (firstKey !== undefined) failedTmdb404s.delete(firstKey);
  }
  failedTmdb404s.add(key);

  // Phase 18 deep fix: persist to localStorage so the 404 knowledge
  // survives page reloads. Best-effort — if the write fails (quota),
  // the in-memory Set still works for this session.
  if (hasLocalStorageSafe()) {
    try {
      const persistent = loadPersistent404Cache();
      persistent.set(key, Date.now());
      // If the persistent cache grew beyond the cap, trim it (oldest
      // first, by Map insertion order).
      while (persistent.size > MAX_FAILED_404_ENTRIES) {
        const firstKey = persistent.keys().next().value;
        if (firstKey === undefined) break;
        persistent.delete(firstKey);
      }
      writePersistent404Cache(persistent);
    } catch (err) {
      console.warn("[tmdb] Failed to persist 404 cache entry:", err);
    }
  }
}

/** Build the cache key for a TMDB ID: "{mediaType}/{id}".
 *  EXPORTED so the media proxy route can build the same key format. */
export function tmdb404Key(mediaType: string, id: number | string): string {
  return `${mediaType}/${id}`;
}

/** Check if a TMDB ID is known to 404 (so we skip the network request).
 *  EXPORTED so the media proxy route can short-circuit known-404 IDs
 *  BEFORE making the upstream TMDB request — this prevents the browser
 *  from logging the 404 in the Network tab. */
export function isKnownTmdb404(mediaType: string, id: number | string): boolean {
  return failedTmdb404s.has(tmdb404Key(mediaType, id));
}

const IMG_BASE = "https://image.tmdb.org/t/p";
// All TMDB API calls now go through the server-side proxy at /api/media/*
// which injects the API key server-side and adds caching/retry logic.
// This fixes ISP/DNS blocking in certain regions and keeps the key hidden.
const API = "/api/media";

/**
 * Resolve the API base URL for fetch().
 *
 * On the CLIENT, relative URLs ("/api/media/...") work because the browser
 * resolves them against the current page origin.
 *
 * On the SERVER (Node.js / Vercel serverless), fetch() requires an
 * ABSOLUTE URL — relative URLs throw `TypeError: Invalid URL`. This is
 * the root cause of the OG-tag SSR bug: the deep-link routes
 * (src/routes/movie/[id].tsx, src/routes/tv/[id].tsx) call
 * fetchTmdbMetadata() inside createResource({ deferStream: true }) so
 * the SSR HTML is supposed to contain the per-title og:title / og:image
 * tags. But if the server-side fetch throws, meta() resolves to null
 * and the OG tags fall back to the generic "CineLog" defaults — so
 * WhatsApp/Telegram/Slack scrapers see the app icon instead of the
 * movie poster.
 *
 * Fix: when isServer, prepend the absolute base URL (configured via
 * VITE_APP_BASE_URL, defaulting to the production Vercel URL) so the
 * serverless function can call its own /api/media/* endpoints.
 */
function apiBaseUrl(): string {
  return isServer ? getBaseUrl() : "";
}

/**
 * Build a TMDB image URL. Sizes follow TMDB's documented w-pixel conventions.
 * Returns "" if path is null/undefined (so callers can <Show when={url}>).
 *
 * Poster-quality preference is automatically applied (see src/core/preferences).
 * For hero/backdrop images ("w1280" / "original"), no downgrade happens.
 */
export const tmdbImage = (
  path: string | null | undefined,
  size:
    | "w92"
    | "w154"
    | "w185"
    | "w342"
    | "w500"
    | "w780"
    | "w1280"
    | "original" = "w500"
): string => (path ? `${IMG_BASE}/${applyPosterQuality(size)}${path}` : "");

/**
 * Cached fetch helper for TMDB JSON endpoints.
 *
 * WIRING (v2 settings redesign):
 *   • Language preference: replaces `language=en-US` in the endpoint with
 *     the user's chosen primary language from `effectiveTMDBLanguage()`.
 *   • Adult content filter: appends `include_adult=false` to endpoints
 *     that don't already have it, when the user has the filter on.
 *
 * Both transformations happen here so all call sites benefit without
 * needing to pass language/adult flags explicitly.
 */
async function tmdbFetch<T>(endpoint: string): Promise<T> {
  // Apply language preference: replace language=en-US with user's choice
  let finalEndpoint = endpoint;
  const userLang = effectiveTMDBLanguage();
  if (userLang && userLang !== "en") {
    // Convert "hi" → "hi-IN" style where appropriate; TMDB accepts both
    finalEndpoint = finalEndpoint.replace(
      /language=en-US/g,
      `language=${userLang}`
    );
  }

  // Apply adult filter: if not already in the endpoint, append it.
  // Discover endpoints (with_genres, sort_by, etc.) respect include_adult.
  // Details endpoints also accept include_adult for credits/videos.
  if (!/[?&]include_adult=/.test(finalEndpoint)) {
    finalEndpoint += `&include_adult=${tmdbIncludeAdult() ? "true" : "false"}`;
  }

  return cachedFetch(
    buildCacheKey(`tmdb:${finalEndpoint}`),
    TMDB_TTL,
    async () => {
      // fetchWithRetry provides a 10-second timeout (prevents the
      // Details modal from hanging forever when the network is slow or
      // TMDB is unreachable) AND a single retry on transient failures
      // (5xx response or network TypeError). Timeouts (AbortError) and
      // 4xx responses are NOT retried.
      //
      // API key is injected by the server proxy — no need to include
      // it here. On the server we need an absolute URL (see apiBaseUrl()
      // doc).
      const res = await fetchWithRetry(`${apiBaseUrl()}${API}${finalEndpoint}`);
      if (!res.ok) throw new TMDBError(res.status, finalEndpoint);
      return res.json() as Promise<T>;
    }
  );
}

export const fetchTmdbDetails = async (
  mediaType: string,
  id: string
): Promise<TMDBDetails> => {
  // append_to_response=videos,credits — fetches trailers AND cast/crew
  // in one request. The credits payload populates TMDBDetails.credits,
  // which the DetailsCast component reads to render cast & crew with
  // images (replacing the text-only OMDb actors list).
  //
  // v2.4: include_video_language=en,null — also include videos with no
  // language tag (covers most international trailers that aren't tagged
  // en-US). This fixes the bug where some titles showed NO trailer
  // button in the Details modal because their only trailers were tagged
  // with a non-English language or no language at all. The list of
  // languages is intentionally narrow (en,null) to keep the payload
  // small — if a title has only non-English trailers, the
  // useDetailsActions hook falls back to a separate /videos fetch
  // without language filter (see fetchAnyVideoKey below).
  //
  // v2.6: For TV series, also append `aggregate_credits`. TMDB's
  // regular /tv/{id}/credits endpoint only returns a SMALL subset of
  // the cast (often just 1-2 people for older shows like *Dark*) —
  // it's meant for "current season" cast. The aggregate_credits
  // endpoint lists EVERY person who appeared in ANY episode across
  // ALL seasons, with per-season/per-episode role detail. This is
  // the source of truth for TV series cast. Movies don't have
  // aggregate_credits, so we only append it for TV.
  const appendParts =
    mediaType === "tv" ? "videos,credits,aggregate_credits" : "videos,credits";
  return tmdbFetch<TMDBDetails>(
    `/${mediaType}/${id}?language=en-US&append_to_response=${appendParts}&include_video_language=en,null`
  );
};

/**
 * Fetch TMDB person details by id.
 * Used by the PersonModal to show biography, birthday, place of birth,
 * known_for_department, etc.
 */
export async function fetchPersonDetails(
  personId: number | string
): Promise<TMDBPerson | null> {
  try {
    return await tmdbFetch<TMDBPerson>(`/person/${personId}?language=en-US`);
  } catch (err) {
    console.warn(`[tmdb] Failed to fetch person/${personId}:`, err);
    return null;
  }
}

/**
 * Fetch a person's combined credits (movies + TV in one payload).
 * Used by the PersonModal to show the full filmography grid. The
 * `cast` array is acting roles, `crew` is behind-the-scenes work.
 */
export async function fetchPersonCombinedCredits(
  personId: number | string
): Promise<TMDBPersonCombinedCredits | null> {
  try {
    return await tmdbFetch<TMDBPersonCombinedCredits>(
      `/person/${personId}/combined_credits?language=en-US`
    );
  } catch (err) {
    console.warn(
      `[tmdb] Failed to fetch person/${personId}/combined_credits:`,
      err
    );
    return null;
  }
}

/**
 * Fetch lightweight TMDB metadata (title, poster, backdrop, release date,
 * vote average) for a single movie or TV title by its TMDB id.
 *
 * Used by the vault enrichment layer (userLibraryAdapter) to fill in
 * display fields that are NOT stored in the Supabase `vault` table.
 * The vault only stores user-owned state (status, rating, notes) + the
 * TMDB id — the title/poster must be fetched from TMDB on every load.
 *
 * v3 — CREDITS FOR SEARCH:
 *   Now requests `append_to_response=credits` so the cast & crew are
 *   available to power vault search by actor/director name. The full
 *   credits payload can be 50-100KB per title, which would blow past
 *   localStorage limits if cached. So we extract a space-efficient
 *   summary BEFORE returning:
 *     - `director` (string) — first crew member with `job === "Director"`
 *     - `castList` (string[]) — top 15 cast names (by `order`)
 *   The full `credits` object is stripped from the returned TMDBTitle
 *   so it's never persisted to the tmdb_cache table or localStorage.
 *   userLibraryAdapter maps `director` + `castList` onto the
 *   WatchlistItem, where matchSearch() picks them up.
 *
 * Returns null on error so the caller can fall back to "Untitled" /
 * "NO POSTER" placeholders rather than crashing the whole vault render.
 *
 * @param mediaType "movie" | "tv"
 * @param id        TMDB numeric id (as stored in vault.tmdb_id)
 */
export async function fetchTmdbMetadata(
  mediaType: "movie" | "tv",
  id: number | string
): Promise<TMDBTitle | null> {
  // Phase 15 QA Bug #3 (round 3): short-circuit if this TMDB ID is
  // already known to 404. Browser network 404s are logged by the
  // browser NATIVELY and cannot be silenced via JS — the only way to
  // stop the red console noise is to NOT MAKE THE REQUEST. By checking
  // the failedTmdb404s Set first, we skip the network fetch entirely
  // for IDs that have previously returned 404 (e.g. stale AniList↔TMDB
  // mappings that re-trigger on every Discover page load).
  if (isKnownTmdb404(mediaType, id)) {
    return null;
  }

  try {
    // v5 optimization: Only append credits when fetching a single title
    // for the Details page. For batch enrichment (vault/watchlist),
    // use the lightweight variant without credits — cards only need
    // title + poster + date + genres, not full cast + crew. This cuts
    // the per-request payload ~3-5x and dramatically speeds up cold-
    // cache vault loads (from 20-25s to ~5-8s for a 1000-item vault).
    const data = await tmdbFetch<TMDBTitle>(
      `/${mediaType}/${id}?language=en-US`
    );

    // ── Extract director + top 15 cast names from credits ──────────
    // We keep ONLY the names — not the full credits objects — so the
    // cached TMDBTitle stays small (~1KB instead of ~50-100KB).
    let director: string | undefined;
    let castList: string[] | undefined;
    const credits = data?.credits;
    if (credits) {
      // Director: first crew member with job === "Director" (TMDB
      // typically lists the primary director first). TV series often
      // have many directors across episodes; we take the first to
      // keep the field a single searchable string.
      if (Array.isArray(credits.crew)) {
        for (const member of credits.crew) {
          if (member && member.job === "Director" && member.name) {
            director = member.name;
            break;
          }
        }
      }
      // Cast: top 15 by `order` (TMDB sorts by billing — order 0 is
      // the lead). 15 is enough to cover the main cast users search
      // for without bloating the cache entry.
      if (Array.isArray(credits.cast)) {
        const top: string[] = [];
        for (let i = 0; i < credits.cast.length && top.length < 15; i++) {
          const c = credits.cast[i];
          if (c && c.name) top.push(c.name);
        }
        if (top.length > 0) castList = top;
      }
    }

    // Strip the full credits payload before returning so it's not
    // cached. The extracted director + castList are the space-efficient
    // summary that powers vault search.
    const { credits: _strippedCredits, ...trimmed } = data;
    return {
      ...trimmed,
      media_type: mediaType,
      ...(director !== undefined && { director }),
      ...(castList !== undefined && { castList })
    };
  } catch (err) {
    // 404s are expected when batch-fetching auto-mapped AniList↔TMDB
    // IDs (the auto-mapper sometimes matches to deleted/stale TMDB
    // entries). Silently return null for these — the caller (typically
    // fetchTmdbMetadataBatch) already filters nulls out of the result.
    //
    // Other errors (5xx, network, timeout) are real failures and
    // should be logged so we can debug them.
    //
    // Phase 15 QA Bug #3: uses the shared isTmdb404() helper so the
    // 404-detection logic is consistent across all TMDB callers.
    //
    // Phase 15 QA Bug #3 (round 3): record the 404'd ID in the
    // failedTmdb404s Set so SUBSEQUENT fetches for the same ID are
    // short-circuited at the top of this function — no network request,
    // no browser 404, no console noise. The first 404 is unavoidable
    // (we have to try once to discover it's missing), but repeat
    // fetches (e.g. on the next Discover page load) are silenced.
    if (isTmdb404(err)) {
      recordFailedTmdb404(tmdb404Key(mediaType, id));
      return null;
    }
    console.warn(`[tmdb] Failed to fetch ${mediaType}/${id}:`, err);
    return null;
  }
}

/**
 * Batch-fetch TMDB metadata for multiple vault items.
 *
 * Fires all requests in parallel (Promise.allSettled) so one slow/failing
 * request doesn't block the others. Returns a Map keyed by "{media_type}/{id}"
 * for O(1) lookup during vault enrichment.
 *
 * 404 HANDLING:
 *   When called from the anime carousels path, some IDs will 404 because
 *   the auto-mapper matched an AniList anime to a stale / deleted TMDB
 *   entry. These are EXPECTED failures — the batch simply skips them.
 *   We detect 404s via the TMDBError class and skip them silently
 *   (no console.warn) so the console doesn't fill up with noise on
 *   every Discover page load.
 *
 *   Other errors (5xx, network, etc.) ARE logged so we can debug them.
 *
 * @param items Array of { mediaType, tmdbId } pairs.
 * @returns Map<"movie|tv/{id}", TMDBTitle>
 */
export async function fetchTmdbMetadataBatch(
  items: ReadonlyArray<{ mediaType: "movie" | "tv"; tmdbId: number | string }>
): Promise<Map<string, TMDBTitle>> {
  const map = new Map<string, TMDBTitle>();

  // ── CHUNKED PARALLEL FETCH — prevents main-thread blocking ────────
  // Previously: Promise.allSettled(items.map(fetchTmdbMetadata)) fired
  // ALL 1029 requests simultaneously. This caused:
  //   1. Browser connection pool exhaustion (Chrome: max 6 per host)
  //   2. 1029 Promise resolutions queued as microtasks on the main thread
  //   3. 1029 JSON.parse() calls in a tight loop once responses arrive
  //   4. GC pressure from 1029 Promise + Response + JSON objects
  //
  // Measured impact: ~3600ms input delay on first Watchlist load (1029
  // items). The main thread was blocked processing microtask queues
  // for the simultaneous response handling.
  //
  // Fix: process in chunks of CHUNK_SIZE (20). Each chunk's responses
  // are settled before the next chunk fires, keeping the microtask
  // queue short and yielding to the main thread between chunks. This
  // turns one 3600ms blocking task into ~52 chunks of ~70ms each,
  // each separated by an await yield.
  //
  // The cache (apiCache, 10-min TTL) means subsequent loads are instant
  // — this fix only affects the FIRST load of a large vault.
  // v5: increased from 20 to 40 — without credits, each request is ~3-5x
  // lighter, so we can safely double the chunk size without risking browser
  // connection pool exhaustion. This halves the number of sequential chunks
  // for a 1000-item vault from 50 to 25.
  const CHUNK_SIZE = 40;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map((item) => fetchTmdbMetadata(item.mediaType, item.tmdbId))
    );
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled" && result.value) {
        const item = chunk[j];
        map.set(`${item.mediaType}/${item.tmdbId}`, result.value);
      }
      // Rejected promises are already logged inside fetchTmdbMetadata
      // (with 404s silenced via TMDBError detection). No need to log
      // again here.
    }
  }
  return map;
}

export const fetchSeasonDetails = async (
  tvId: string | number,
  seasonNumber: number
): Promise<TMDBSeasonDetails> => {
  return tmdbFetch<TMDBSeasonDetails>(
    `/tv/${tvId}/season/${seasonNumber}?language=en-US`
  );
};

export const fetchCollectionDetails = async (
  collectionId: number
): Promise<TMDBCollection> => {
  return tmdbFetch<TMDBCollection>(
    `/collection/${collectionId}?language=en-US`
  );
};

/**
 * Fetch the watch providers (streaming/rent/buy) for a single movie or TV
 * title in a specific region.
 *
 * TMDB endpoint: /{mediaType}/{id}/watch/providers
 *
 * Returns the raw TMDB `results` object keyed by ISO 3166-1 country code.
 * Each country entry has:
 *   - link: TMDB watch page URL
 *   - flatrate: streaming providers (subscription)
 *   - rent: rental providers
 *   - buy: purchase providers
 *   - free: free (ad-supported) providers
 *   - ads: ad-supported providers
 *
 * Returns null on error so the caller can silently hide the section.
 */
export async function fetchTitleWatchProviders(
  mediaType: "movie" | "tv",
  id: number | string
): Promise<TMDBWatchProviderResults | null> {
  try {
    const data = await tmdbFetch<TMDBWatchProviderResponse>(
      `/${mediaType}/${id}/watch/providers?language=en-US`
    );
    return data?.results ?? null;
  } catch (err) {
    console.warn(
      `[tmdb] Failed to fetch watch/providers for ${mediaType}/${id}:`,
      err
    );
    return null;
  }
}

/**
 * Pick the best trailer from a TMDB details payload.
 *
 * v2.4: Broadened scoring so titles with NO Trailer/Teaser still surface
 * a playable video. Priority order:
 *   1. Official Trailer (+15)
 *   2. Official Teaser (+12)
 *   3. Trailer (+10)
 *   4. Teaser (+5)
 *   5. Official Clip / Featurette / Behind the Scenes / Bloopers (+6)
 *   6. Clip / Featurette / Behind the Scenes / Bloopers (+2)
 *   7. Any other YouTube video (+0)
 *
 * Also accepts Vimeo as a last-resort fallback (returns a key, but the
 * UI is currently YouTube-only — the caller should treat Vimeo keys as
 * "no playable trailer" unless they add a Vimeo player).
 *
 * Returns null if NO playable video (any site) is available.
 */
export const pickTrailer = (
  details: TMDBDetails | null
): {
  key: string;
  name: string;
} | null => {
  const videos = details?.videos?.results;
  if (!videos || videos.length === 0) return null;

  // Prefer YouTube; fall back to Vimeo only if no YouTube at all.
  const youTube = videos.filter((v) => v.site === "YouTube");
  const vimeo = videos.filter((v) => v.site === "Vimeo");
  const pool = youTube.length > 0 ? youTube : vimeo;
  if (pool.length === 0) return null;

  const EXTRA_TYPES = new Set([
    "Clip",
    "Featurette",
    "Behind the Scenes",
    "Bloopers",
    "Recap",
    "Opening Credits"
  ]);

  const score = (v: (typeof pool)[number]): number => {
    let s = 0;
    if (v.type === "Trailer") s += 10;
    if (v.type === "Teaser") s += 5;
    if (EXTRA_TYPES.has(v.type)) s += 2;
    if (v.official) s += 5;
    return s;
  };

  const best = [...pool].sort((a, b) => score(b) - score(a))[0];
  return best ? { key: best.key, name: best.name } : null;
};

/**
 * v2.4: Fallback trailer fetch for titles whose main /details payload
 * had NO playable YouTube video (i.e. pickTrailer returned null).
 *
 * Why this is needed: fetchTmdbDetails uses language=en-US + the
 * `include_video_language=en,null` filter, which only returns English +
 * null-language videos. Many international titles (Bollywood, K-dramas,
 * anime) have trailers ONLY in their original language — those won't
 * appear in the main payload.
 *
 * This helper fetches /{mediaType}/{id}/videos with NO language filter
 * (which defaults to en-US but is broader in practice) AND with
 * `include_video_language` set to a list of common source languages.
 * It then re-runs the same pickTrailer-style scoring on the combined
 * results.
 *
 * Returns the best video key found, or null if still none.
 */
export async function fetchAnyVideoKey(
  mediaType: "movie" | "tv",
  id: number | string
): Promise<string | null> {
  try {
    const endpoint = `/${mediaType}/${id}/videos?language=en-US&include_video_language=en,null,hi,ja,ko,zh,es,fr,de,it,pt,ru,ta,te,mr,bn`;
    const data = await tmdbFetch<{ results: TMDBVideo[] }>(endpoint);
    const videos = data?.results ?? [];
    if (videos.length === 0) return null;

    const youTube = videos.filter((v) => v.site === "YouTube");
    if (youTube.length === 0) return null;

    const EXTRA_TYPES = new Set([
      "Clip",
      "Featurette",
      "Behind the Scenes",
      "Bloopers",
      "Recap",
      "Opening Credits"
    ]);

    const score = (v: (typeof youTube)[number]): number => {
      let s = 0;
      if (v.type === "Trailer") s += 10;
      if (v.type === "Teaser") s += 5;
      if (EXTRA_TYPES.has(v.type)) s += 2;
      if (v.official) s += 5;
      return s;
    };

    const best = [...youTube].sort((a, b) => score(b) - score(a))[0];
    return best?.key ?? null;
  } catch (err) {
    console.warn(`[tmdb] fetchAnyVideoKey failed for ${mediaType}/${id}:`, err);
    return null;
  }
}
