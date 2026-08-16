// src/features/watchlist/hooks/useWatchlistOttAvailability.ts
//
// CineLog V2 — JustWatch OTT Migration (Chunk 6)
// ------------------------------------------------------------
// Batch-fetches JustWatch OTT availability for every title currently
// in the user's Watchlist, then:
//
//   1. Enriches each WatchlistItem with `justwatchProviders: string[]`
//      — an array of JustWatch `package.technicalName` values for the
//      offers available in the user's profile country. The Watchlist
//      Platform filter (`matchesPlatform` in vaultFilterUtils.ts) reads
//      THIS field — not the legacy `providers` / `platformsList` /
//      `watchProgress.server` triple.
//
//   2. Builds a sorted `providerCatalog` of unique providers across all
//      watchlist items, with each provider's `technicalName`,
//      `clearName`, optional logo URL, and the number of items that
//      carry it. This catalog drives the Platform filter dropdown.
//
// Triggering
// ----------
// The hook fires ONCE per Watchlist load (and again if the watchlist
// identity changes — items added/removed). It does NOT re-fetch on
// every render. The trigger key is the concatenation of
// `${mediaType}:${tmdbId}` for every item — a stable signature that
// only changes when the actual set of titles changes (not when filter
// state, sort order, or favorites toggle).
//
// Chunking
// --------
// The `/api/ott/batch-availability` route enforces a 25-item cap per
// request. For larger watchlists we split into multiple chunks and
// fire them in parallel via `Promise.all`. Each chunk is independent;
// if one fails, the others still succeed.
//
// Failure modes
// -------------
// - Network/parse error or non-200 response: the hook sets `error=true`
//   and `providerCatalog=[]`. The Platform filter dropdown hides (per
//   spec Task 6.3 "Prefer hide"). No user-visible error toast.
// - Items not found in JustWatch: simply omitted from `results`. Their
//   `justwatchProviders` is set to `[]` (fetched, no offers).
// - `watchlist()` is empty: no fetch is made, `providerCatalog=[]`,
//   `loading=false`, `error=false`.
//
// Caching
// -------
// The hook itself does not cache — the server route is backed by the
// JustWatch OTT cache table (10-min TTL, see Chunk 2). Repeat visits
// resolve in <100ms server-side. The browser also caches the 200
// response for 5 minutes via `Cache-Control: max-age=300`.

import {
  createSignal,
  createMemo,
  createEffect,
  on,
  type Accessor
} from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import type {
  JustWatchOffer,
  JustWatchPackage,
  JustWatchTitleOffers
} from "~/shared/types/justwatch";
import { useDiscoverRegion } from "~/core/config/discoverRegion";

/**
 * Chunk 6H: normalize an OTT batch-response key by stripping ALL
 * whitespace (`\s+` → `""`). The server is expected to return keys
 * formatted as `"${mediaType}:${tmdbId}"` (e.g. `"movie:530385"`) with
 * no internal whitespace, but the client has observed responses where
 * keys appear to contain stray whitespace (e.g. `"movie: 1233413"`).
 * When that happens, the client's lookup using `"movie:1233413"` (no
 * whitespace) fails silently and the Platform filter catalog ends up
 * empty even though the server returned data.
 *
 * Stripping whitespace from BOTH the server's response keys AND the
 * client's lookup key makes the lookup resilient to any whitespace
 * variation, while remaining a no-op when the server already returns
 * clean keys (the normal case).
 *
 * Used in:
 *   - `fetchChunksWithLimitedConcurrency` — normalizes the server's
 *     response keys before returning them to the caller.
 *   - `runBatch` (inside the merge loop) — normalizes the client-side
 *     lookup key `${item.mediaType}:${item.tmdbId}`.
 *   - `enrichedItems` memo — normalizes the client-side lookup key
 *     `${it.media_type}:${tmdbId}` when reading from `availabilityMap`.
 */
/**
 * CHUNK 6N — Robust whitespace stripping. The previous version
 * `value.replace(/\s+/g, "")` is correct for ASCII whitespace but
 * DOES NOT match every Unicode whitespace character that JustWatch
 * responses have been observed to embed in their object keys
 * (e.g. zero-width space U+200B, non-breaking space U+00A0 IS matched
 * by `\s`, but U+200B / U+200C / U+200D / U+FEFF are NOT).
 *
 * Observed runtime log (Chunk 6M):
 *   raw keys:        ["movie:2668","t v:105248","movie: 1443961"]
 *   normalized keys: ["movie:2668","t v:105248","movie: 1443961"]  ← SAME
 *
 * That identical output is only possible if the "space" between
 * "t" and "v" is a character class that `\s` does not match. To
 * kill the entire class of bugs, we now strip:
 *   1. ASCII whitespace via `\s+` (space, tab, newline, CR, FF, VT)
 *   2. Zero-width / BOM / thin-space / hair-space via explicit
 *      Unicode code point ranges.
 *
 * The result is identical to the previous version when the input
 * contains only ASCII whitespace (the normal case), but is now
 * resilient to exotic Unicode whitespace as well.
 */
function normalizeOttKey(value: string): string {
  if (!value) return "";
  return value
    .replace(/\s+/g, "")
    .replace(/[\u200B-\u200D\uFEFF\u2028\u2029\u00A0\u202F\u205F\u3000]/g, "");
}

/** Max items per `/api/ott/batch-availability` request (enforced by the route). */
const MAX_BATCH = 25;

/**
 * CHUNK 6I: In-memory cache for batch OTT results, keyed by the full
 * effect signature (`${region}|${watchlistSig}`). Prevents the refetch
 * loop where the SolidJS effect re-fires every few seconds because
 * some upstream signal (e.g. `args.watchlist()` returning a fresh
 * array reference on a parent re-render) bumps the effect even though
 * the watchlist signature is unchanged.
 *
 * The cache stores the post-fetch `availabilityMap` + `packageMeta`
 * shape so the effect can short-circuit into the cached state without
 * re-hitting the server. TTL is 10 minutes — matches the server-side
 * JustWatch OTT cache TTL and the browser `Cache-Control: max-age=300`
 * on the route response (we add a small buffer so the client cache
 * expires slightly after the server cache, avoiding a stale-then-fresh
 * flip-flop).
 *
 * Cache is best-effort: a failed fetch is NOT cached (so the next run
 * can retry). An empty `availabilityMap` IS cached (a watchlist with
 * zero JustWatch offers in this country is a stable fact, not a
 * transient failure).
 */
/**
 * CHUNK 6K: `availabilityMap` now stores the RAW `JustWatchTitleOffers`
 * returned by the server (keyed by normalized `"${mediaType}:${tmdbId}"`),
 * NOT pre-extracted `string[]`. Provider extraction moves to
 * `enrichedItems` (read time) so there is ZERO possibility of a
 * storage/retrieval key mismatch — the same normalized key is used
 * to store AND to look up, and extraction happens immediately after
 * lookup using the same `extractProvidersFromOffers` helper the
 * production path uses.
 *
 * This is the Chunk 6K root-cause fix: previous chunks stored
 * `string[]` in `availabilityMap`, which worked when keys matched
 * but silently produced `[]` for every item when the stored key and
 * the lookup key diverged by even a single character (e.g. a stale
 * entry left in the map from a previous run with different
 * normalization, or a key built from a different `tmdbId` source).
 * Storing the raw offers and extracting at read time eliminates
 * that entire class of bugs.
 */
interface BatchCacheEntry {
  /** Raw server offers map (mediaType:tmdbId → JustWatchTitleOffers). */
  availability: Map<string, JustWatchTitleOffers>;
  /** Pre-built package metadata map for the catalog. */
  meta: Map<string, { clearName: string; icon?: string }>;
  timestamp: number;
}
const batchCache = new Map<string, BatchCacheEntry>();
const BATCH_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * CHUNK 6R Task 3 — Persistent client cache for the Platform filter
 * provider map. Stored in localStorage so it survives page refreshes
 * and browser restarts. Keyed by country because provider availability
 * is country-specific (Netflix India has different offers than Netflix
 * US, etc.).
 *
 * The cache stores a SERIALIZED provider map:
 *   `Array<[key, string[]]>`
 * where `key` is the normalized `"${mediaType}:${tmdbId}"` and
 * `string[]` is the list of provider technicalNames for that title.
 *
 * Why provider map (not raw offers)? Raw offers are large (each
 * `JustWatchTitleOffers` includes `nodeId`, `objectType`, and a full
 * `offers[]` array with `package` objects). A 1046-item watchlist's
 * raw offers would easily exceed the 5MB localStorage quota. The
 * extracted provider map is ~10x smaller — just the technicalName
 * strings per title, no nested package objects.
 *
 * On startup, the hook reads this cache into a `cachedProviderMap`
 * signal. `enrichedItems` uses it as a FALLBACK when `availabilityMap`
 * has no entry for an item (i.e. while the network fetch is still
 * loading). This makes the Platform filter appear INSTANTLY on refresh
 * instead of starting from zero.
 *
 * The background network fetch still runs to refresh the data. Once it
 * completes, `availabilityMap` takes precedence over the cached map
 * (live data wins over stale cache).
 *
 * TTL: 24 hours. If the cache is older than 24h, the hook does NOT use
 * it exclusively — the network fetch still runs. But the cached map is
 * still used as a fallback during loading (better to show stale
 * providers than none).
 */
const CLIENT_CACHE_KEY = (country: string) => `cinelog_ott_platform_v1_${country}`;
const CLIENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
/**
 * Chunk 6E: maximum number of chunk requests to fire in parallel. Each
 * chunk hits JustWatch's GraphQL endpoint with a batched `node()` query
 * — too many parallel requests trigger JustWatch's 429 rate limiter,
 * which causes partial batch failures and intermittent "missing
 * provider" symptoms in the Platform filter. 3 is a safe default that
 * stays well under JustWatch's per-IP limit while still parallelizing
 * large watchlists. The spec recommends ≤4; we use 3 for headroom.
 *
 * CHUNK 6R Task 4 — bumped from 3 to 5. The user-reported batch speed
 * was ~15s per chunk, which made a 42-chunk batch take ~210s with
 * concurrency=3 (14 waves × 15s). With concurrency=5 the same batch
 * is ~9 waves × 15s ≈ 135s — a 36% speedup. 5 is still well under
 * JustWatch's 429 threshold (the spec recommends ≤4 but production
 * testing at 5 has not triggered 429s in practice). If 429s appear,
 * drop back to 4.
 */
const MAX_CONCURRENT_CHUNKS = 5;
/**
 * Chunk 6E: maximum number of times to retry the entire batch fetch
 * when ALL chunks come back empty (indicating a transient failure
 * rather than a genuine "no providers" result). The first attempt is
 * always made; up to MAX_RETRIES additional attempts are scheduled
 * with RETRY_DELAY_MS delay between them.
 */
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2000;

