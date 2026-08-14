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

/** Max items per `/api/ott/batch-availability` request (enforced by the route). */
const MAX_BATCH = 25;

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
 * Returns the unique `package.technicalName` values across all offers
 * for the title. Returns `[]` if the title has no offers or no packages
 * with a technicalName.
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
    if (!pkg || !pkg.technicalName) continue;
    const tn = pkg.technicalName;
    if (!seen.has(tn)) {
      seen.add(tn);
      out.push(tn);
      // Stash the display metadata so we can build the catalog later
      // without re-iterating the (potentially large) offers array.
      if (!packageMetaOut.has(tn)) {
        packageMetaOut.set(tn, {
          clearName: pkg.clearName || tn,
          icon: buildJustWatchIconUrl(pkg.icon)
        });
      }
    }
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

        // Fire all chunks in parallel. Each chunk is independent —
        // failures in one chunk don't poison the others. We collect
        // results into a fresh Map so a re-run doesn't bleed stale
        // data from a previous run.
        Promise.all(
          chunks.map(async (chunk) => {
            try {
              const response = await fetch("/api/ott/batch-availability", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  // Include the country override so the server doesn't
                  // have to re-resolve it from the Supabase session
                  // (which fails open to "US" on the Vercel preview).
                  country: currentCountry,
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
              return {
                chunk,
                results: data?.results ?? {}
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
        )
          .then((allResults) => {
            if (cancelled) return;
            const merged = new Map<string, string[]>();
            const meta = new Map<string, { clearName: string; icon?: string }>();
            let successCount = 0;
            for (const { chunk, results } of allResults) {
              if (Object.keys(results).length > 0) successCount++;
              for (const item of chunk) {
                const key = `${item.mediaType}:${item.tmdbId}`;
                const entry = results[key];
                const providers = extractProvidersFromOffers(
                  entry?.offers,
                  meta
                );
                merged.set(key, providers);
              }
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
          })
          .catch(() => {
            if (cancelled) return;
            // Should be unreachable — Promise.all never rejects when
            // each inner promise catches. Defensive only.
            setAvailabilityMap(new Map());
            setPackageMeta(new Map());
            setError(true);
            setLoading(false);
          });

        // SolidJS `on()` cleanup — runs before the next effect firing.
        // We don't have an async cancellation token for `fetch`, but
        // the `cancelled` flag prevents stale state writes from a
        // previous run.
        return () => {
          cancelled = true;
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
      const key = Number.isFinite(tmdbId) && tmdbId > 0
        ? `${it.media_type}:${tmdbId}`
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

  return {
    enrichedItems,
    providerCatalog,
    loading,
    error
  };
}
