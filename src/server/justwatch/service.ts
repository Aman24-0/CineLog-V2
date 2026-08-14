// src/server/justwatch/service.ts
//
// CineLog V2 — JustWatch OTT Migration — Core Service Layer
// ---------------------------------------------------------------------
// Composes the JustWatch GraphQL client (`src/server/justwatch/client.ts`)
// with the Supabase cache layer (`src/server/justwatch/cache.ts`) to
// provide a single server-side entry point for OTT data:
//
//   getProviderCatalog(country)
//     └─ cache → JustWatch `packages(country, platform: WEB)`
//
//   resolveTitleToJustWatchNode({ mediaType, tmdbId, country, title, year })
//     └─ cache → JustWatch `searchTitles(country, searchQuery, objectTypes, releaseYear)`
//
//   getTitleOttAvailability({ mediaType, tmdbId, country, title?, year? })
//     └─ cache → resolveTitleToJustWatchNode → JustWatch `node(id).offers(country, WEB)`
//
//   batchGetTitleOttAvailability({ items, country })
//     └─ per-item cache → resolve each → JustWatch `batchGetJustWatchOffers(...)`
//
// Design rules (inherited from `client.ts`):
//
//   1. NEVER throw to the caller for network / JustWatch / cache errors.
//      Return `null` / `[]` / partial results and `console.warn` the
//      error. Only throw for developer errors: invalid `mediaType`,
//      invalid `country`, batch size > 25.
//
//   2. Cache-first. Every public function checks the cache before
//      hitting JustWatch, and writes back to the cache on a fresh fetch.
//      Stale rows are NOT returned (this is a strict-cache chunk; a
//      later chunk may introduce stale-while-revalidate behavior).
//
//   3. Country validation delegates to the client (`/^[A-Z]{2}$/`). We
//      re-validate at the service layer too so caller errors fail fast
//      before any cache lookup.
//
// This file is intentionally NOT wired into any route or UI yet. It is
// a foundation-only chunk; later chunks will expose these functions via
// API routes and replace the existing TMDB watch-provider code.

import {
  batchGetJustWatchOffers,
  getJustWatchOffers,
  getJustWatchPackages,
  searchJustWatchTitle
} from "~/server/justwatch/client";
import {
  getCachedOttAvailability,
  getCachedProviderCatalog,
  getCachedTitleMapping,
  upsertOttAvailability,
  upsertProviderCatalog,
  upsertTitleMapping
} from "~/server/justwatch/cache";
import type {
  JustWatchPackage,
  JustWatchTitleOffers
} from "~/shared/types/justwatch";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const COUNTRY_RE = /^[A-Z]{2}$/;
const VALID_MEDIA_TYPES = new Set(["movie", "tv"] as const);

function validateCountry(country: string): void {
  if (typeof country !== "string" || !COUNTRY_RE.test(country)) {
    throw new Error(
      `[justwatch/service] invalid country code: ${JSON.stringify(
        country
      )} — expected 2-letter ISO 3166-1 alpha-2 (e.g. "IN", "US", "DE")`
    );
  }
}

function validateMediaType(mediaType: unknown): asserts mediaType is
  | "movie"
  | "tv" {
  if (!VALID_MEDIA_TYPES.has(mediaType as "movie" | "tv")) {
    throw new Error(
      `[justwatch/service] invalid mediaType: ${JSON.stringify(
        mediaType
      )} — expected "movie" or "tv"`
    );
  }
}

// ---------------------------------------------------------------------------
// A. Provider catalog
// ---------------------------------------------------------------------------

/**
 * Get the JustWatch provider catalog for a country — the list of all
 * streaming providers (Netflix, Prime Video, JioHotstar, etc.) that
 * operate in that country, each with a logo URL template.
 *
 * Flow:
 *   1. Validate country.
 *   2. Check cache via `getCachedProviderCatalog` (wrapped in try/catch
 *      so cache failures fall through to live JustWatch).
 *   3. If fresh cache exists, return it.
 *   4. Otherwise fetch from JustWatch via `getJustWatchPackages`.
 *   5. If JustWatch returns [], return [].
 *   6. Upsert the result into the cache (best-effort — errors are
 *      swallowed inside the cache layer).
 *   7. Return the providers.
 *
 * Resilience: cache reads and writes NEVER cause this function to return
 * empty. If the cache table is missing, RLS rejects the write, or the
 * service-role key is absent, the function still returns the live
 * JustWatch `packages()` result. Only JustWatch fetch failures return [].
 */