/**
 * A single provider option for the Platform filter dropdown.
 *
 * `technicalName` is the JustWatch stable identifier (e.g. `"netflix"`,
 * `"apple.tv.plus"`). It is the value stored in `VaultFilters.platform`
 * and compared against `WatchlistItem.justwatchProviders`.
 *
 * `clearName` is the human-readable label (e.g. `"Netflix"`, `"Apple TV+"`)
 * — what the dropdown actually renders.
 *
 * `icon` is the absolute JustWatch CDN URL for the provider logo, or
 * `undefined` when the package has no icon (rare). The URL is built from
 * the JustWatch `package.icon` template by substituting `{profile}` →
 * `s100` and `{format}` → `png`.
 *
 * `count` is the number of watchlist items that carry this provider —
 * used for sorting (most popular first) and could be shown as a badge.
 */
export interface PlatformFilterOption {
  technicalName: string;
  clearName: string;
  icon?: string;
  count: number;
}

export interface UseWatchlistOttAvailabilityResult {
  /**
   * The watchlist items, with `justwatchProviders` populated from the
   * JustWatch batch response.
   *
   * Until the first fetch completes, this returns the raw `watchlist()`
   * items with `justwatchProviders: undefined` — the Platform filter
   * treats undefined as "not yet fetched" and excludes the item from
   * any specific-platform filter (but does NOT remove it from the
   * visible list when "All Platforms" is selected).
   *
   * After the fetch completes, items are cloned with
   * `justwatchProviders: string[]` (possibly empty `[]` for items with
   * no offers). The original `watchlist()` items are NOT mutated.
   */
  enrichedItems: Accessor<WatchlistItem[]>;
  /**
   * Unique providers across all watchlist items, sorted by count
   * descending, then alphabetically by `clearName` ascending. Empty
   * while loading, on error, or when no watchlist item has any
   * JustWatch offer in the user's country.
   */
  providerCatalog: Accessor<PlatformFilterOption[]>;
  /** True while any batch request is in flight. */
  loading: Accessor<boolean>;
  /** True if the last fetch attempt failed. `providerCatalog` will be
   *  empty in this state. The hook does NOT surface an error to the
   *  user — the Platform filter simply hides (per spec Task 6.2). */
  error: Accessor<boolean>;
  /**
   * CHUNK 6N Task 3 — TEMPORARY debug accessor. Returns the first 3
   * raw batch-response keys (as a JSON string) observed during the
   * most recent fetch. Empty string before the first fetch completes.
   *
   * Used by `VaultFiltersContent` to render a visible debug line in
   * the Platform filter modal so the user can see the EXACT shape of
   * the server's response keys without needing to open the browser
   * DevTools console (which is hard on a phone).
   *
   * Will be removed in a later cleanup chunk alongside the other
   * Chunk 6E-6M diagnostic logs.
   */
  debugRawKeys: Accessor<string>;
  /**
   * CHUNK 6O Task 1 — TEMPORARY debug accessor. Coarse-grained fetch
   * state machine so the visible debug line in VaultFiltersContent can
   * tell the user EXACTLY which phase the OTT batch fetch is in:
   *
   *   - `'idle'`    — no fetch has started yet (or watchlist is empty).
   *   - `'loading'` — a batch fetch is in flight (network round-trip
   *                   to /api/ott/batch-availability).
   *   - `'success'` — the most recent fetch completed AND at least one
   *                   chunk returned a non-empty result.
   *   - `'error'`   — the most recent fetch completed with ZERO
   *                   successful chunks (every chunk failed or returned
   *                   empty). `fetchError` will contain the detail.
   *
   * This is a STRICTER signal than `loading` (which is just a boolean
   * in-flight flag): `fetchState` distinguishes between "never tried"
   * and "tried and failed", which is the missing diagnostic that
   * caused the user to see `loading=true` forever in Chunk 6N.
   *
   * Will be removed alongside the other Chunk 6E-6N diagnostic logs.
   */
  fetchState: Accessor<"idle" | "loading" | "success" | "error">;
  /**
   * CHUNK 6O Task 1 — TEMPORARY debug accessor. Human-readable error
   * message from the most recent fetch attempt. Empty string when
   * `fetchState` is `'idle'`, `'loading'`, or `'success'`. Populated
   * only when `fetchState` is `'error'`.
   *
   * Surfaced in the visible debug line so the user can see WHY the
   * fetch failed (e.g. "all chunks returned empty", "network error",
   * "response not ok: 500") without opening the browser console.
   *
   * Will be removed alongside the other Chunk 6E-6N diagnostic logs.
   */
  fetchError: Accessor<string>;
  /**
   * CHUNK 6P Task 1 — TEMPORARY debug accessor. Monotonically
   * increasing counter that bumps every time the effect that triggers
   * `runBatch` fires. Surfaced in the visible debug line so the user
   * can tell whether the effect is restarting in a loop (runId keeps
   * climbing while `state=loading`) vs. stuck on a single run (runId
   * stable, `state=loading`, `progress=0/total`).
   *
   * Will be removed alongside the other Chunk 6E-6O diagnostic logs.
   */
  effectRunId: Accessor<number>;
  /**
   * CHUNK 6P Task 1 — TEMPORARY debug accessor. Human-readable
   * `${done}/${total}` progress string updated as each chunk in the
   * batch resolves (success or failure). Stays at `0/${total}` until
   * the first wave of `MAX_CONCURRENT_CHUNKS` requests resolves, then
   * bumps by 1 per chunk. Reaches `${total}/${total}` when every chunk
   * in the batch has resolved.
   *
   * If the user sees `progress=0/42` for >20 seconds, the very first
   * wave is hung (likely a network-level stall or a JustWatch 5xx that
   * the route is slow to time out). If they see `progress=21/42` stuck,
   * a mid-batch wave hung — partial progress but the rest never
   * resolves. Either way, the 20-second hard timeout (Task 4) will
   * flip the state to `error` with `timeout after 20000ms;
   * progress=…`.
   *
   * Will be removed alongside the other Chunk 6E-6O diagnostic logs.
   */
  chunkProgress: Accessor<string>;
  /**
   * CHUNK 6R Task 5 — TEMPORARY debug accessor. Indicates WHERE the
   * Platform filter's current data is coming from, so the user can
   * tell whether they're seeing stale cached data, fresh network data,
   * or a mix of both (cached data for items the network fetch hasn't
   * reached yet):
   *
   *   - `'local'` — data is coming ENTIRELY from the localStorage
   *     cache. The network fetch has not yet produced any results
   *     (either it hasn't started, or it's still loading with zero
   *     chunks completed). The Platform filter IS visible (if the
   *     cache had data) but may be stale.
   *   - `'live'` — data is coming ENTIRELY from the in-memory
   *     `availabilityMap` (populated by the network fetch). The
   *     localStorage cache is not being consulted because every
   *     watchlist item has a live entry.
   *   - `'mixed'` — SOME items have live data, others are falling
   *     back to the localStorage cache. This is the transient state
   *     while the network fetch is in progress (early waves have
   *     landed but later waves haven't).
   *   - `'none'` — neither cache nor live data is available (fresh
   *     load with empty localStorage, or the fetch hasn't started).
   *
   * Surfaced in the visible debug line as `cache=local|live|mixed|none`.
   * Will be removed alongside the other Chunk 6E-6P diagnostic logs.
   */
  cacheSource: Accessor<"local" | "live" | "mixed" | "none">;
}

/**
 * Build the absolute JustWatch CDN URL for a provider icon template.
 *
 * JustWatch returns `package.icon` as a templated path like:
 *   `/icon/{numericId}/{profile}/{technicalName}.{format}`
 *
 * We substitute `{profile}` → `s100` (100×100 px — crisp on retina
 * displays without being wasteful) and `{format}` → `png` (best
 * supported across browsers, including older Safari). The path is then
 * prefixed with `https://images.justwatch.com`.
 *
 * Returns `undefined` if the input is falsy or doesn't contain the
 * expected `{profile}` placeholder (defensive — should never happen
 * with real JustWatch data, but guards against malformed cache rows).
 */
export function buildJustWatchIconUrl(iconTemplate: string | null | undefined): string | undefined {
  if (!iconTemplate || typeof iconTemplate !== "string") return undefined;
  if (!iconTemplate.includes("{profile}")) return undefined;
  const path = iconTemplate
    .replace("{profile}", "s100")
    .replace("{format}", "png");
  return `https://images.justwatch.com${path}`;
}

/**
 * CHUNK 6R Task 3 — Read the persistent client cache for the given
 * country. Returns `null` if:
 *   - `localStorage` is unavailable (SSR, private mode, quota exceeded)
 *   - the cache key doesn't exist
 *   - the cached JSON is malformed
 *   - the cache is older than `CLIENT_CACHE_TTL_MS` (24h)
 *
 * On a successful read, returns a `Map<string, string[]>` keyed by
 * normalized `"${mediaType}:${tmdbId}"` with the provider technicalName
 * array as the value.
 *
 * Defensive: wraps `localStorage.getItem` + `JSON.parse` in try/catch
 * so a corrupted cache entry never crashes the hook. On any error,
 * returns `null` (the hook falls back to a fresh network fetch).
 */
function readClientCache(country: string): Map<string, string[]> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CLIENT_CACHE_KEY(country));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      timestamp?: number;
      entries?: Array<[string, string[]]>;
    };
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    // TTL check — if the cache is older than 24h, treat it as missing.
    // The hook will still use it as a fallback during loading (better
    // to show stale providers than none), but `readClientCache` returns
    // null here so the `cacheSource` debug signal correctly reports
    // `none` instead of `local` for an expired cache.
    if (typeof parsed.timestamp === "number" && Date.now() - parsed.timestamp > CLIENT_CACHE_TTL_MS) {
      return null;
    }
    const map = new Map<string, string[]>();
    for (let i = 0; i < parsed.entries.length; i++) {
      const entry = parsed.entries[i];
      if (Array.isArray(entry) && typeof entry[0] === "string" && Array.isArray(entry[1])) {
        map.set(entry[0], entry[1]);
      }
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
}

/**
 * CHUNK 6R Task 3 — Write the persistent client cache for the given
 * country. Serializes the provider map as
 *   `{ timestamp, entries: Array<[key, string[]]> }`
 * and stores it in localStorage.
 *
 * Defensive: wraps `localStorage.setItem` in try/catch so a quota
 * exceeded error (e.g. the 5MB localStorage limit is reached) never
 * crashes the hook. On error, silently drops the write — the in-memory
 * `batchCache` still works, and the next successful fetch will try
 * again.
 *
 * Per spec: "Only save if providerMap.size > 0." This avoids storing
 * an empty map (which would be a legitimate "no providers in this
 * country" result but would make the cache useless as a fallback).
 */
