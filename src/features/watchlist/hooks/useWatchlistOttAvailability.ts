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
 * Chunk 6E: maximum number of chunk requests to fire in parallel. Each
 * chunk hits JustWatch's GraphQL endpoint with a batched `node()` query
 * — too many parallel requests trigger JustWatch's 429 rate limiter,
 * which causes partial batch failures and intermittent "missing
 * provider" symptoms in the Platform filter. 3 is a safe default that
 * stays well under JustWatch's per-IP limit while still parallelizing
 * large watchlists. The spec recommends ≤4; we use 3 for headroom.
 */
const MAX_CONCURRENT_CHUNKS = 3;
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
 * Stable signature for the watchlist — used as the dependency key for
 * the fetch effect. Only changes when items are added/removed; stable
 * across filter/sort/edition changes.
 *
 * Returns a string of `mediaType:tmdbId` pairs joined by `|`, e.g.
 *   `"movie:530385|tv:85937|movie:550"`.
 *
 * If two watchlist loads produce the same signature, the effect will
 * not re-fire (SolidJS `on()` dedupe).
 */
function watchlistSignature(items: WatchlistItem[]): string {
  // Defensive: skip items with non-numeric `id` (shouldn't happen for
  // vault items — `id` is always `String(tmdb_id)` per vaultReadAdapter —
  // but guards against test fixtures or future item sources).
  let sig = "";
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const tmdbId = Number(it.id);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
    if (sig) sig += "|";
    sig += `${it.media_type}:${tmdbId}`;
  }
  return sig;
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
 */
