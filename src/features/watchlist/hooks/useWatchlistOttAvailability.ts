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
function normalizeOttKey(value: string): string {
  return value.replace(/\s+/g, "");
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
interface BatchCacheEntry {
  /** Pre-built availabilityMap (mediaType:tmdbId → technicalName[]). */
  availability: Map<string, string[]>;
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
): Promise<Array<{ chunk: typeof chunks[number]; results: Record<string, JustWatchTitleOffers> }>> {
  const out: Array<{ chunk: typeof chunks[number]; results: Record<string, JustWatchTitleOffers> }> = [];

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
            return { chunk, results: {} as Record<string, JustWatchTitleOffers> };
          }
          const data = (await response.json()) as {
            country?: string;
            results?: Record<string, JustWatchTitleOffers>;
          };
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
          return {
            chunk,
            results: normalizedResults
          };
        } catch {
          // Network error / JSON parse error — return empty results
          // for this chunk. The effect sets `error=true` if EVERY
          // chunk failed (checked after Promise.all resolves).
          return {
            chunk,
            results: {} as Record<string, JustWatchTitleOffers>
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

  // Map keyed by `${mediaType}:${tmdbId}` → list of JustWatch
  // `technicalName` values for that title. `null` = fetch in progress
  // or never attempted; the enriched memo falls back to the raw item.
  const [availabilityMap, setAvailabilityMap] = createSignal<
    Map<string, string[]> | null
  >(null);

  // Package display metadata (clearName, icon URL) collected across
  // all batches. Keyed by `technicalName`. Survives re-fetches by
  // being rebuilt each run.
  const [packageMeta, setPackageMeta] = createSignal<
    Map<string, { clearName: string; icon?: string }>
  >(new Map());

  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal(false);

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

        if (fetchItems.length === 0) {
          setAvailabilityMap(new Map());
          setPackageMeta(new Map());
          setLoading(false);
          setError(false);
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
          if (cancelled) return;

          const merged = new Map<string, string[]>();
          const meta = new Map<string, { clearName: string; icon?: string }>();
          let successCount = 0;
          for (const { chunk, results } of allResults) {
            if (Object.keys(results).length > 0) successCount++;
            for (const item of chunk) {
              // Chunk 6H Task 2 — normalize the client-side lookup key
              // so it matches the normalized server response keys
              // returned by `fetchChunksWithLimitedConcurrency`. No-op
              // when the client already produces clean keys (the normal
              // case — `${item.mediaType}:${item.tmdbId}` has no
              // internal whitespace).
              const key = normalizeOttKey(`${item.mediaType}:${item.tmdbId}`);
              const entry = results[key];
              const providers = extractProvidersFromOffers(
                entry?.offers,
                meta
              );
              merged.set(key, providers);
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

          // Chunk 6E: if every chunk came back empty AND we still have
          // retry budget, schedule a retry. This is the difference
          // between "JustWatch is down/429 — hide Platform filter
          // forever" and "JustWatch is down — try once more in 2s".
          if (successCount === 0 && attempt < MAX_RETRIES) {
            attempt += 1;
            retryTimer = setTimeout(() => {
              if (!cancelled) void runBatch();
            }, RETRY_DELAY_MS);
            return;
          }

          setAvailabilityMap(merged);
          setPackageMeta(meta);
          // If every chunk came back empty (network errors across
          // the board), flag as error so the UI can show "All
          // Platforms only" instead of "no providers" (which would
          // hide the dropdown entirely — too aggressive when the
          // cause is transient).
          setError(successCount === 0);
          setLoading(false);

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

        void runBatch();

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
  const enrichedItems = createMemo<WatchlistItem[]>(() => {
    const items = watchlist();
    const map = availabilityMap();
    if (map === null) {
      // Fetch not yet started or in flight — return raw items.
      return items;
    }
    // Map is set (possibly empty). Clone each item with its providers.
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
      const providers = key ? map.get(key) : undefined;
      // Always set the field (even to `[]`) once the fetch has run —
      // the filter distinguishes `undefined` (not fetched) from `[]`
      // (fetched, no offers).
      out[i] = {
        ...it,
        justwatchProviders: providers ?? []
      };
    }
    return out;
  });

  // ── Provider catalog memo ─────────────────────────────────────────
  // Unique providers across all items in `availabilityMap`, with
  // count = number of items that carry each provider. Sorted by
  // count desc, then clearName asc (alphabetical tiebreaker so the
  // dropdown is deterministic when counts are equal).
  const providerCatalog = createMemo<PlatformFilterOption[]>(() => {
    const map = availabilityMap();
    const meta = packageMeta();
    if (!map || map.size === 0) return [];

    // Aggregate counts across all items.
    const counts = new Map<string, number>();
    map.forEach((providers) => {
      for (let i = 0; i < providers.length; i++) {
        const tn = providers[i];
        counts.set(tn, (counts.get(tn) ?? 0) + 1);
      }
    });

    // Build the catalog array.
    const out: PlatformFilterOption[] = [];
    counts.forEach((count, technicalName) => {
      const m = meta.get(technicalName);
      out.push({
        technicalName,
        clearName: m?.clearName ?? technicalName,
        icon: m?.icon,
        count
      });
    });

    // Sort: count desc, then clearName asc.
    out.sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.clearName.localeCompare(b.clearName);
    });

    return out;
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
    error
  };
}