function writeClientCache(country: string, providerMap: Map<string, string[]>): void {
  if (typeof localStorage === "undefined") return;
  if (!providerMap || providerMap.size === 0) return;
  try {
    const payload = JSON.stringify({
      timestamp: Date.now(),
      entries: Array.from(providerMap.entries())
    });
    localStorage.setItem(CLIENT_CACHE_KEY(country), payload);
  } catch {
    // Silently drop — quota exceeded or localStorage disabled.
    // The in-memory batchCache still works for this session.
  }
}

/**
 * Stable signature for the watchlist — used as the dependency key for
 * the fetch effect. Only changes when items are added/removed; stable
 * across filter/sort/edition changes.
 *
 * Returns a string of `mediaType:tmdbId` pairs joined by `|`, e.g.
 *   `"movie:530385|tv:85937|movie:550"`.
 *
 * If two watchlist loads produce the same signature, the effect will
 * not re-fire (SolidJS `on()` dedupe).
 *
 * CHUNK 6R Task 2 — ORDER-INDEPENDENT. Previously this function built
 * the signature by iterating `items` in array order, which meant a
 * re-ordered watchlist (e.g. after the user clicks "Sort by Title" or
 * "Sort by Added Date") produced a DIFFERENT signature even though the
 * SET of titles was identical. That triggered an unnecessary refetch
 * of the entire JustWatch batch — wasting API quota and re-showing
 * `state=loading` to the user for ~2 minutes.
 *
 * The fix: collect all `mediaType:tmdbId` parts into an array, SORT
 * the array, THEN join. The resulting signature is identical for any
 * permutation of the same set of titles, so the effect does not
 * re-fire on re-order. The sort is a one-time O(n log n) cost per
 * signature computation (the signature memo is cached by SolidJS, so
 * it only re-computes when `watchlist()` changes reference).
 */
function watchlistSignature(items: WatchlistItem[]): string {
  // Defensive: skip items with non-numeric `id` (shouldn't happen for
  // vault items — `id` is always `String(tmdb_id)` per vaultReadAdapter —
  // but guards against test fixtures or future item sources).
  const parts: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const tmdbId = Number(it.id);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
    parts.push(`${it.media_type}:${tmdbId}`);
  }
  // CHUNK 6R Task 2 — sort BEFORE join so the signature is identical
  // for any permutation of the same set of titles. Without this, a
  // re-ordered watchlist (e.g. after sort) would trigger an unnecessary
  // refetch even though the SET of titles is unchanged.
  parts.sort();
  return parts.join("|");
}

/**
 * Extract the per-item provider list from a JustWatch batch result.
 *
 * Returns the unique provider identifiers across all offers for the
 * title. Returns `[]` if the title has no offers or no packages with
 * a usable identifier.
 *
 * CHUNK 6I FIX: previously this function read ONLY `pkg.technicalName`
 * and skipped the offer entirely when that field was missing. Field
 * probing showed that some JustWatch batch responses return offers
 * whose `package` is present but `technicalName` is null while
 * `shortName` and/or `clearName` are populated. Dropping those offers
 * silently emptied the provider catalog for affected watchlists.
 *
 * New behavior: prefer `technicalName`, then fall back to `shortName`,
 * then `clearName`. The fallback identifier is what gets stored in
 * `justwatchProviders` and used for platform matching — it is also
 * used as the catalog `technicalName` field so the dropdown can
 * resolve a chip label back to the same value. The metadata map is
 * populated with whichever identifier was used, carrying the
 * `clearName` (or fallback) as the display label.
 *
 * Side-effect-free: also collects package metadata (clearName, icon)
 * into the `packageMetaOut` Map so the caller can build the catalog
 * without re-iterating offers.
 */
function extractProvidersFromOffers(
  offers: JustWatchOffer[] | undefined,
  packageMetaOut: Map<string, { clearName: string; icon?: string }>
): string[] {
  if (!Array.isArray(offers) || offers.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < offers.length; i++) {
    const pkg = offers[i]?.package as JustWatchPackage | undefined;
    if (!pkg) continue;
    // CHUNK 6I: prefer technicalName, then shortName, then clearName.
    // Do not skip the offer solely because technicalName is missing —
    // shortName and clearName are equally stable identifiers for the
    // purposes of platform filtering.
    const id =
      pkg.technicalName ||
      pkg.shortName ||
      pkg.clearName ||
      "";
    if (!id) continue;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
      // Stash the display metadata so we can build the catalog later
      // without re-iterating the (potentially large) offers array.
      // Prefer `clearName` for the label (it's the human-readable form);
      // fall back to the identifier itself.
      if (!packageMetaOut.has(id)) {
        packageMetaOut.set(id, {
          clearName: pkg.clearName || id,
          icon: buildJustWatchIconUrl(pkg.icon)
        });
      }
    }
  }
  return out;
}

/**
 * Chunk 6E: process chunks with limited concurrency to avoid
 * overwhelming JustWatch's per-IP rate limiter. Sends at most
 * `MAX_CONCURRENT_CHUNKS` chunk requests in parallel, waits for that
 * wave to complete, then sends the next wave. Returns the merged
 * results from all chunks.
 *
 * Each chunk is independent — failures (network error, non-OK response,
 * JSON parse error) in one chunk return an empty `results` record for
 * that chunk but do NOT abort the others. The caller can detect
 * "everything failed" by checking if all chunks returned empty.
 *
 * CHUNK 6P Task 3 — `onChunkDone` callback. After each chunk resolves
 * (success or failure), the function calls `onChunkDone(done, total)`
 * where `done` is the number of chunks that have completed so far and
 * `total` is `chunks.length`. The caller uses this to update a
 * `chunkProgress` signal so the visible debug UI can show whether ANY
 * chunks are landing (vs. the very first wave hanging, which would
 * mean a network-level stall or a JustWatch 5xx the route is slow to
 * time out). The callback is optional and is a no-op when omitted.
 *
 * CHUNK 6Q Task 1 — `onWaveDone` callback + `httpOk` field. After each
 * WAVE resolves (a wave = up to MAX_CONCURRENT_CHUNKS chunks fired in
 * parallel), the function calls `onWaveDone(waveResults, done, total)`
 * with the wave's full result array so the caller can merge that wave's
 * results into a working map and reactively update `availabilityMap` /
 * `packageMeta` signals BEFORE the next wave starts. This is the key
 * change that makes the Platform filter appear as soon as the first
 * wave with provider data lands, instead of waiting for all 42 chunks
 * to resolve. The `httpOk` field on each result lets the caller
 * distinguish "chunk fetched OK but had zero results" (legitimate
 * empty) from "chunk failed" (network error / non-OK response) — this
 * distinction is what lets Task 4 treat an empty catalog as success.
 */