async function fetchChunksWithLimitedConcurrency(
  chunks: Array<Array<{
    tmdbId: number;
    mediaType: "movie" | "tv";
    title?: string;
    releaseYear?: number | null;
  }>>,
  country: string
): Promise<Array<{ chunk: typeof chunks[number]; results: Record<string, JustWatchTitleOffers>; rawKeys: string[] }>> {
  const out: Array<{ chunk: typeof chunks[number]; results: Record<string, JustWatchTitleOffers>; rawKeys: string[] }> = [];

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
            return {
              chunk,
              results: {} as Record<string, JustWatchTitleOffers>,
              rawKeys: []
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
            rawKeys: Object.keys(rawResults)
          };
        } catch {
          // Network error / JSON parse error — return empty results
          // for this chunk. The effect sets `error=true` if EVERY
          // chunk failed (checked after Promise.all resolves).
          return {
            chunk,
            results: {} as Record<string, JustWatchTitleOffers>,
            rawKeys: []
          };
        }
      })
    );
    out.push(...waveResults);
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
          const allResults = await fetchChunksWithLimitedConcurrency(
            chunks,
            currentCountry
          );
          if (cancelled) {
            // CHUNK 6O Task 2 — Path E: cancelled. The `on()` cleanup
            // fired (a new effect run started, or the component
            // unmounted). The new run — if any — is responsible for
            // setting its own fetchState/loading. We deliberately do
            // NOT call `setFetchState` / `setLoading(false)` here
            // because doing so would race with the new run's
            // `setFetchState('loading')` / `setLoading(true)` and
            // could transiently flip the UI back to idle/success while
            // the new fetch is in flight. Just bail.
            return;
          }

          // CHUNK 6O Task 3 — populate `debugRawKeys` IMMEDIATELY after
          // the fetch resolves, BEFORE the merge loop. The previous
          // implementation only set this at the terminal success/error
          // path, which meant that if the merge loop threw or the retry
          // path bailed, the debug UI would never see the raw keys.
          // Setting it here guarantees the user sees the server's actual
          // response keys as soon as the network round-trip completes —
          // even if everything downstream fails. We collect the first 3
          // raw keys across all chunks (same logic as the old
          // `collectedRawKeys` loop below, but hoisted up).
          {
            const earlyKeys: string[] = [];
            for (let i = 0; i < allResults.length && earlyKeys.length < 3; i++) {
              const chunkRawKeys = allResults[i]?.rawKeys ?? [];
              for (let k = 0; k < chunkRawKeys.length && earlyKeys.length < 3; k++) {
                earlyKeys.push(chunkRawKeys[k]);
              }
            }
            setDebugRawKeys(JSON.stringify(earlyKeys));
          }

          // CHUNK 6K: store the RAW `JustWatchTitleOffers` in `merged`,
          // NOT pre-extracted `string[]`. Extraction moves to
          // `enrichedItems` (read time) so there's no possibility of a
          // storage/retrieval key mismatch. The `meta` map is still
          // populated here (during extraction for the diagnostic log
          // below) so the catalog memo can resolve `clearName`/`icon`
          // without re-iterating offers.
          const merged = new Map<string, JustWatchTitleOffers>();
          const meta = new Map<string, { clearName: string; icon?: string }>();
          let successCount = 0;
          // CHUNK 6M Task 1 — Log 3 counter: log only the first 2 items
          // processed across ALL chunks. Logging every item would spam
          // the console; the first 2 are enough to spot a systematic key
          // mismatch (if item #1 is wrong, item #2 is almost certainly
          // wrong for the same reason).
          let mergeLogCount = 0;
          // CHUNK 6N Task 3 — collect the FIRST 3 raw keys observed
          // across ALL chunks for the visible debug UI. We don't need
          // all keys — just enough to show the user what shape the
          // server's response keys have (e.g. "movie: 1443961" with a
          // space, or "t v:105248" with a space inside the mediaType).
          const collectedRawKeys: string[] = [];
          for (const { chunk, results, rawKeys } of allResults) {
            if (Object.keys(results).length > 0) successCount++;
            // Collect raw keys for the debug UI (only the first 3 we see).
            for (let k = 0; k < rawKeys.length && collectedRawKeys.length < 3; k++) {
              collectedRawKeys.push(rawKeys[k]);
            }
            for (const item of chunk) {
              // Chunk 6H Task 2 — normalize the client-side lookup key
              // so it matches the normalized server response keys
              // returned by `fetchChunksWithLimitedConcurrency`. No-op
              // when the client already produces clean keys (the normal
              // case — `${item.mediaType}:${item.tmdbId}` has no
              // internal whitespace).
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
                merged.set(key, entry);
                // Populate display metadata by running the extractor
                // once on the stored offers. The extractor's primary
                // output (the `string[]` of provider ids) is discarded
                // here — only the side-effect on `meta` is used. This
                // is cheap (one pass over offers per title) and keeps
                // `meta` in sync with what `enrichedItems` will
                // eventually produce.
                extractProvidersFromOffers(entry.offers, meta);
              }
            }
          }

          // Chunk 6F Task 4 — diagnostic log. Logs the watchlist size,
          // number of chunks fetched, number of successful chunks,
          // merged provider-entries count, and unique provider count.
          // Temporary; will be removed in a later cleanup chunk.
          // Logs only counts (no PII / no titles).
          console.log(
            "[useWatchlistOttAvailability] batch complete" +
              " watchlistItems=" + items.length +
              " fetchItems=" + fetchItems.length +
              " chunks=" + chunks.length +
              " successCount=" + successCount +
              " mergedEntries=" + merged.size +
              " uniqueProviders=" + meta.size +
              " country=" + currentCountry
          );

          // CHUNK 6K Task 1 — log the availabilityMap size AFTER it's
          // set, so we can verify the signal actually received the
          // data. This runs inside `runBatch` right before
          // `setAvailabilityMap(merged)`, using `merged.size` (the
          // local we're about to commit). TEMPORARY; will be removed
          // in a later cleanup chunk.
          console.log(
            "[Watchlist OTT] availabilityMap size (pre-set)",
            merged.size
          );

          // Chunk 6E: if every chunk came back empty AND we still have
          // retry budget, schedule a retry. This is the difference
          // between "JustWatch is down/429 — hide Platform filter
          // forever" and "JustWatch is down — try once more in 2s".
          if (successCount === 0 && attempt < MAX_RETRIES) {
            attempt += 1;
            // CHUNK 6O Task 2 — Path F: retry scheduled. We keep
            // `loading=true` and `fetchState='loading'` (the retry is
            // still in flight) but surface a human-readable message in
            // `fetchError` so the debug UI can show WHY we're retrying.
            // Without this, the user would see `state=loading` with no
            // indication that the previous attempt failed.
            setFetchError(
              `all ${chunks.length} chunk(s) returned empty — retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`
            );
            retryTimer = setTimeout(() => {
              if (!cancelled) void runBatch();
            }, RETRY_DELAY_MS);
            return;
          }

          setAvailabilityMap(merged);
          // CHUNK 6N Task 3 — commit the collected raw keys to the
          // debug signal so the visible debug line in VaultFiltersContent
          // can render them. JSON.stringify so the consumer doesn't have
          // to worry about array → string coercion. We slice to 3 in
          // case more were collected (defensive — the collection loop
          // above already caps at 3, but a future code change might not).
          setDebugRawKeys(JSON.stringify(collectedRawKeys.slice(0, 3)));
          // CHUNK 6M Task 1 — Log 4: dump the `merged` map's size, first
          // few keys, and the first value, IMMEDIATELY before committing
          // it to the `availabilityMap` signal. This is the LAST chance
          // to verify the map's contents before SolidJS's reactivity
          // takes over. If `merged.size` is 0 here, the merge loop above
          // never found a match — Log 3 will show why. If `merged.size`
          // is >0 but the keys don't match what `enrichedItems` builds,
          // Log 5 will show the mismatch.
          // TEMPORARY diagnostic; will be removed in a later cleanup chunk.
          console.log(
            "[OTT TRACE] availabilityMap before set",
            JSON.stringify({
              size: merged.size,
              firstKeys: Array.from(merged.keys()).slice(0, 5),
              firstValue: Array.from(merged.values())[0] ?? null
            })
          );
          setPackageMeta(meta);
          // If every chunk came back empty (network errors across
          // the board), flag as error so the UI can show "All
          // Platforms only" instead of "no providers" (which would
          // hide the dropdown entirely — too aggressive when the
          // cause is transient).
          setError(successCount === 0);
          setLoading(false);
          // CHUNK 6O Task 2 — Path G: terminal state (success OR error,
          // no more retries). This is the ONLY path that reaches
          // `setLoading(false)` after a fetch, so it MUST set
          // `fetchState` to either `'success'` or `'error'` here. The
          // branch is `successCount > 0` → success, else error. We
          // also populate `fetchError` with a human-readable message
          // in the error branch so the debug UI can show WHY the fetch
          // failed (the most common cause is "all chunks returned
          // empty" which usually means JustWatch is rate-limiting or
          // the country has no offers for any watchlist title).
          if (successCount > 0) {
            setFetchState("success");
            setFetchError("");
          } else {
            setFetchState("error");
            setFetchError(
              `all ${chunks.length} chunk(s) returned empty after ${attempt + 1} attempt(s) — successCount=0`
            );
          }

          // CHUNK 6I: write to in-memory cache ONLY on a non-retry
          // terminal state. We reach this branch when either (a) the
          // fetch had at least one successful chunk (successCount > 0),
          // or (b) every chunk failed AND we've exhausted the retry
          // budget (attempt >= MAX_RETRIES). Case (a) is the normal
          // success path — cache the result so subsequent effect
          // re-fires (caused by upstream signal churn) short-circuit
          // into the cached state instead of re-hitting the server.
          // Case (b) is a total failure — do NOT cache so the next
          // effect run can retry from scratch.
          //
          // An empty `merged` map (watchlist has zero JustWatch offers
          // in this country) IS cached when successCount > 0 — that's
          // a stable fact, not a transient failure, and caching it
          // prevents re-querying JustWatch for a watchlist that will
          // never have offers.
          if (successCount > 0) {
            batchCache.set(sig, {
              availability: merged,
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
        void runBatch().catch((err: unknown) => {
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
        return () => {
          cancelled = true;
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
  const enrichedItems = createMemo<WatchlistItem[]>(() => {
    const items = watchlist();
    const map = availabilityMap();
    if (map === null) {
      // Fetch not yet started or in flight — return raw items.
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
    // `map === null` early-return above.
    // TEMPORARY diagnostic; will be removed in a later cleanup chunk.
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
      const result = key ? map.get(key) : undefined;
      // CHUNK 6K Task 3 — ALWAYS assign a `string[]`. Never `undefined`.
      // If `result` is missing (key mismatch — should not happen after
      // the Chunk 6K refactor, but defensive), `extractProvidersFromOffers`
      // returns `[]` for `undefined` input. If `result.offers` is empty,
      // extraction also returns `[]`. The item is still included in the
      // enriched list — it just has no providers to filter on.
      const providers = result
        ? extractProvidersFromOffers(result.offers, throwawayMeta)
        : [];
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
    fetchError
  };
}
