// src/server/justwatch/client.ts
//
// CineLog V2 — JustWatch OTT Migration — Shared GraphQL Client
// ---------------------------------------------------------------------
// Server-only JustWatch GraphQL adapter. Used by future OTT UI / API
// routes / cache layers to fetch provider offers, provider catalog,
// and to resolve TMDB titles → JustWatch node IDs.
//
// All findings encoded here were validated during Stage 3 capability
// inspection (see /home/z/my-project/download/jw_probes_stage3/).
//
// Design notes:
//
// 1. Never throws to UI for network/GraphQL errors. Returns null or
//    empty results instead. Throws ONLY for developer errors
//    (invalid country, batch > 25, etc.).
//
// 2. In-flight request de-duplication via a module-level Map. If two
//    callers request the same data while the first request is still
//    pending, both await the same Promise. The key includes the
//    function name + JSON-serialized arguments.
//
// 3. Retry policy:
//    - 2 attempts on network errors / 5xx
//    - Exponential backoff on HTTP 429 (1s, 2s, 4s...)
//    - Honors Retry-After header if present
//    - 10 second AbortController timeout per attempt
//
// 4. Country validation: must match /^[A-Z]{2}$/ (ISO 3166-1 alpha-2).
//
// 5. No logging of full offer payloads — only console.warn for errors.

import type {
  JustWatchPackage,
  JustWatchSearchResult,
  JustWatchTitleOffers
} from "~/shared/types/justwatch";

const JUSTWATCH_GRAPHQL = "https://apis.justwatch.com/graphql";

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; CineLog/2.0; +https://cinelogv2.vercel.app)"
};

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BATCH_IDS = 25;

// ---------------------------------------------------------------------------
// Country validation
// ---------------------------------------------------------------------------

const COUNTRY_RE = /^[A-Z]{2}$/;

function validateCountry(country: string): void {
  if (typeof country !== "string" || !COUNTRY_RE.test(country)) {
    throw new Error(
      `[justwatch/client] invalid country code: ${JSON.stringify(
        country
      )} — expected 2-letter ISO 3166-1 alpha-2 (e.g. "IN", "US", "DE")`
    );
  }
}

// ---------------------------------------------------------------------------
// In-flight request deduplication
// ---------------------------------------------------------------------------

const inFlight = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const p = factory().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

// ---------------------------------------------------------------------------
// Raw GraphQL fetch helper
// ---------------------------------------------------------------------------

type RawGqlResult<T> = { data: T | null; errors: unknown[] | null } | null;