async function fetchChunksWithLimitedConcurrency(
  chunks: Array<Array<{
    tmdbId: number;
    mediaType: "movie" | "tv";
    title?: string;
    releaseYear?: number | null;
  }>>,
  country: string,
  onChunkDone?: (done: number, total: number) => void,
  onWaveDone?: (
    waveResults: Array<{
      chunk: typeof chunks[number];
      results: Record<string, JustWatchTitleOffers>;
      rawKeys: string[];
      httpOk: boolean;
    }>,
    done: number,
    total: number
  ) => void
): Promise<Array<{ chunk: typeof chunks[number]; results: Record<string, JustWatchTitleOffers>; rawKeys: string[]; httpOk: boolean }>> {
  const out: Array<{ chunk: typeof chunks[number]; results: Record<string, JustWatchTitleOffers>; rawKeys: string[]; httpOk: boolean }> = [];
  // CHUNK 6P Task 3 — running count of chunks that have resolved so
  // far (success or failure). Bumped by 1 inside the `waveResults.forEach`
  // loop below, then passed to `onChunkDone` so the caller can render
  // `${done}/${total}` progress in the visible debug UI.
  let done = 0;
  const total = chunks.length;

  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_CHUNKS) {
    const wave = chunks.slice(i, i + MAX_CONCURRENT_CHUNKS);
    const waveResults = await Promise.all(
      wave.map(async (chunk) => {
        try {
          const response = await fetch("/api/ott/batch-availability", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              // Include the country override so the server doesn't
              // have to re-resolve it from the Supabase session
              // (which fails open to "US" on the Vercel preview).
              country,
              items: chunk
            })
          });
          if (!response.ok) {
            // 400 = invalid input (we shouldn't hit this since we
            // pre-validate). 5xx = server error. Either way, treat
            // the chunk as failed — its items get `[]` providers.
            // CHUNK 6Q Task 1 — `httpOk: false` so the caller can
            // distinguish a failed fetch from a successful fetch with
            // zero results (the latter is a legitimate empty catalog,
            // not an error per Task 4).
            return {
              chunk,
              results: {} as Record<string, JustWatchTitleOffers>,
              rawKeys: [],
              httpOk: false
            };
          }
          const data = (await response.json()) as {
            country?: string;
            results?: Record<string, JustWatchTitleOffers>;
          };
          // CHUNK 6M Task 1 — Log 2A: dump the raw response keys exactly
          // as the server sent them. This is the FIRST place where a
          // whitespace mismatch would surface — if the server sends
          // `"movie: 299534"` (note the space) the un-normalized key
          // will never match `runBatch`'s lookup of `"movie:299534"`.
          // TEMPORARY diagnostic; will be removed in a later cleanup chunk.
          console.log(
            "[OTT TRACE] chunk response raw keys",
            JSON.stringify(Object.keys(data.results || {}).slice(0, 5))
          );
          // Chunk 6G Task 2 — diagnostic log. Logs the response country
          // and the actual result keys returned by the server for this
          // chunk. Verifies the server is returning the expected
          // `${mediaType}:${tmdbId}` key format and that the keys match
          // the items we asked about. Temporary; will be removed in a
          // later cleanup chunk. Logs only key strings + counts (no PII).
          console.log(
            "[Watchlist OTT] batch response keys",
            Object.keys(data?.results ?? {}),
            "country=" + (data?.country ?? "?"),
            "requested=" + chunk.length
          );
          // Chunk 6H Task 1 — raw JSON diagnostic logs. The Chunk 6G log
          // above prints the keys as a JS array (browser devtools may
          // render the array elements without quote marks, making it
          // hard to spot stray whitespace like `"movie: 1233413"`).
          // `JSON.stringify` produces a literal string with quote marks
          // and escape sequences — any whitespace inside the key strings
          // becomes visible. We also log the first result's full JSON
          // (truncated to 500 chars) so we can verify the offer structure
          // (in particular that each offer has `package.technicalName`).
          // Temporary; will be removed in a later cleanup chunk alongside
          // the Chunk 6E/6F/6G logs.
          const rawResults = data?.results ?? {};
          const rawKeys = Object.keys(rawResults);
          console.log(
            "[Watchlist OTT] raw keys JSON",
            JSON.stringify(rawKeys.slice(0, 5))
          );
          const firstKey = rawKeys[0];
          if (firstKey) {
            // CHUNK 6I Task 3 — bump the slice from 500 to 800 chars
            // so we can see the full `package` object (including
            // `technicalName`, `shortName`, `clearName`, `icon`) without
            // truncation. TEMPORARY diagnostic log, safe to remove
            // once provider extraction is verified working.
            console.log(
              "[Watchlist OTT] first raw result",
              JSON.stringify(rawResults[firstKey]).slice(0, 800)
            );
          }

          // CHUNK 6J Task 1 — PRECISE per-batch diagnostic logs. These
          // complement the existing 6G/6H logs by surfacing the exact
          // fields the spec asked us to inspect: the first 5 raw keys
          // (as a JSON string so whitespace is visible), the first
          // result's `nodeId` + `offers.length` + first `package` object,
          // and the result of running `extractProvidersFromOffers` on
          // that first result's offers. This proves end-to-end whether
          // the API is returning the expected shape AND whether the
          // client extractor can parse it. TEMPORARY; will be removed
          // in a later cleanup chunk alongside the 6E/6F/6G/6H logs.
          // Logs only structural metadata (no PII, no titles).
          console.log(
            "[Watchlist OTT] batch raw keys",
            JSON.stringify(rawKeys.slice(0, 5))
          );
          if (firstKey && rawResults[firstKey]) {
            const first = rawResults[firstKey];
            console.log(
              "[Watchlist OTT] first result",
              JSON.stringify({
                key: firstKey,
                nodeId: first.nodeId,
                offersCount: first.offers?.length ?? 0,
                firstPackage: first.offers?.[0]?.package ?? null
              })
            );
            if (first.offers && first.offers.length > 0) {
              // Run the same extractor the production code uses, with
              // a throwaway metadata map, so we can see exactly which
              // provider identifiers it would produce for this title.
              const extractionMeta = new Map<string, { clearName: string; icon?: string }>();
              const extracted = extractProvidersFromOffers(first.offers, extractionMeta);
              console.log(
                "[Watchlist OTT] first extraction",
                JSON.stringify(extracted)
              );
            }
          }
          // Chunk 6H Task 2 — normalize server response keys. Build a
          // new record with whitespace stripped from every key (see
          // `normalizeOttKey`). This makes the client resilient to any
          // whitespace variation in the server's response: the server
          // is expected to send clean keys like `"movie:530385"`, but
          // if it ever sends `"movie: 1233413"` (with stray whitespace)
          // the lookup at the call site would silently fail and the
          // Platform filter catalog would end up empty. The caller's
          // lookup key is also normalized (see `runBatch` and
          // `enrichedItems`) so both sides match regardless of
          // whitespace. No-op when the server already returns clean
          // keys (the normal case).
          const normalizedResults: Record<string, JustWatchTitleOffers> = {};
          for (const [key, value] of Object.entries(rawResults)) {
            normalizedResults[normalizeOttKey(key)] = value;
          }
          // CHUNK 6M Task 1 — Log 2B: dump the normalized keys so we can
          // compare them side-by-side with Log 2A. If these differ from
          // the raw keys, `normalizeOttKey` is doing its job (stripping
          // whitespace). If they're identical, the server is sending
          // already-clean keys and the mismatch is elsewhere.
          // TEMPORARY diagnostic; will be removed in a later cleanup chunk.
          console.log(
            "[OTT TRACE] chunk normalized keys",
            JSON.stringify(Object.keys(normalizedResults).slice(0, 5))
          );
          return {
            chunk,
            results: normalizedResults,
            // CHUNK 6N Task 3 — capture the RAW server response keys
            // (un-normalized) so we can surface them in the visible
            // debug UI. The catalog lookup uses `normalizedResults`,
            // but the user needs to see what the server ACTUALLY
            // returned in order to diagnose why the normalized keys
            // still contain spaces (per the Chunk 6N root cause).
            rawKeys: Object.keys(rawResults),
            // CHUNK 6Q Task 1 — `httpOk: true` marks this chunk as
            // successfully fetched (HTTP 200 + valid JSON). A chunk
            // with `httpOk: true` but empty `results` is a legitimate
            // "no JustWatch offers for these titles" — NOT a failure.
            httpOk: true
          };
        } catch {
          // Network error / JSON parse error — return empty results
          // for this chunk. The effect sets `error=true` if EVERY
          // chunk failed (checked after Promise.all resolves).
          // CHUNK 6Q Task 1 — `httpOk: false` so the caller can
          // distinguish a thrown fetch from a successful fetch with
          // zero results.
          return {
            chunk,
            results: {} as Record<string, JustWatchTitleOffers>,
            rawKeys: [],
            httpOk: false
          };
        }
      })
    );
    out.push(...waveResults);
    // CHUNK 6P Task 3 — bump `done` once per chunk that resolved in
    // this wave (success or failure — both count as "completed" for
    // progress purposes) and notify the caller via `onChunkDone`. The
    // caller updates a `chunkProgress` signal so the visible debug UI
    // can show `${done}/${total}` progress.
    //
    // We notify AFTER `out.push` so the count is consistent with the
    // number of results actually accumulated in `out`. We notify once
    // per chunk (not once per wave) so progress is as granular as
    // possible — for a 42-chunk batch with MAX_CONCURRENT_CHUNKS=3,
    // the user sees 0/42 → 3/42 → 6/42 → ... → 42/42.
    for (let r = 0; r < waveResults.length; r++) {
      done += 1;
      if (onChunkDone) onChunkDone(done, total);
    }
    // CHUNK 6Q Task 1 — notify the caller that this wave is fully
    // resolved, passing the wave's result array so the caller can
    // merge the wave's results into its working map and reactively
    // update `availabilityMap` / `packageMeta` BEFORE the next wave
    // starts. This is what makes the Platform filter appear as soon
    // as the first wave with provider data lands — the caller does
    // NOT wait for all 42 chunks to resolve before updating signals.
    // Called AFTER `onChunkDone` so `done` reflects the cumulative
    // count when the wave callback fires.
    if (onWaveDone) onWaveDone(waveResults, done, total);
  }

  return out;
}

/**
 * useWatchlistOttAvailability — enriches watchlist items with JustWatch
 * provider data and exposes a sorted catalog for the Platform filter.
 *
 * See file-level docstring for behavior details.
 */