export async function getProviderCatalog(
  country: string
): Promise<JustWatchPackage[]> {
  validateCountry(country);

  // 1. Cache read (best-effort — never blocks the live fetch)
  try {
    const cached = await getCachedProviderCatalog(country);
    if (cached && cached.length > 0) {
      return cached;
    }
  } catch (err) {
    console.warn(
      "[justwatch/service] getProviderCatalog: cache read threw:",
      err instanceof Error ? err.message : String(err)
    );
  }

  // 2. Fresh fetch
  let providers: JustWatchPackage[];
  try {
    providers = await getJustWatchPackages({ country, platform: "WEB" });
  } catch (err) {
    console.warn(
      "[justwatch/service] getProviderCatalog: JustWatch fetch threw:",
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }

  if (!providers || providers.length === 0) {
    return [];
  }

  // 3. Cache write (best-effort — the cache layer swallows its own
  //    errors and warns; we additionally wrap in try/catch as a
  //    defensive backstop so a future regression can never propagate
  //    a cache error to the route handler).
  try {
    await upsertProviderCatalog(country, providers);
  } catch (err) {
    console.warn(
      "[justwatch/service] getProviderCatalog: cache write threw:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return providers;
}

// ---------------------------------------------------------------------------
// B. Title → JustWatch node ID resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a TMDB title to its JustWatch node ID. The mapping is cached
 * for 30 days by default (TMDB↔JustWatch IDs are very stable).
 *
 * Flow:
 *   1. Validate mediaType + country.
 *   2. Check cache via `getCachedTitleMapping`.
 *   3. If found, return the cached node ID.
 *   4. Determine `objectTypes` (`["MOVIE"]` for movie, `["SHOW"]` for tv).
 *   5. Build the releaseYear IntFilter window (±1 year) only if a year
 *      was provided.
 *   6. Call `searchJustWatchTitle`.
 *   7. If results empty, return null.
 *   8. Take the first result's nodeId.
 *   9. Upsert the mapping.
 *   10. Return the nodeId.
 *
 * On any error: return `null` and `console.warn`. Never throws to caller.
 */
export async function resolveTitleToJustWatchNode(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  country: string;
  title: string;
  releaseYear?: number | null;
}): Promise<string | null> {
  validateMediaType(input.mediaType);
  validateCountry(input.country);

  if (!input.title || typeof input.title !== "string") {
    return null;
  }

  // 1. Cache read (best-effort — never blocks the live search)
  //    Chunk 6E: also guard against stale/null cached nodeIds — if a
  //    previous bug ever wrote an empty-string nodeId, treat it as a
  //    cache miss so we re-resolve instead of returning a known-bad
  //    value forever.
  try {
    const cached = await getCachedTitleMapping(
      input.mediaType,
      input.tmdbId,
      input.country
    );
    if (cached && typeof cached === "string" && cached.length > 0) {
      return cached;
    }
  } catch (err) {
    console.warn(
      "[justwatch/service] resolveTitleToJustWatchNode: cache read threw:",
      err instanceof Error ? err.message : String(err)
    );
  }

  // 2. Build search args
  const objectTypes: Array<"MOVIE" | "SHOW"> =
    input.mediaType === "movie" ? ["MOVIE"] : ["SHOW"];

  const year =
    typeof input.releaseYear === "number" && Number.isFinite(input.releaseYear)
      ? input.releaseYear
      : null;

  const releaseYearFrom = year != null ? year - 1 : undefined;
  const releaseYearTo = year != null ? year + 1 : undefined;

  // 3. Search JustWatch
  let results;
  try {
    results = await searchJustWatchTitle({
      country: input.country,
      searchQuery: input.title,
      objectTypes,
      releaseYearFrom,
      releaseYearTo
    });
  } catch (err) {
    console.warn(
      "[justwatch/service] resolveTitleToJustWatchNode: search threw:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }

  if (!results || results.length === 0) {
    // Chunk 6E: do NOT cache a failed resolution. Returning null here
    // without writing to the cache means the next request will retry
    // JustWatch — important when the failure was transient (rate limit,
    // outage) or when JustWatch hasn't indexed the title yet.
    console.log(
      `[OTT resolve] no results type=${input.mediaType} tmdbId=${input.tmdbId} country=${input.country} title=${input.title}`
    );
    return null;
  }

  const nodeId = results[0].nodeId;
  if (!nodeId || typeof nodeId !== "string" || nodeId.length === 0) {
    // Defensive: search returned a result but no nodeId — do NOT cache.
    console.log(
      `[OTT resolve] empty nodeId type=${input.mediaType} tmdbId=${input.tmdbId} country=${input.country} title=${input.title}`
    );
    return null;
  }

  console.log(
    `[OTT resolve] OK type=${input.mediaType} tmdbId=${input.tmdbId} country=${input.country} nodeId=${nodeId} title=${input.title} candidates=${results.length}`
  );

  // 4. Cache write (best-effort) — only on successful resolution with a
  //    non-empty nodeId.
  try {
    await upsertTitleMapping(
      input.mediaType,
      input.tmdbId,
      input.country,
      nodeId
    );
  } catch (err) {
    console.warn(
      "[justwatch/service] resolveTitleToJustWatchNode: cache write threw:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return nodeId;
}

// ---------------------------------------------------------------------------
// C. Single-title OTT availability
// ---------------------------------------------------------------------------

/**
 * Get the OTT availability (offers) for a single TMDB title in a
 * country. Composes `resolveTitleToJustWatchNode` with
 * `getJustWatchOffers`.
 *
 * Flow:
 *   1. Validate mediaType + country.
 *   2. Check cache via `getCachedOttAvailability`.
 *   3. If fresh cache exists, return `{ nodeId, offers }`.
 *   4. If no cache:
 *      a. If `input.title` is missing, return null (cannot resolve).
 *      b. Call `resolveTitleToJustWatchNode`. If null, return null.
 *      c. Call `getJustWatchOffers({ nodeId, country, platform: WEB })`.
 *      d. If result null or offers empty, return null.
 *      e. Upsert availability cache.
 *      f. Return result.
 *
 * On any error: return `null` and `console.warn`. Never throws to caller.
 */
export async function getTitleOttAvailability(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  country: string;
  title?: string;
  releaseYear?: number | null;
}): Promise<JustWatchTitleOffers | null> {
  validateMediaType(input.mediaType);
  validateCountry(input.country);

  // 1. Cache read (best-effort — never blocks the live fetch)
  //    Chunk 6E: guard against stale cache rows whose `offers` array is
  //    empty. A previous bug (or a future regression) could have written
  //    a row with `offers: []`. Treat such rows as a miss so we re-fetch
  //    live instead of returning empty forever.
  try {
    const cached = await getCachedOttAvailability(
      input.mediaType,
      input.tmdbId,
      input.country
    );
    if (
      cached &&
      cached.justwatchNodeId &&
      Array.isArray(cached.offers) &&
      cached.offers.length > 0
    ) {
      console.log(
        `[OTT availability] cache hit type=${input.mediaType} tmdbId=${input.tmdbId} country=${input.country} nodeId=${cached.justwatchNodeId} offers=${cached.offers.length}`
      );
      return {
        nodeId: cached.justwatchNodeId,
        offers: cached.offers
      };
    }
  } catch (err) {
    console.warn(
      "[justwatch/service] getTitleOttAvailability: cache read threw:",
      err instanceof Error ? err.message : String(err)
    );
  }

  // 2. Need to resolve — title is required for resolution
  if (!input.title || typeof input.title !== "string") {
    return null;
  }

  const nodeId = await resolveTitleToJustWatchNode({
    mediaType: input.mediaType,
    tmdbId: input.tmdbId,
    country: input.country,
    title: input.title,
    releaseYear: input.releaseYear ?? null
  });
  if (!nodeId) {
    console.log(
      `[OTT availability] resolve FAILED type=${input.mediaType} tmdbId=${input.tmdbId} country=${input.country} title=${input.title}`
    );
    return null;
  }

  // 3. Fetch offers
  let result: JustWatchTitleOffers | null;
  try {
    result = await getJustWatchOffers({
      nodeId,
      country: input.country,
      platform: "WEB"
    });
  } catch (err) {
    console.warn(
      "[justwatch/service] getTitleOttAvailability: getJustWatchOffers threw:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }

  if (!result || !result.offers || result.offers.length === 0) {
    // Chunk 6E: do NOT cache empty offers — a transient JustWatch
    // outage or indexing delay should not poison the cache for 48h.
    console.log(
      `[OTT availability] no offers type=${input.mediaType} tmdbId=${input.tmdbId} country=${input.country} nodeId=${nodeId} title=${input.title}`
    );
    return null;
  }

  console.log(
    `[OTT availability] cache miss OK type=${input.mediaType} tmdbId=${input.tmdbId} country=${input.country} nodeId=${nodeId} offers=${result.offers.length} title=${input.title}`
  );

  // 4. Cache write (best-effort) — only when offers are non-empty.
  try {
    await upsertOttAvailability(
      input.mediaType,
      input.tmdbId,
      input.country,
      nodeId,
      result.offers
    );
  } catch (err) {
    console.warn(
      "[justwatch/service] getTitleOttAvailability: cache write threw:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// D. Batch OTT availability
// ---------------------------------------------------------------------------

const MAX_BATCH_ITEMS = 25;

/**
 * Batch-fetch OTT availability for up to 25 TMDB titles in a single
 * country. Composes per-item cache lookup with the JustWatch client's
 * `batchGetJustWatchOffers` (aliased multi-`node()` query) to avoid the
 * N+1 query problem.
 *
 * Flow:
 *   1. Validate country.
 *   2. Enforce `items.length <= 25` — throw developer error if exceeded.
 *   3. For each item, check the per-title cache.
 *   4. Items with fresh cache → merge into result keyed by
 *      `${mediaType}:${tmdbId}`.
 *   5. For uncached items:
 *      a. Call `resolveTitleToJustWatchNode` for each (in parallel via
 *         Promise.all — the client layer de-dupes concurrent requests
 *         for the same title).
 *      b. Drop items that fail resolution.
 *      c. Call `batchGetJustWatchOffers({ nodeIds, country, WEB })`.
 *      d. For each resolved item, look up its offers in the batch result.
 *      e. Drop items with empty offers.
 *      f. Upsert each successful result into the per-title cache.
 *      g. Merge into the result record.
 *
 * Returns a record keyed by `${mediaType}:${tmdbId}` →
 * `JustWatchTitleOffers`. Items that could not be resolved or had no
 * offers are OMITTED from the result (not present as null values).
 *
 * Throws ONLY for developer errors: invalid country, > 25 items.
 */
export async function batchGetTitleOttAvailability(input: {
  items: Array<{
    mediaType: "movie" | "tv";
    tmdbId: number;
    title?: string;
    releaseYear?: number | null;
  }>;
  country: string;
}): Promise<Record<string, JustWatchTitleOffers>> {
  validateCountry(input.country);

  if (!Array.isArray(input.items)) {
    throw new Error(
      "[justwatch/service] batchGetTitleOttAvailability: items must be an array"
    );
  }
  if (input.items.length > MAX_BATCH_ITEMS) {
    throw new Error(
      `[justwatch/service] batchGetTitleOttAvailability: received ${input.items.length} items — max batch size is ${MAX_BATCH_ITEMS}. Split into multiple calls.`
    );
  }

  const result: Record<string, JustWatchTitleOffers> = {};

  if (input.items.length === 0) return result;

  // 1. Per-item cache read (sequential is fine — fast DB lookups).
  //    Wrapped in try/catch so a cache failure on one item does not
  //    abort the entire batch — the item simply falls through to the
  //    live JustWatch fetch below.
  const uncached: typeof input.items = [];
  for (const item of input.items) {
    try {
      validateMediaType(item.mediaType);
    } catch {
      // Skip invalid mediaType silently rather than throwing the whole
      // batch — the spec says only throw for invalid country / > 25
      // items. Individual bad items are dropped.
      continue;
    }
    let cached = null;
    try {
      cached = await getCachedOttAvailability(
        item.mediaType,
        item.tmdbId,
        input.country
      );
    } catch (err) {
      console.warn(
        "[justwatch/service] batchGetTitleOttAvailability: cache read threw for",
        `${item.mediaType}:${item.tmdbId}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
    // Chunk 6E: skip cache rows with empty offers — treat as a miss.
    // A previous bug could have written an empty-offers row; we don't
    // want to return that forever.
    if (
      cached &&
      cached.justwatchNodeId &&
      Array.isArray(cached.offers) &&
      cached.offers.length > 0
    ) {
      result[`${item.mediaType}:${item.tmdbId}`] = {
        nodeId: cached.justwatchNodeId,
        offers: cached.offers
      };
    } else {
      uncached.push(item);
    }
  }

  if (uncached.length === 0) return result;

  // 2. Resolve node IDs in parallel. The client layer's in-flight
  //    dedupe Map will coalesce duplicate titles within this batch.
  const resolved = await Promise.all(
    uncached.map(async (item) => {
      if (!item.title) return null;
      const nodeId = await resolveTitleToJustWatchNode({
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
        country: input.country,
        title: item.title,
        releaseYear: item.releaseYear ?? null
      });
      return nodeId ? { item, nodeId } : null;
    })
  );

  const toFetch = resolved.filter(
    (r): r is { item: (typeof uncached)[number]; nodeId: string } => r !== null
  );

  if (toFetch.length === 0) {
    console.log(
      `[OTT batch] all resolved-failed country=${input.country} uncached=${uncached.length}`
    );
    return result;
  }

  // 3. Batch fetch offers for all resolved node IDs
  const nodeIds = toFetch.map((r) => r.nodeId);
  let batched: Record<string, JustWatchTitleOffers>;
  try {
    batched = await batchGetJustWatchOffers({
      nodeIds,
      country: input.country,
      platform: "WEB"
    });
  } catch (err) {
    console.warn(
      "[justwatch/service] batchGetTitleOttAvailability: batchGetJustWatchOffers threw:",
      err instanceof Error ? err.message : String(err)
    );
    console.log(
      `[OTT batch] fetch FAILED country=${input.country} nodeIds=${nodeIds.length}`
    );
    return result;
  }

  console.log(
    `[OTT batch] fetch OK country=${input.country} nodeIds=${nodeIds.length} returned=${Object.keys(batched).length}`
  );

  // 4. Match each item to its batched offers, upsert cache, merge.
  //    Cache write errors are caught per-item so one bad write doesn't
  //    lose the rest of the batch's results.
  //    Chunk 6E: only cache when offers are non-empty — never write
  //    empty offers to the cache (would poison it for 48h).
  for (const { item, nodeId } of toFetch) {
    const offerResult = batched[nodeId];
    if (!offerResult || !offerResult.offers || offerResult.offers.length === 0) {
      // Skip — do NOT cache empty.
      continue;
    }

    try {
      await upsertOttAvailability(
        item.mediaType,
        item.tmdbId,
        input.country,
        nodeId,
        offerResult.offers
      );
    } catch (err) {
      console.warn(
        "[justwatch/service] batchGetTitleOttAvailability: cache write threw for",
        `${item.mediaType}:${item.tmdbId}:`,
        err instanceof Error ? err.message : String(err)
      );
    }

    result[`${item.mediaType}:${item.tmdbId}`] = offerResult;
  }

  return result;
}