async function rawGql<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  label: string
): Promise<RawGqlResult<T>> {
  const body = JSON.stringify({ query, variables });

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(JUSTWATCH_GRAPHQL, {
        method: "POST",
        headers: DEFAULT_HEADERS,
        body,
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeout);
      if (attempt < 2) {
        console.warn(
          `[justwatch/client] ${label} fetch error attempt ${attempt}:`,
          err instanceof Error ? err.message : String(err)
        );
        continue;
      }
      console.warn(
        `[justwatch/client] ${label} fetch failed after 2 attempts:`,
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }
    clearTimeout(timeout);

    // 429 — honor Retry-After, exponential backoff
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      let waitMs: number;
      if (retryAfter) {
        const secs = Number(retryAfter);
        waitMs = Number.isFinite(secs) ? secs * 1000 : 30_000;
      } else {
        waitMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s
      }
      if (attempt < 2) {
        console.warn(
          `[justwatch/client] ${label} HTTP 429 — backing off ${waitMs}ms`
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      console.warn(`[justwatch/client] ${label} HTTP 429 — giving up`);
      return null;
    }

    // 5xx — retry once
    if (res.status >= 500 && res.status < 600) {
      if (attempt < 2) {
        console.warn(
          `[justwatch/client] ${label} HTTP ${res.status} — retrying`
        );
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      console.warn(
        `[justwatch/client] ${label} HTTP ${res.status} — giving up`
      );
      return null;
    }

    // Non-OK non-retryable
    if (!res.ok) {
      console.warn(`[justwatch/client] ${label} HTTP ${res.status}`);
      return null;
    }

    // Parse JSON
    let json: { data?: T; errors?: unknown[] };
    try {
      json = (await res.json()) as { data?: T; errors?: unknown[] };
    } catch (err) {
      console.warn(
        `[justwatch/client] ${label} JSON parse failed:`,
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }

    return {
      data: (json.data ?? null) as T | null,
      errors: (json.errors ?? null) as unknown[] | null
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// GraphQL operation strings
// ---------------------------------------------------------------------------

// CHUNK 6B FIX: The original queries used inline `filter: { searchQuery,
// objectTypes, releaseYear }` with `releaseYear: IntFilter` typed as
// `{ from, to }`. JustWatch's GraphQL schema rejects `{ from, to }` on
// IntFilter with 422 "unknown field" — the correct IntFilter field names
// are undocumented and probing showed `{from,to}` / `releaseYearFrom` /
// `releaseDateFrom` all fail. The year filter is non-essential (search +
// objectTypes is sufficient for title resolution), so it's dropped.
//
// Additionally, `objectType` is NOT selectable directly on the search
// `node` (it's only on concrete Movie/Show types via inline fragments).
// The audio-language module's working query requests only `id`. We do
// the same — `JustWatchSearchResult.objectType` is optional and unused
// by the only caller (`resolveTitleToJustWatchNode` uses `results[0].nodeId`).
//
// The `filter` is now passed as a `$filter: TitleFilter!` variable (matching
// the audio-language module's proven format) instead of an inline object,
// and `source` is passed as a required `$source: String!` variable.
const SEARCH_TITLES_QUERY = `query SearchJustWatchTitle(
  $country: Country!,
  $source: String!,
  $filter: TitleFilter!
) {
  searchTitles(
    country: $country,
    source: $source,
    first: 5,
    filter: $filter
  ) {
    edges {
      node {
        id
      }
    }
  }
}`;

const POPULAR_TITLES_FALLBACK_QUERY = `query PopularTitlesFallback(
  $country: Country!,
  $filter: TitleFilter!
) {
  popularTitles(
    country: $country,
    first: 5,
    filter: $filter
  ) {
    edges {
      node {
        id
      }
    }
  }
}`;

const GET_OFFERS_QUERY = `query GetJustWatchOffers(
  $id: ID!,
  $country: Country!,
  $platform: Platform!
) {
  node(id: $id) {
    id
    ... on Movie {
      objectType
      offers(country: $country, platform: $platform) {
        monetizationType
        presentationType
        audioLanguages
        subtitleLanguages
        availableFromTime
        availableToTime
        currency
        package {
          id
          clearName
          shortName
          technicalName
          icon
        }
        standardWebURL
        deeplinkURL(platform: WEB)
      }
    }
    ... on Show {
      objectType
      offers(country: $country, platform: $platform) {
        monetizationType
        presentationType
        audioLanguages
        subtitleLanguages
        availableFromTime
        availableToTime
        currency
        package {
          id
          clearName
          shortName
          technicalName
          icon
        }
        standardWebURL
        deeplinkURL(platform: WEB)
      }
    }
  }
}`;

const GET_PACKAGES_QUERY = `query GetJustWatchPackages(
  $country: Country!,
  $platform: Platform!
) {
  packages(country: $country, platform: $platform) {
    id
    clearName
    shortName
    technicalName
    icon
  }
}`;

// ---------------------------------------------------------------------------
// Response shape types (internal)
// ---------------------------------------------------------------------------

interface GqlSearchResponse {
  searchTitles?: {
    edges?: Array<{ node?: { id?: string } }>;
  } | null;
}

interface GqlPopularResponse {
  popularTitles?: {
    edges?: Array<{ node?: { id?: string } }>;
  } | null;
}

interface GqlOfferObject {
  monetizationType?: string | null;
  presentationType?: string | null;
  audioLanguages?: string[] | null;
  subtitleLanguages?: string[] | null;
  availableFromTime?: string | null;
  availableToTime?: string | null;
  currency?: string | null;
  package?: {
    id?: string;
    clearName?: string;
    shortName?: string;
    technicalName?: string;
    icon?: string;
  } | null;
  standardWebURL?: string | null;
  deeplinkURL?: string | null;
}

interface GqlOffersResponse {
  node?: {
    id?: string;
    objectType?: string | null;
    offers?: GqlOfferObject[] | null;
  } | null;
}

interface GqlPackagesResponse {
  packages?: Array<{
    id?: string;
    clearName?: string;
    shortName?: string;
    technicalName?: string;
    icon?: string;
  }> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JustWatchMonetizationish = "FLATRATE" | "RENT" | "BUY" | "FAST" | string;
type JustWatchOfferish = {
  monetizationType: JustWatchMonetizationish;
  presentationType?: string | null;
  audioLanguages: string[];
  subtitleLanguages: string[];
  availableFromTime: string | null;
  availableToTime: string | null;
  currency: string;
  package: JustWatchPackage;
  standardWebURL: string | null;
  deeplinkURL: string | null;
};

function coerceObjectType(
  v: string | null | undefined
): "MOVIE" | "SHOW" | string | null {
  if (v == null) return null;
  return v;
}

// CHUNK 6B FIX: Relaxed validation — only `id`, `clearName`, and
// `technicalName` are required. `shortName` and `icon` default to empty
// string when missing. The original strict validation required ALL five
// fields to be truthy, which dropped any package where JustWatch omitted
// `shortName` or `icon` (observed for some regional providers). Probing
// the IN catalog showed all 89 providers had all fields, but other
// countries may not — the relaxed validation is defensive.
// Consumers already handle empty `icon` (buildLogoUrl returns "" →
// letter fallback) and empty `shortName` (matchesQuery uses optional
// chaining).
function coercePackage(
  p: GqlOfferObject["package"]
): JustWatchPackage | null {
  if (!p) return null;
  if (!p.id || !p.clearName || !p.technicalName) {
    return null;
  }
  return {
    id: p.id,
    clearName: p.clearName,
    shortName: p.shortName ?? "",
    technicalName: p.technicalName,
    icon: p.icon ?? ""
  };
}

function coerceOffer(o: GqlOfferObject): JustWatchOfferish | null {
  const pkg = coercePackage(o.package);
  if (!pkg) return null;
  if (!o.monetizationType) return null;
  return {
    monetizationType: o.monetizationType as JustWatchMonetizationish,
    presentationType: o.presentationType ?? null,
    audioLanguages: o.audioLanguages ?? [],
    subtitleLanguages: o.subtitleLanguages ?? [],
    availableFromTime: o.availableFromTime ?? null,
    availableToTime: o.availableToTime ?? null,
    currency: o.currency ?? "",
    package: pkg,
    standardWebURL: o.standardWebURL ?? null,
    deeplinkURL: o.deeplinkURL ?? null
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search JustWatch for a title and return up to 5 candidate node IDs.
 *
 * Strategy:
 *   1. Try `searchTitles(country, source: "search", first: 5, filter)`.
 *   2. If that fails or returns no edges, fall back to
 *      `popularTitles(country, first: 5, filter)` with the same args.
 *
 * `objectTypes` is required by the GraphQL schema; pass `["MOVIE"]` or
 * `["SHOW"]` (or both) to disambiguate Movie/Show collisions (e.g.
 * "Demon Slayer" exists as both a Movie and a Show).
 *
 * `releaseYearFrom` / `releaseYearTo` are optional and become an
 * `IntFilter` on `releaseYear` to further narrow results.
 */
export async function searchJustWatchTitle(args: {
  country: string;
  searchQuery: string;
  objectTypes: Array<"MOVIE" | "SHOW">;
  /** @deprecated Chunk 6B: the releaseYear IntFilter format is
   *  undocumented and `{ from, to }` causes 422. The parameter is
   *  accepted for backward compat but NOT sent to JustWatch. Title
   *  resolution now relies on searchQuery + objectTypes only. */
  releaseYearFrom?: number;
  releaseYearTo?: number;
}): Promise<JustWatchSearchResult[]> {
  validateCountry(args.country);
  if (!args.searchQuery || typeof args.searchQuery !== "string") {
    return [];
  }
  if (!Array.isArray(args.objectTypes) || args.objectTypes.length === 0) {
    throw new Error(
      `[justwatch/client] searchJustWatchTitle: objectTypes must be a non-empty array`
    );
  }

  // CHUNK 6B: Build TitleFilter as a variable object. Only `searchQuery`
  // and `objectTypes` are included — `releaseYear` is dropped because the
  // IntFilter format (`{ from, to }`) causes 422 "unknown field" and the
  // correct field names are undocumented. Search + objectTypes is
  // sufficient for title resolution (JustWatch sorts by popularity, so
  // the first result is almost always the right match).
  const filter: { searchQuery: string; objectTypes: Array<"MOVIE" | "SHOW"> } = {
    searchQuery: args.searchQuery,
    objectTypes: args.objectTypes
  };

  // searchTitles variables — `source` is a required String! argument.
  const searchVariables = { country: args.country, source: "search", filter };
  // popularTitles variables — no `source` argument.
  const popularVariables = { country: args.country, filter };

  const dedupeKey = `searchJustWatchTitle:${JSON.stringify(searchVariables)}`;
  return dedupe(dedupeKey, async () => {
    // 1. searchTitles (primary)
    const primary = await rawGql<GqlSearchResponse>(
      SEARCH_TITLES_QUERY,
      searchVariables,
      "searchTitles"
    );
    if (primary && primary.errors == null) {
      const edges = primary.data?.searchTitles?.edges ?? [];
      const results: JustWatchSearchResult[] = [];
      for (const e of edges) {
        if (e?.node?.id) {
          results.push({ nodeId: e.node.id });
        }
      }
      if (results.length > 0) return results;
    } else if (primary && primary.errors != null) {
      console.warn(
        `[justwatch/client] searchTitles GraphQL errors — falling back to popularTitles`
      );
    }

    // 2. popularTitles (fallback — same filter, no `source` arg)
    const fallback = await rawGql<GqlPopularResponse>(
      POPULAR_TITLES_FALLBACK_QUERY,
      popularVariables,
      "popularTitles(fallback)"
    );
    if (!fallback) return [];
    if (fallback.errors != null) {
      console.warn(
        `[justwatch/client] popularTitles fallback also returned GraphQL errors`
      );
      return [];
    }
    const edges = fallback.data?.popularTitles?.edges ?? [];
    const results: JustWatchSearchResult[] = [];
    for (const e of edges) {
      if (e?.node?.id) {
        results.push({ nodeId: e.node.id });
      }
    }
    return results;
  });
}

/**
 * Fetch all provider offers for a single JustWatch node ID.
 *
 * Returns `null` if the node does not exist or has no offers.
 */
export async function getJustWatchOffers(args: {
  nodeId: string;
  country: string;
  platform?: "WEB" | "IOS" | "ANDROID";
}): Promise<JustWatchTitleOffers | null> {
  validateCountry(args.country);
  if (!args.nodeId || typeof args.nodeId !== "string") {
    throw new Error(
      `[justwatch/client] getJustWatchOffers: nodeId must be a non-empty string`
    );
  }
  const platform = args.platform ?? "WEB";

  const variables = {
    id: args.nodeId,
    country: args.country,
    platform
  };

  const dedupeKey = `getJustWatchOffers:${JSON.stringify(variables)}`;
  return dedupe(dedupeKey, async () => {
    const res = await rawGql<GqlOffersResponse>(
      GET_OFFERS_QUERY,
      variables,
      `getJustWatchOffers(${args.nodeId})`
    );
    if (!res) return null;
    if (res.errors != null) {
      console.warn(
        `[justwatch/client] getJustWatchOffers GraphQL errors for ${args.nodeId}`
      );
      return null;
    }
    const node = res.data?.node;
    if (!node || !node.id) return null;

    const rawOffers = node.offers ?? [];
    const offers: JustWatchOfferish[] = [];
    for (const o of rawOffers) {
      const coerced = coerceOffer(o);
      if (coerced) offers.push(coerced);
    }

    const result: JustWatchTitleOffers = {
      nodeId: node.id,
      objectType: coerceObjectType(node.objectType ?? null) ?? undefined,
      offers: offers as unknown as JustWatchTitleOffers["offers"]
    };
    return result;
  });
}

/**
 * Fetch the JustWatch provider catalog for a country (all packages
 * available in that country, with their logo URL templates).
 */
export async function getJustWatchPackages(args: {
  country: string;
  platform?: "WEB" | "IOS" | "ANDROID";
}): Promise<JustWatchPackage[]> {
  validateCountry(args.country);
  const platform = args.platform ?? "WEB";

  const variables = { country: args.country, platform };
  const dedupeKey = `getJustWatchPackages:${JSON.stringify(variables)}`;
  return dedupe(dedupeKey, async () => {
    const res = await rawGql<GqlPackagesResponse>(
      GET_PACKAGES_QUERY,
      variables,
      `getJustWatchPackages(${args.country})`
    );
    if (!res) return [];
    if (res.errors != null) {
      console.warn(
        `[justwatch/client] getJustWatchPackages GraphQL errors for ${args.country}`
      );
      return [];
    }
    const pkgs = res.data?.packages ?? [];
    const out: JustWatchPackage[] = [];
    // CHUNK 6B: Relaxed validation — only require id, clearName,
    // technicalName. shortName and icon default to "" when missing
    // (matches coercePackage behavior in the offers path).
    for (const p of pkgs) {
      if (p.id && p.clearName && p.technicalName) {
        out.push({
          id: p.id,
          clearName: p.clearName,
          shortName: p.shortName ?? "",
          technicalName: p.technicalName,
          icon: p.icon ?? ""
        });
      }
    }
    return out;
  });
}

/**
 * Batch-fetch offers for up to 25 JustWatch node IDs in a SINGLE
 * GraphQL request using aliases. Eliminates the N+1 query problem
 * for fetching season/episode offers in TV-show details views.
 *
 * Returns a record keyed by nodeId with the offers result. Aliases
 * that return null (node not found, no offers) are omitted from the
 * result.
 *
 * Throws a developer error if `nodeIds.length > 25`.
 */
export async function batchGetJustWatchOffers(args: {
  nodeIds: string[];
  country: string;
  platform?: "WEB" | "IOS" | "ANDROID";
}): Promise<Record<string, JustWatchTitleOffers>> {
  validateCountry(args.country);
  if (!Array.isArray(args.nodeIds)) {
    throw new Error(
      `[justwatch/client] batchGetJustWatchOffers: nodeIds must be an array`
    );
  }
  if (args.nodeIds.length > MAX_BATCH_IDS) {
    throw new Error(
      `[justwatch/client] batchGetJustWatchOffers: received ${args.nodeIds.length} node IDs — max batch size is ${MAX_BATCH_IDS}. Split into multiple calls.`
    );
  }
  const platform = args.platform ?? "WEB";
  const uniqueIds = Array.from(new Set(args.nodeIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  // Build aliased query
  const aliasFragments = uniqueIds
    .map((id, i) => {
      const alias = `n${i}`;
      return `${alias}: node(id: ${JSON.stringify(id)}) {
        id
        ... on Movie {
          objectType
          offers(country: $country, platform: $platform) {
            monetizationType
            presentationType
            audioLanguages
            subtitleLanguages
            availableFromTime
            availableToTime
            currency
            package { id clearName shortName technicalName icon }
            standardWebURL
            deeplinkURL(platform: WEB)
          }
        }
        ... on Show {
          objectType
          offers(country: $country, platform: $platform) {
            monetizationType
            presentationType
            audioLanguages
            subtitleLanguages
            availableFromTime
            availableToTime
            currency
            package { id clearName shortName technicalName icon }
            standardWebURL
            deeplinkURL(platform: WEB)
          }
        }
      }`;
    })
    .join("\n");

  const query = `query BatchGetJustWatchOffers(
    $country: Country!,
    $platform: Platform!
  ) {
    ${aliasFragments}
  }`;

  const variables = { country: args.country, platform };

  // Dedupe key includes the sorted node IDs so two callers asking for
  // the same set (in any order) share the same in-flight request.
  const dedupeKey = `batchGetJustWatchOffers:${args.country}:${platform}:${Array.from(
    new Set(uniqueIds)
  )
    .slice()
    .sort()
    .join(",")}`;

  return dedupe(dedupeKey, async () => {
    const res = await rawGql<Record<string, GqlOffersResponse["node"]>>(
      query,
      variables,
      `batchGetJustWatchOffers(${uniqueIds.length} ids)`
    );
    if (!res) return {};
    if (res.errors != null) {
      console.warn(
        `[justwatch/client] batchGetJustWatchOffers GraphQL errors — partial or empty result`
      );
      // Do not return immediately — we may still have partial data.
    }
    const data = res.data ?? {};
    const out: Record<string, JustWatchTitleOffers> = {};
    for (let i = 0; i < uniqueIds.length; i++) {
      const alias = `n${i}`;
      const node = data[alias];
      if (!node || !node.id) continue;
      const rawOffers = node.offers ?? [];
      const offers: JustWatchOfferish[] = [];
      for (const o of rawOffers) {
        const coerced = coerceOffer(o);
        if (coerced) offers.push(coerced);
      }
      out[node.id] = {
        nodeId: node.id,
        objectType: coerceObjectType(node.objectType ?? null) ?? undefined,
        offers: offers as unknown as JustWatchTitleOffers["offers"]
      };
    }
    return out;
  });
}