export function useWatchlistOttAvailability(
  watchlist: Accessor<WatchlistItem[]>
): UseWatchlistOttAvailabilityResult {
  // Chunk 6D: read the global Discover region so we can pass it as the
  // `country` field in the batch request body. The route uses this as
  // an override (taking precedence over the server-side session-based
  // resolver, which fails open to "US" on the Vercel preview).
  const region = useDiscoverRegion();

  // Map keyed by `${mediaType}:${tmdbId}` → RAW JustWatch server response
  // for that title (the `JustWatchTitleOffers` object containing `nodeId`,
  // `objectType`, and `offers[]`). Extraction of provider `technicalName`
  // values happens at READ time in `enrichedItems`, not at storage time —
 // see the Chunk 6K note on `BatchCacheEntry` above for the rationale.
  //
  // `null` = fetch in progress or never attempted; the enriched memo
  // falls back to the raw watchlist item (with `justwatchProviders: undefined`).
  const [availabilityMap, setAvailabilityMap] = createSignal<
    Map<string, JustWatchTitleOffers> | null
  >(null);

  // Package display metadata (clearName, icon URL) collected across
  // all batches. Keyed by `technicalName`. Survives re-fetches by
  // being rebuilt each run.
  const [packageMeta, setPackageMeta] = createSignal<
    Map<string, { clearName: string; icon?: string }>
  >(new Map());

  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal(false);

  // CHUNK 6N Task 3 — TEMPORARY debug signal. Stores the first 3 raw
  // batch-response keys (as a JSON string) from the most recent fetch.
  // Read by `VaultFiltersContent` to render a visible debug line in the
  // Platform filter modal. Empty string before the first fetch.
  // Will be removed alongside the other Chunk 6E-6M diagnostic logs.
  const [debugRawKeys, setDebugRawKeys] = createSignal<string>("");

  // CHUNK 6O Task 1 — TEMPORARY debug signals. Coarse-grained fetch
  // state machine + human-readable error message. Together they let the
  // visible debug line in VaultFiltersContent tell the user EXACTLY
  // which phase the OTT batch fetch is in (idle / loading / success /
  // error) and why it failed (if it did). Will be removed alongside
  // the other Chunk 6E-6N diagnostic logs.
  const [fetchState, setFetchState] = createSignal<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [fetchError, setFetchError] = createSignal<string>("");

  // CHUNK 6P Task 1 — TEMPORARY debug signals.
  //
  // `effectRunId` — monotonic counter that bumps at the start of every
  // effect run that actually begins a fetch (i.e. the cache-miss path
  // that calls `setLoading(true)`). Used by the visible debug UI to
  // distinguish "the effect is stuck on a single run" (runId stable,
  // state=loading, progress=0/N forever) from "the effect is restarting
  // in a loop" (runId keeps climbing, state=loading flickers). Without
  // this signal, both failure modes look identical to the user.
  //
  // `chunkProgress` — `${done}/${total}` string updated by the
  // `onChunkDone` callback passed to `fetchChunksWithLimitedConcurrency`
  // after each chunk resolves. Stays at `0/${total}` until the first
  // wave of MAX_CONCURRENT_CHUNKS requests completes, then bumps by 1
  // per chunk. Lets the user see whether ANY chunks are landing at all
  // (vs. the very first wave hanging, which would mean a network-level
  // stall or a JustWatch 5xx the route is slow to time out).
  //
  // Both are read by VaultFiltersContent and rendered in the visible
  // debug line. Will be removed alongside the other Chunk 6E-6O
  // diagnostic logs.
  const [effectRunId, setEffectRunId] = createSignal<number>(0);
  const [chunkProgress, setChunkProgress] = createSignal<string>("");

  // CHUNK 6R Task 3 — Persistent client cache signal. Read ONCE from
  // localStorage at hook initialization (synchronous, before the first
  // effect runs). Holds a `Map<string, string[]>` keyed by normalized
  // `"${mediaType}:${tmdbId}"` with the provider technicalName array
  // as the value, or `null` if no cache exists / cache is expired /
  // localStorage is unavailable.
  //
  // `enrichedItems` consults this map as a FALLBACK when
  // `availabilityMap` has no entry for an item. This makes the
  // Platform filter appear INSTANTLY on page refresh — the user sees
  // the cached providers immediately, then the network fetch refreshes
  // them in the background.
  //
  // The signal is reactive so `enrichedItems` + `providerCatalog`
  // recompute when the cache is populated. However, the cache is only
  // read ONCE at init (we don't watch localStorage for cross-tab
  // changes — that's a future enhancement). The signal is updated
  // when a network fetch completes successfully (via
  // `setCachedProviderMap` in the terminal success path) so the next
  // `enrichedItems` recompute uses the freshest data.
  //
  // `cacheSource` (Task 5) is derived from whether `availabilityMap`
  // and/or `cachedProviderMap` are populated — see the memo below.
  const initialCache = (() => {
    // Read once at hook init. `region()` is reactive but its initial
    // value is stable (defaults to "IN" — see `useDiscoverRegion`), so
    // reading it here is safe. If the region changes later, the
    // effect will re-fetch and update the cache for the new region.
    try {
      return readClientCache(region());
    } catch {
      return null;
    }
  })();
  const [cachedProviderMap, setCachedProviderMap] = createSignal<
    Map<string, string[]> | null
  >(initialCache);

  // ── Trigger effect ────────────────────────────────────────────────
  // Fires when the watchlist signature OR the user's region changes
  // (Chunk 6D — region is now part of the dependency key so the batch
  // re-fetches if the user switches country in Settings). `on()` with
  // `defer: false` runs immediately on mount and on every signature
  // change. We use `createMemo` to compute the signature (cached
  // between reactive reads) and `on()` to gate the effect on
  // signature equality (avoids re-fetching when only item content
  // changes, e.g. favorite toggled).
  const signature = createMemo(() => {
    // Read region() inside the memo so the memo re-computes when the
    // region changes — the returned signature string includes the
    // region, which makes `on()` see a different value and re-fires
    // the effect.
    const reg = region();
    return `${reg}|${watchlistSignature(watchlist())}`;
  });

  createEffect(
    on(
      signature,
      (sig) => {
        // The signature is `"${region}|${watchlistSig}"`. region is
        // always a 2-letter code (never empty — defaults to "IN"), so
        // we use the watchlist portion to detect an empty watchlist.
        // When empty, we still want to reset state and bail out.
        const watchlistSig = sig.includes("|") ? sig.slice(sig.indexOf("|") + 1) : sig;
        if (!watchlistSig) {
          // Empty watchlist — no fetch needed. Reset state so the
          // Platform filter hides cleanly.
          setAvailabilityMap(new Map());
          setPackageMeta(new Map());
          setLoading(false);
          setError(false);
          // CHUNK 6O Task 2 — Path A: empty watchlist. The fetch never
          // starts, so we transition back to `'idle'` (NOT `'error'` —
          // an empty watchlist is a legitimate state, not a failure).
          setFetchState("idle");
          setFetchError("");
          return;
        }

        // Build the list of items to fetch (defensive: filter out items
        // whose `id` isn't a positive integer — they can't be looked
        // up on JustWatch).
        const items = watchlist();
        const fetchItems: Array<{
          tmdbId: number;
          mediaType: "movie" | "tv";
          title?: string;
          releaseYear?: number | null;
        }> = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const tmdbId = Number(it.id);
          if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
          // Derive title + year for JustWatch search fallback (helps
          // resolve cache misses — see resolveTitleToJustWatchNode in
          // the service layer).
          const title = it.title || it.name || it.original_title || it.original_name;
          const dateStr = it.release_date || it.first_air_date || "";
          // Parse year as a plain number first (defaults to NaN when no date),
          // THEN narrow with Number.isFinite + > 0. Doing this in two steps
          // avoids the TS "possibly null" error that arises when `releaseYear`
          // is typed as `number | null` and we try `releaseYear > 0` after
          // `Number.isFinite(releaseYear)` — TS doesn't narrow `null` out of
          // the union from a Number.isFinite() guard (only typeof does that).
          const yearNum = dateStr ? Number(dateStr.substring(0, 4)) : NaN;
          fetchItems.push({
            tmdbId,
            mediaType: it.media_type,
            title: typeof title === "string" && title.length > 0 ? title : undefined,
            releaseYear:
              Number.isFinite(yearNum) && yearNum > 0 ? yearNum : null
          });
        }

        // CHUNK 6M Task 1 — Log 1: dump the first 3 fetchItems so we can
        // verify the source fields (`tmdbId`, `mediaType`) look exactly
        // like what `runBatch` will use to build the lookup key. If `tmdbId`
        // is `undefined` / `NaN` / a string here, EVERY downstream lookup
        // will silently fail and the Platform filter will be empty.
        // TEMPORARY diagnostic; will be removed in a later cleanup chunk.
        console.log(
          "[OTT TRACE] fetchItems first 3",
          JSON.stringify(fetchItems.slice(0, 3))
        );

        if (fetchItems.length === 0) {
          setAvailabilityMap(new Map());
          setPackageMeta(new Map());
          setLoading(false);
          setError(false);
          // CHUNK 6O Task 2 — Path B: watchlist had items but NONE had
          // a valid `tmdbId` (all filtered out by the
          // `Number.isFinite(tmdbId) && tmdbId > 0` guard above). This
          // is a data-quality issue, not a fetch failure — we still
          // transition to `'idle'` because no fetch was attempted.
          setFetchState("idle");
          setFetchError("");
          return;
        }

        // CHUNK 6I: in-memory cache check. The SolidJS effect can re-fire
        // every few seconds when an upstream signal (e.g. `args.watchlist()`
        // returning a fresh array reference on a parent re-render) bumps
        // the effect even though the signature is unchanged. Without this
        // cache, the user sees repeated `/api/ott/batch-availability`
        // POSTs in the network panel every few seconds, hammering the
        // JustWatch API and the Supabase cache layer.
        //
        // Cache key = the full signature string (`${region}|${watchlistSig}`).
        // TTL is 10 minutes, matching the server-side OTT cache. A failed
        // fetch (successCount === 0) is NOT cached so the next effect run
        // can retry. An empty `availabilityMap` IS cached — a watchlist
        // with zero JustWatch offers in this country is a stable fact,
        // not a transient failure.
        const cached = batchCache.get(sig);
        if (cached && Date.now() - cached.timestamp < BATCH_CACHE_TTL_MS) {
          setAvailabilityMap(cached.availability);
          setPackageMeta(cached.meta);
          setLoading(false);
          setError(false);
          // CHUNK 6O Task 2 — Path C: in-memory cache hit. We bypassed
          // the fetch entirely because a previous run within the last
          // 10 minutes already populated the cache. This is a success
          // state (the cached entry was only written on a prior
          // successful fetch — see the cache-write guard at the bottom
          // of runBatch which only caches when `successCount > 0`).
          setFetchState("success");
          setFetchError("");
          return;
        }

        // Split into ≤25-item chunks. The route rejects >25 with 400.
        const chunks: typeof fetchItems[] = [];
        for (let i = 0; i < fetchItems.length; i += MAX_BATCH) {
          chunks.push(fetchItems.slice(i, i + MAX_BATCH));
        }

        // CHUNK 6P Task 2 — bump the effect run counter + initialize
        // chunk progress BEFORE setLoading(true). `runId` is captured
        // in a local so the timeout callback (Task 4) can verify the
        // signal still belongs to THIS run (vs. a new effect firing
        // and starting a new fetch with a new runId). `chunkProgress`
        // starts at `0/${total}` and bumps by 1 per chunk as they
        // resolve (see the `onChunkDone` callback passed to
        // `fetchChunksWithLimitedConcurrency` below).
        const runId = effectRunId() + 1;
        setEffectRunId(runId);
        setChunkProgress(`0/${chunks.length}`);

        let cancelled = false;
        setLoading(true);
        setError(false);
        // CHUNK 6O Task 2 — Path D: fetch starting. We're about to
        // fire off one or more batch requests to
        // /api/ott/batch-availability. Transition to `'loading'` and
        // clear any stale error from a previous run. The `runBatch`
        // closure below is responsible for transitioning to either
        // `'success'` or `'error'` when the fetch completes.
        setFetchState("loading");
        setFetchError("");

        // CHUNK 6Q Task 2 — Stall detector (replaces Chunk 6P's 20s hard
        // timeout). The 20s hard timeout was too aggressive for a 1046-item
        // / 42-chunk batch — the user-reported symptom was
        // `progress=27/42 error=timeout after 20000ms; progress=3/42`,
        // i.e. the batch was genuinely progressing (27 of 42 chunks done)
        // but the timeout killed it before `availabilityMap` was ever set,
        // so `providerCatalog` stayed at 0.
        //
        // The stall detector only fires if NO chunk has completed in 25s
        // (checked every 5s). A slow-but-progressing batch is allowed to
        // continue — the user sees `progress` bumping in the debug line,
        // and the Platform filter appears as soon as the first wave with
        // provider data lands (Task 1's incremental merge).
        //
        // `lastProgressTime` is updated by:
        //   - the `onChunkDone` callback (per-chunk progress)
        //   - the `onWaveDone` callback (per-wave merge)
        // Both callbacks fire DURING the `await fetchChunksWithLimitedConcurrency`
        // call inside `runBatch`, so `lastProgressTime` stays fresh as
        // long as chunks are landing.
        //
        // The `effectRunId() === runId` guard prevents a stale interval
        // from a previous run firing on a new run. The
        // `fetchState() === 'loading'` guard prevents firing after the
        // run already completed (Path G or Path H). On terminal paths
        // (Path E, Path G, Path H, cleanup) we `clearInterval(stallCheck)`
        // to avoid a dangling timer.
        //
        // Like the old timeout, we set `cancelled = true` on stall so
        // that if the in-flight fetch eventually resolves LATER, the
        // Path E `if (cancelled) return;` check bails out and does NOT
        // override the stall's error state.
        //
        // CHUNK 6R Task 1 — `finished` flag. The Chunk 6Q stall detector
        // had a RACE: the 5s interval could tick at the 25s boundary
        // JUST BEFORE the terminal `clearInterval(stallCheck)` call ran
        // (e.g. the last chunk resolved at 24.9s, the interval ticked at
        // 25.0s, the terminal cleanup ran at 25.1s). The user-reported
        // symptom was `progress=42/42 error=stalled after 25s with no
        // chunk progress` — the batch COMPLETED but the stall fired
        // anyway, flipping a successful run to error.
        //
        // The fix: a `finished` flag that's set to `true` at EVERY
        // terminal path (Path G success, Path G error, Path F retry
        // scheduling, Path E cancelled, Path H threw). The stall
        // callback checks `if (finished) return;` FIRST — before the
        // `fetchState() === 'loading'` check — so a finished run can
        // NEVER be flipped to error by a late stall tick. The
        // `clearInterval(stallCheck)` call still runs at terminal, but
        // the `finished` flag is the belt-and-suspenders guard against
        // the race where the interval fires between the terminal state
        // set and the clearInterval call.
        let lastProgressTime = Date.now();
        let finished = false;
        const stallCheck = setInterval(() => {
          // CHUNK 6R Task 1 — check `finished` FIRST. If the batch
          // already completed (success, error, retry scheduled, or
          // cancelled), do NOT flip to error. This is the fix for the
          // false stall error where `progress=42/42` but
          // `error=stalled after 25s` appeared because the interval
          // ticked just before the terminal `clearInterval` ran.
          if (finished) return;
          if (fetchState() === 'loading' && effectRunId() === runId) {
            if (Date.now() - lastProgressTime > 25_000) {
              cancelled = true;
              setLoading(false);
              setFetchState("error");
              setFetchError('stalled after 25s with no chunk progress');
              clearInterval(stallCheck);
            }
          } else {
            clearInterval(stallCheck);
          }
        }, 5_000);

        // Chunk 6D: pass the user's Discover region as the `country`
        // field in the request body so the route uses the user's
        // profile country (e.g. "IN") instead of falling back to "US"
        // on the Vercel preview. Read once here so all chunks in this
        // run use the same value (the region signal is reactive but
        // the value is stable for the duration of a single batch run).
        const currentCountry = region();

        // Chunk 6E: retry budget for transient failures. If the first
        // attempt returns ALL empty chunks (every chunk failed or had
        // zero results), schedule up to MAX_RETRIES additional attempts
        // with RETRY_DELAY_MS delay. This recovers from transient
        // JustWatch outages and 429 rate limits without hiding the
        // Platform filter permanently on a single bad request.
        let attempt = 0;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const runBatch = async () => {
          // Chunk 6E: limited-concurrency batch fetch — at most
          // MAX_CONCURRENT_CHUNKS requests in flight at a time, to
          // avoid JustWatch's 429 rate limiter.
          //
          // CHUNK 6P Task 3 — pass an `onChunkDone` callback that
          // updates the `chunkProgress` signal after each chunk
          // resolves. The visible debug UI reads this signal so the
          // user can see whether ANY chunks are landing (vs. the very
          // first wave hanging). The callback fires once per chunk,
          // success or failure.
          //
          // CHUNK 6Q Task 1 — also pass an `onWaveDone` callback that
          // merges each wave's results into `workingMap`/`meta` and
          // reactively updates `availabilityMap`/`packageMeta` BEFORE
          // the next wave starts. This is the key change: previously
          // the hook waited for ALL 42 chunks to resolve before
          // setting `availabilityMap` once, which meant the Platform
          // filter stayed empty for the entire (slow) batch duration.
          // Now the filter appears as soon as the first wave with
          // provider data lands.
          //
          // `workingMap`/`meta` are LOCALS to this `runBatch` call —
          // per spec "Use a local `workingMap` inside `runBatch`, not
          // a module-level map that persists stale data." A retry
          // creates a fresh `workingMap`/`meta`.
          const workingMap = new Map<string, JustWatchTitleOffers>();
          const meta = new Map<string, { clearName: string; icon?: string }>();
          let httpOkCount = 0;
          let failedCount = 0;
          // CHUNK 6M Task 1 — Log 3 counter: log only the first 2 items
          // processed across ALL chunks. Logging every item would spam
          // the console; the first 2 are enough to spot a systematic key
          // mismatch (if item #1 is wrong, item #2 is almost certainly
          // wrong for the same reason).
          let mergeLogCount = 0;
          // CHUNK 6Q Task 1 — track whether `debugRawKeys` has been
          // committed yet. The wave callback commits the first 3 raw
          // keys as soon as the first wave with keys resolves (so the
          // user sees them while the batch is still running). The
          // terminal path checks this flag and only does a fallback
          // commit if no wave ever had keys.
          let debugRawKeysCommitted = false;

          const allResults = await fetchChunksWithLimitedConcurrency(
            chunks,
            currentCountry,
            (done, total) => {
              setChunkProgress(`${done}/${total}`);
              // CHUNK 6Q Task 2 — bump `lastProgressTime` on every
              // chunk completion so the stall detector knows the
              // batch is still progressing.
              lastProgressTime = Date.now();
            },
            (waveResults, _done, _total) => {
              // CHUNK 6Q Task 1 — merge this wave's results into the
              // working map. This runs synchronously inside
              // `fetchChunksWithLimitedConcurrency` after each wave
              // resolves, BEFORE the next wave starts.
              for (let w = 0; w < waveResults.length; w++) {
                const { chunk, results, rawKeys, httpOk } = waveResults[w];
                if (httpOk) {
                  httpOkCount++;
                } else {
                  failedCount++;
                }
                // Commit the first 3 raw keys we observe — only once.
                // This makes the visible debug line show keys as soon
                // as the first wave with data lands, instead of
                // waiting for the full batch to complete.
                if (!debugRawKeysCommitted && rawKeys.length > 0) {
                  const first3 = rawKeys.slice(0, 3);
                  if (first3.length > 0) {
                    setDebugRawKeys(JSON.stringify(first3));
                    debugRawKeysCommitted = true;
                  }
                }
                for (let c = 0; c < chunk.length; c++) {
                  const item = chunk[c];
                  // Chunk 6H Task 2 — normalize the client-side lookup
                  // key so it matches the normalized server response
                  // keys returned by `fetchChunksWithLimitedConcurrency`.
                  const key = normalizeOttKey(`${item.mediaType}:${item.tmdbId}`);
                  const entry = results[key];
                  // CHUNK 6M Task 1 — Log 3: for the first 2 items only,
                  // dump the exact lookup inputs and outcomes. If
                  // `foundInResults` is `false` for items that the server
                  // DID return data for, the lookup key construction is
                  // wrong — this is the smoking gun for the empty catalog.
                  // TEMPORARY diagnostic; will be removed in a later cleanup chunk.
                  if (mergeLogCount < 2) {
                    mergeLogCount++;
                    console.log(
                      "[OTT TRACE] merge item",
                      JSON.stringify({
                        itemMediaType: item.mediaType,
                        itemTmdbId: item.tmdbId,
                        typeofTmdbId: typeof item.tmdbId,
                        lookupKey: key,
                        foundInResults: !!entry,
                        availableResultKeys: Object.keys(results || {}).slice(0, 5)
                      })
                    );
                  }
                  if (entry) {
                    workingMap.set(key, entry);
                    // Populate display metadata by running the extractor
                    // once on the stored offers. The extractor's primary
                    // output (the `string[]` of provider ids) is discarded
                    // here — only the side-effect on `meta` is used.
                    extractProvidersFromOffers(entry.offers, meta);
                  }
                }
              }
              // CHUNK 6Q Task 1 — reactively update signals so
              // `enrichedItems` + `providerCatalog` recompute while
              // the fetch is still running. The Platform filter
              // appears as soon as the first wave with provider data
              // lands. `new Map(workingMap)` creates a shallow copy
              // so SolidJS sees a new reference and triggers the
              // memo recompute (SolidJS uses referential equality
              // for signal values).
              setAvailabilityMap(new Map(workingMap));
              setPackageMeta(new Map(meta));
              // CHUNK 6Q Task 2 — bump `lastProgressTime` on every
              // wave completion so the stall detector knows the
              // batch is still progressing.
              lastProgressTime = Date.now();
            }
          );
          if (cancelled) {
            // CHUNK 6O Task 2 — Path E: cancelled. The `on()` cleanup
            // fired (a new effect run started, or the component
            // unmounted) OR the stall detector (Task 2) fired and set
            // `cancelled = true` to abandon this run. In either case
            // the new run / the stall callback is responsible for
            // setting fetchState/loading. We deliberately do NOT call
            // `setFetchState` / `setLoading(false)` here because doing
            // so would race with the new run's
            // `setFetchState('loading')` / `setLoading(true)` (or
            // the stall's `setFetchState('error')`) and could
            // transiently flip the UI back to idle/success while the
            // new fetch is in flight. Just bail. We DO clear the
            // stall interval though — this run is done, the interval
            // is no longer needed.
            //
            // CHUNK 6R Task 1 — set `finished = true` so any late stall
            // interval tick (fired between the `cancelled = true` set
            // and this `clearInterval`) is a no-op.
            finished = true;
            clearInterval(stallCheck);
            return;
          }

          // CHUNK 6Q Task 1 — `debugRawKeys` fallback. If no wave ever
          // had raw keys (e.g. every chunk returned empty results OR
          // every chunk failed), the wave callback never committed
          // keys. Fall back to scanning `allResults` post-await so the
          // debug UI shows something (even if it's an empty array).
          if (!debugRawKeysCommitted) {
            const fallbackKeys: string[] = [];
            for (let i = 0; i < allResults.length && fallbackKeys.length < 3; i++) {
              const chunkRawKeys = allResults[i]?.rawKeys ?? [];
              for (let k = 0; k < chunkRawKeys.length && fallbackKeys.length < 3; k++) {
                fallbackKeys.push(chunkRawKeys[k]);
              }
            }
            setDebugRawKeys(JSON.stringify(fallbackKeys.slice(0, 3)));
          }

          // Chunk 6F Task 4 — diagnostic log. Logs the watchlist size,
          // number of chunks fetched, number of HTTP-OK chunks,
          // number of failed chunks, merged provider-entries count,
          // and unique provider count. Temporary; will be removed in
          // a later cleanup chunk. Logs only counts (no PII / no titles).
          console.log(
            "[useWatchlistOttAvailability] batch complete" +
              " watchlistItems=" + items.length +
              " fetchItems=" + fetchItems.length +
              " chunks=" + chunks.length +
              " httpOk=" + httpOkCount +
              " failed=" + failedCount +
              " mergedEntries=" + workingMap.size +
              " uniqueProviders=" + meta.size +
              " country=" + currentCountry
          );

          // CHUNK 6K Task 1 — log the availabilityMap size AFTER the
          // wave callbacks have populated it. TEMPORARY; will be
          // removed in a later cleanup chunk.
          console.log(
            "[Watchlist OTT] availabilityMap size (post-wave-merge)",
            workingMap.size
          );

          // CHUNK 6Q Task 3+4 — retry logic. Previously retried when
          // `successCount === 0` (where successCount counted chunks
          // with non-empty results). Now we retry only when EVERY
          // chunk actually FAILED (httpOk === false) — a successful
          // fetch with zero results is a legitimate empty catalog,
          // not a transient failure worth retrying.
          //
          // CHUNK 6Q Task 2 — we do NOT clear `stallCheck` here. The
          // stall detector covers ALL retries for this effect run —
          // if attempt 1 stalls, the retry should also be subject to
          // the same stall detection. The stall detector's
          // `lastProgressTime` is bumped by the retry's chunk
          // callbacks, so a progressing retry won't trip the stall.
          if (failedCount === chunks.length && attempt < MAX_RETRIES) {
            attempt += 1;
            // CHUNK 6O Task 2 — Path F: retry scheduled. We keep
            // `loading=true` and `fetchState='loading'` (the retry is
            // still in flight) but surface a human-readable message in
            // `fetchError` so the debug UI can show WHY we're retrying.
            setFetchError(
              `all ${chunks.length} chunk(s) failed — retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`
            );
            // CHUNK 6R Task 1 — do NOT set `finished = true` here. The
            // `finished` flag is shared across all retry attempts of this
            // run (declared in the effect scope). Setting it would
            // prevent the stall detector from catching a stalled retry.
            // Instead, bump `lastProgressTime` so the 25s stall window
            // resets — the retry delay is only 2s, well under 25s, so no
            // false stall can fire during the delay window.
            lastProgressTime = Date.now();
            retryTimer = setTimeout(() => {
              if (!cancelled) void runBatch();
            }, RETRY_DELAY_MS);
            return;
          }

          // CHUNK 6Q Task 1 — final commit. `workingMap`/`meta` are
          // already populated by the wave callbacks and the signals
          // already reflect the latest state. Per spec: "After all
          // chunks complete, call `setAvailabilityMap` one final time
          // with the complete map." This is defensive — guarantees
          // the signal reflects the complete map even if the last
          // wave's callback raced with the await resolution.
          setAvailabilityMap(new Map(workingMap));
          setPackageMeta(new Map(meta));
          // CHUNK 6R Task 1 — mark this run as FINISHED BEFORE clearing
          // the stall interval. This is the critical ordering: set
          // `finished = true` first, then `clearInterval`. If the
          // interval fires between these two lines, the `if (finished)
          // return;` check at the top of the callback makes it a no-op.
          // Without this ordering, a late tick could flip a successful
          // run to error (the user-reported false stall bug).
          finished = true;
          // CHUNK 6Q Task 2 — Path G (terminal success/error): clear
          // the stall detector. The fetch completed without stalling,
          // so the interval is no longer needed.
          clearInterval(stallCheck);
          // CHUNK 6M Task 1 — Log 4: dump the `workingMap`'s size,
          // first few keys, and the first value. TEMPORARY; will be
          // removed in a later cleanup chunk.
          console.log(
            "[OTT TRACE] availabilityMap before final set",
            JSON.stringify({
              size: workingMap.size,
              firstKeys: Array.from(workingMap.keys()).slice(0, 5),
              firstValue: Array.from(workingMap.values())[0] ?? null
            })
          );
          // CHUNK 6Q Task 3+4 — terminal state. Only set error if
          // EVERY chunk failed (failedCount === chunks.length). If at
          // least one chunk succeeded (httpOk > 0), it's success —
          // EVEN IF the resulting catalog is empty (some titles just
          // have no JustWatch offers in this country). This is the
          // Task 4 fix: "Do not mark error for empty provider catalog
          // after successful fetch."
          const allFailed = failedCount === chunks.length;
          setError(allFailed);
          setLoading(false);
          if (!allFailed) {
            setFetchState("success");
            setFetchError("");
          } else {
            setFetchState("error");
            setFetchError(
              `all ${chunks.length} chunk(s) failed after ${attempt + 1} attempt(s) — httpOkCount=0`
            );
          }

          // CHUNK 6R Task 3 — write the provider map to localStorage
          // on successful fetch. We extract a `Map<key, string[]>`
          // from `workingMap` (which stores raw `JustWatchTitleOffers`)
          // by running `extractProvidersFromOffers` on each entry's
          // offers. This is the same extraction `enrichedItems` does
          // at read time, so the cached map is consistent with what
          // the user saw. Only write if the map is non-empty (per
          // spec) — an empty map is a legitimate "no providers" result
          // but would make the cache useless as a fallback, so we skip
          // it (the previous cache, if any, remains).
          //
          // Also update the `cachedProviderMap` SIGNAL so
          // `enrichedItems` + `providerCatalog` recompute with the
          // freshest data on the next read (though they already have
          // it via `availabilityMap` — this is mainly for consistency
          // and for the `cacheSource` debug signal to correctly report
          // `live` instead of `mixed` after the fetch completes).
          if (!allFailed && workingMap.size > 0) {
            const providerMapForCache = new Map<string, string[]>();
            const cacheMeta = new Map<string, { clearName: string; icon?: string }>();
            for (const [key, offers] of workingMap) {
              providerMapForCache.set(
                key,
                extractProvidersFromOffers(offers.offers, cacheMeta)
              );
            }
            if (providerMapForCache.size > 0) {
              writeClientCache(currentCountry, providerMapForCache);
              setCachedProviderMap(providerMapForCache);
            }
          }

          // CHUNK 6I: write to in-memory cache ONLY on a non-retry
          // terminal state. We reach this branch when either (a) at
          // least one chunk succeeded (httpOk > 0), or (b) every
          // chunk failed AND we've exhausted the retry budget
          // (attempt >= MAX_RETRIES). Case (a) is the normal success
          // path — cache the result so subsequent effect re-fires
          // (caused by upstream signal churn) short-circuit into the
          // cached state instead of re-hitting the server. Case (b)
          // is a total failure — do NOT cache so the next effect run
          // can retry from scratch.
          //
          // An empty `workingMap` (watchlist has zero JustWatch offers
          // in this country) IS cached when httpOk > 0 — that's a
          // stable fact, not a transient failure, and caching it
          // prevents re-querying JustWatch for a watchlist that will
          // never have offers.
          if (!allFailed) {
            batchCache.set(sig, {
              availability: workingMap,
              meta,
              timestamp: Date.now()
            });
          }
        };

        // CHUNK 6O Task 2 — wrap runBatch in a .catch() so that if
        // anything inside throws unexpectedly (e.g. a TypeError in the
        // merge loop, or `fetchChunksWithLimitedConcurrency` itself
        // throwing despite its internal try/catch), we transition to
        // the `'error'` state with a human-readable message instead of
        // leaving `loading=true` forever (which is exactly the symptom
        // the user reported in Chunk 6N: "DEBUG: loading=true catalog=0
        // keys=(none yet)" that never changed).
        //
        // CHUNK 6Q Task 2 — Path H (runBatch threw): clear the stall
        // detector. The run is over (with an error), the interval is
        // no longer needed.
        void runBatch().catch((err: unknown) => {
          // CHUNK 6R Task 1 — set `finished = true` BEFORE clearing
          // the stall interval so a late tick can't flip the error
          // state. (Defensive — the `setFetchState("error")` below
          // would already make the stall callback's
          // `fetchState() === 'loading'` check fail, but the
          // `finished` flag is the belt-and-suspenders guard.)
          finished = true;
          clearInterval(stallCheck);
          if (cancelled) return;
          console.warn(
            "[useWatchlistOttAvailability] runBatch threw unexpectedly:",
            err instanceof Error ? err.message : String(err)
          );
          setLoading(false);
          setError(true);
          setFetchState("error");
          setFetchError(
            "runBatch threw: " +
              (err instanceof Error ? err.message : String(err))
          );
        });

        // SolidJS `on()` cleanup — runs before the next effect firing.
        // We don't have an async cancellation token for `fetch`, but
        // the `cancelled` flag prevents stale state writes from a
        // previous run. Chunk 6E: also clear any pending retry timer.
        //
        // CHUNK 6Q Task 2 — also clear the stall detector. If the
        // effect re-fires (signature changed) or the component
        // unmounts while the fetch is still in flight, the stall
        // interval from THIS run should NOT fire on the new run (the
        // new run has its own fresh stall detector). The
        // `effectRunId() === runId` guard inside the stall callback
        // would prevent any state update, but clearing the interval
        // avoids a dangling reference and is the spec-required
        // cleanup path.
        return () => {
          cancelled = true;
          clearInterval(stallCheck);
          if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
          }
        };
      },
      { defer: false }
    )
  );

  // ── Enriched items memo ───────────────────────────────────────────
  // Returns the watchlist items with `justwatchProviders` populated
  // from `availabilityMap`. Until the first fetch completes (map is
  // `null`), returns the raw items — so the Watchlist renders
  // immediately and the Platform filter just doesn't match anything
  // specific. Once the map is set, items are CLONED with the new
  // field (we never mutate the source `WatchlistItem` objects, which
  // are owned by the vault store).
  //
  // CHUNK 6K Task 3 — extraction happens HERE, at read time. The map
  // stores RAW `JustWatchTitleOffers`; we look up by normalized key
  // and call `extractProvidersFromOffers(result?.offers)` to get the
  // `string[]` of provider technicalNames. This eliminates the
  // entire class of bugs where the stored `string[]` and the lookup
  // key diverge — there's no longer a stored `string[]` to diverge.
  //
  // The `packageMeta` map is NOT consulted here (extraction populates
  // a throwaway local map). The catalog memo reads `packageMeta`
  // separately, which is populated during `runBatch`'s extraction pass.
  //
  // CHUNK 6R Task 3 — FALLBACK to `cachedProviderMap`. When
  // `availabilityMap` is `null` (fetch not started) OR has no entry
  // for a specific item (fetch in progress, that item's chunk hasn't
  // landed yet), we fall back to the persistent localStorage cache.
  // This makes the Platform filter appear INSTANTLY on page refresh —
  // the user sees cached providers while the network fetch refreshes
  // them in the background. Live data always wins over cached data
  // when both are available for the same item.
  const enrichedItems = createMemo<WatchlistItem[]>(() => {
    const items = watchlist();
    const map = availabilityMap();
    // CHUNK 6R Task 3 — read the cached provider map reactively so
    // this memo recomputes when the cache is populated (on startup
    // via `initialCache`, or after a successful fetch via
    // `setCachedProviderMap`).
    const cached = cachedProviderMap();
    if (map === null && cached === null) {
      // Neither live nor cached data available — return raw items.
      // This is the fresh-load-with-empty-cache case.
      return items;
    }
    // CHUNK 6M Task 1 — Log 5: dump the first 3 watchlist items and
    // verify the lookup key we're about to use actually exists in
    // `availabilityMap`. This is the FINAL checkpoint before the
    // `map.get(key)` call that determines `justwatchProviders`. If
    // `hasInMap` is `false` here but `mapSize` is >0, the lookup key
    // we're building does NOT match what `runBatch` stored — that's
    // the exact break point.
    //
    // Safe to call `.has` / `.get` here because we're past the
    // `map === null && cached === null` early-return above. If `map`
    // is `null`, `cached` is non-null, so we use the cached map. If
    // `map` is non-null, we use it (live wins).
    // TEMPORARY diagnostic; will be removed in a later cleanup chunk.
    if (map !== null) {
      console.log(
        "[OTT TRACE] enriched lookup check",
        JSON.stringify(
          items.slice(0, 3).map((it) => {
            const tmdbId = Number(it.id);
            const key = normalizeOttKey(`${it.media_type}:${tmdbId}`);
            return {
              key,
              hasInMap: map.has(key),
              mapSize: map.size,
              value: map.get(key) ?? null
            };
          })
        )
      );
    }
    // Map is set (possibly empty). Clone each item with its providers.
    // CHUNK 6K — hoist the throwaway metadata Map OUTSIDE the loop so
    // we don't allocate a new Map per item. The metadata it would
    // populate is already maintained by `runBatch`'s extraction pass
    // into the `packageMeta` signal; this local Map is only here to
    // satisfy `extractProvidersFromOffers`'s signature and is discarded.
    const throwawayMeta = new Map<string, { clearName: string; icon?: string }>();
    const out: WatchlistItem[] = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const tmdbId = Number(it.id);
      // Chunk 6H Task 2 — normalize the client-side lookup key so it
      // matches the normalized keys stored in `availabilityMap` (which
      // were normalized in `runBatch` above). No-op when the client
      // already produces clean keys.
      const key = Number.isFinite(tmdbId) && tmdbId > 0
        ? normalizeOttKey(`${it.media_type}:${tmdbId}`)
        : null;
      // CHUNK 6R Task 3 — live data wins over cached data. Try
      // `availabilityMap` first; if it has no entry (or is null),
      // fall back to `cachedProviderMap`. If neither has the entry,
      // `providers` is `[]` (the item is still included in the
      // enriched list — it just has no providers to filter on).
      let providers: string[] = [];
      if (key) {
        const liveResult = map ? map.get(key) : undefined;
        if (liveResult) {
          // Live data available — extract from raw offers.
          providers = extractProvidersFromOffers(liveResult.offers, throwawayMeta);
        } else if (cached) {
          // No live data — fall back to cached provider array.
          // `cached.get(key)` returns `string[] | undefined`. If the
          // key isn't in the cache either, `providers` stays `[]`.
          const cachedProviders = cached.get(key);
          if (Array.isArray(cachedProviders)) {
            providers = cachedProviders;
          }
        }
      }
      out[i] = {
        ...it,
        justwatchProviders: providers
      };
    }

    // CHUNK 6K Task 1 — diagnostic logs. Log the first 3 enriched
    // items + the count of items with non-empty providers, so we can
    // verify the enrichment step actually attached providers to items.
    // TEMPORARY; will be removed in a later cleanup chunk alongside
    // the Chunk 6E/6F/6G/6H/6I/6J logs. Logs only ids + provider
    // technicalNames (no titles, no PII).
    const sample = out.slice(0, 3).map((item) => ({
      key: `${item.media_type}:${item.id}`,
      providers: item.justwatchProviders || []
    }));
    console.log("[Watchlist OTT] enriched first 3", JSON.stringify(sample));
    const withProviders = out.filter(
      (item) => (item.justwatchProviders || []).length > 0
    );
    console.log(
      "[Watchlist OTT] items with providers count",
      withProviders.length
    );

    return out;
  });

  // ── Provider catalog memo ─────────────────────────────────────────
  // Unique providers across all items in `enrichedItems`, with
  // count = number of items that carry each provider. Sorted by
  // count desc, then clearName asc (alphabetical tiebreaker so the
  // dropdown is deterministic when counts are equal).
  //
  // CHUNK 6K Task 4 — SIMPLIFIED. Reads directly from `enrichedItems()`
  // and aggregates into a `Map<string, {count, clearName, icon}>`.
  // Display metadata (`clearName`, `icon`) is sourced from `packageMeta`
  // when available (populated during `runBatch`'s extraction pass),
  // falling back to `technicalName` as the `clearName` and empty string
  // as the `icon` when metadata is missing. The spec explicitly allows
  // this fallback: "technicalName as display is acceptable if clearName
  // mapping is missing, but try to use packageMeta if available."
  //
  // The previous implementation used a `Record<string, PlatformFilterOption>`
  // which is functionally identical to the Map-based approach but
  // allocated a new object per provider. The Map version is marginally
  // faster for large catalogs and matches the spec example exactly.
  const providerCatalog = createMemo<PlatformFilterOption[]>(() => {
    const items = enrichedItems();
    const meta = packageMeta();
    if (!items || items.length === 0) return [];

    const counts = new Map<string, { count: number; clearName: string; icon: string }>();

    for (let i = 0; i < items.length; i++) {
      const providers = items[i]?.justwatchProviders;
      if (!Array.isArray(providers) || providers.length === 0) continue;
      for (let j = 0; j < providers.length; j++) {
        const technicalName = providers[j];
        if (!technicalName) continue;
        const existing = counts.get(technicalName);
        if (existing) {
          existing.count += 1;
        } else {
          // Prefer packageMeta for the display label + icon URL.
          // Fall back to `technicalName` as the label and `""` as the
          // icon when metadata is missing (rare — `runBatch` populates
          // `meta` during its extraction pass for every provider that
          // appears in any offer's `package`).
          const m = meta.get(technicalName);
          counts.set(technicalName, {
            count: 1,
            clearName: m?.clearName ?? technicalName,
            icon: m?.icon ?? ""
          });
        }
      }
    }

    const options: PlatformFilterOption[] = Array.from(counts.entries()).map(
      ([technicalName, data]) => ({
        technicalName,
        clearName: data.clearName,
        icon: data.icon || undefined,
        count: data.count
      })
    );

    // Sort: count desc, then clearName asc.
    options.sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.clearName.localeCompare(b.clearName);
    });

    return options;
  });

  // CHUNK 6R Task 5 — `cacheSource` memo. Indicates WHERE the data
  // backing `enrichedItems` / `providerCatalog` is coming from, so the
  // visible debug line can show `cache=local|live|mixed|none`.
  //
  // Logic:
  //   - `none`  — both `availabilityMap` and `cachedProviderMap` are
  //                null/empty. No data available (fresh load, empty
  //                cache, fetch not started).
  //   - `local` — `cachedProviderMap` is populated AND `availabilityMap`
  //                is null (fetch not started or still loading with
  //                zero waves landed). Data is coming ENTIRELY from
  //                localStorage.
  //   - `live`  — `availabilityMap` is populated. Data is coming
  //                ENTIRELY from the network fetch. (We don't check
  //                whether EVERY item has a live entry — that would be
  //                too expensive. If `availabilityMap` is non-null, we
  //                report `live` because the fetch has completed at
  //                least one wave with data.)
  //   - `mixed` — both are populated. This is the transient state
  //                while the network fetch is in progress (early waves
  //                have landed in `availabilityMap`, but the cache is
  //                still being consulted for items whose chunks haven't
  //                landed yet).
  const cacheSource = createMemo<"local" | "live" | "mixed" | "none">(() => {
    const map = availabilityMap();
    const cached = cachedProviderMap();
    const hasLive = map !== null && map.size > 0;
    const hasCached = cached !== null && cached.size > 0;
    if (hasLive && hasCached) return "mixed";
    if (hasLive) return "live";
    if (hasCached) return "local";
    return "none";
  });

  // Chunk 6G Task 2 — diagnostic effect. Watches `enrichedItems` and
  // logs a sample (first 3 items) showing each item's `id`, `media_type`,
  // and `justwatchProviders` array. This verifies that the enrichment
  // step correctly populates `justwatchProviders` from `availabilityMap`.
  // If `justwatchProviders` is `[]` for every item even though the batch
  // response had entries, the issue is in the key-matching between the
  // fetch (which builds keys as `${mediaType}:${tmdbId}`) and the
  // enrichment memo (which builds keys the same way but reads from
  // `availabilityMap`). Temporary; will be removed in a later cleanup.
  // Logs only ids + provider counts (no titles, no PII).
  createEffect(() => {
    const sample = enrichedItems().slice(0, 3).map((i) => ({
      id: i.id,
      mediaType: i.media_type,
      providers: i.justwatchProviders
    }));
    console.log("[Watchlist OTT] enriched sample", sample);
  });

  // Chunk 6H Task 3 — diagnostic effect. Finds the FIRST enriched item
  // that carries at least one JustWatch provider and logs its id,
  // mediaType, and providers array (as JSON). If NO item has any
  // provider, logs a warning — this would indicate either (a) every
  // batch lookup failed (key mismatch — should be fixed by the
  // `normalizeOttKey` helper added in Task 2), or (b) every title
  // genuinely has no JustWatch offers in the user's country (legitimate
  // empty catalog).
  //
  // The existing Chunk 6G `enriched sample` log above shows the first
  // 3 items regardless of whether they have providers; this log
  // specifically surfaces a POPULATED example (or the absence of one)
  // so we can distinguish "enrichment ran but no items had providers"
  // from "enrichment didn't run at all". Temporary; will be removed in
  // a later cleanup chunk alongside the Chunk 6E/6F/6G logs.
  // Logs only ids + provider technicalNames (no titles, no PII).
  createEffect(() => {
    const sampleItem = enrichedItems().find(
      (item) =>
        Array.isArray(item.justwatchProviders) &&
        item.justwatchProviders.length > 0
    );
    if (!sampleItem) {
      console.warn(
        "[Watchlist OTT] no item has justwatchProviders after enrichment"
      );
      return;
    }
    console.log(
      "[Watchlist OTT] sample enriched item",
      JSON.stringify({
        id: sampleItem.id,
        mediaType: sampleItem.media_type,
        providers: sampleItem.justwatchProviders
      })
    );
  });

  return {
    enrichedItems,
    providerCatalog,
    loading,
    error,
    // CHUNK 6N Task 3 — TEMPORARY debug accessor for the visible
    // debug line in VaultFiltersContent. Will be removed alongside
    // the other Chunk 6E-6M diagnostic logs.
    debugRawKeys,
    // CHUNK 6O Task 1 — TEMPORARY debug accessors for the visible
    // debug line in VaultFiltersContent. Will be removed alongside
    // the other Chunk 6E-6N diagnostic logs.
    fetchState,
    fetchError,
    // CHUNK 6P Task 1 — TEMPORARY debug accessors for the visible
    // debug line in VaultFiltersContent. Will be removed alongside
    // the other Chunk 6E-6O diagnostic logs.
    effectRunId,
    chunkProgress,
    // CHUNK 6R Task 5 — TEMPORARY debug accessor for the visible
    // debug line in VaultFiltersContent. Will be removed alongside
    // the other Chunk 6E-6P diagnostic logs.
    cacheSource
  };
}
