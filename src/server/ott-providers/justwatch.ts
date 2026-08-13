// src/server/ott-providers/justwatch.ts
//
// CineLog V2 — JustWatch OTT Provider Source
// ---------------------------------------------------------------------
// JustWatch's public GraphQL endpoint at https://apis.justwatch.com/graphql
// exposes per-offer `package { clearName }` and `monetizationType` for
// titles across multiple providers in a specific country.
//
// This module:
//   1. Searches for the title by name (TMDB title) restricted to the
//      user's region. Results include metadata (title, originalTitle,
//      year, type) so the caller can match against TMDB data.
//   2. Matches the best result by title + year + media-type.
//   3. Queries the matched title node's `offers(country, platform: WEB)`.
//   4. Returns the list of providers (clearName + monetizationType)
//      available for the title in the given region.
//
// This is the SAME JustWatch endpoint used by the audio-language module.
// Both modules share the endpoint but have separate queries + cache tables.
//
// NOTES:
//   - We distinguish "error" (network/GraphQL failure → do NOT cache) from
//     "noData" (title found but has no offers → safe to cache as empty).
//   - The `clearName` field is JustWatch's canonical provider name
//     (e.g. "Netflix", "Prime Video", "JioHotstar").
//   - Per spec STEP 4: we DO NOT bypass auth/DRM. JustWatch's GraphQL
//     is a public endpoint that returns metadata only — no video,
//     no tokens, no auth required.

import type {
  ProviderAvailabilityEntry,
  JustWatchOffer,
  JustWatchOffersResponse,
  TitleType,
  JustWatchSearchResult,
  JustWatchSearchNode,
  ProviderFetchResult
} from "./types";

const JUSTWATCH_GRAPHQL = "https://apis.justwatch.com/graphql";

/** Search query: returns JustWatch node IDs + metadata for ranking. */
const SEARCH_QUERY = `query SearchTitles($country: Country!, $filter: TitleFilter!) {
  popularTitles(country: $country, first: 10, filter: $filter) {
    edges {
      node {
        id
        title
        originalTitle
        releaseYear
        objectType
      }
    }
  }
}`;

/** Offers query: returns all provider offers for a given node ID + country. */
const OFFERS_QUERY = `query GetTitle($id: ID!, $country: Country!, $platform: Platform!) {
  node(id: $id) {
    id
    ... on Movie {
      offers(country: $country, platform: $platform) {
        monetizationType
        package { clearName }
      }
    }
    ... on Show {
      offers(country: $country, platform: $platform) {
        monetizationType
        package { clearName }
      }
    }
  }
}`;

/** Map JustWatch objectType values to our TitleType. */
const OBJECT_TYPE_MAP: Record<string, TitleType> = {
  movie: "movie",
  show: "tv",
  season: "tv",
  episode: "tv"
};

/**
 * Normalize a title for comparison: lowercase, trim, collapse spaces.
 */
function normalizeTitle(t: string): string {
  return t.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Score a JustWatch search result against the TMDB title/type/year.
 * Higher = better match. Returns -1 if the result clearly doesn't match.
 *
 * Scoring priorities (strongest signals first):
 *  1. Exact title match + year match + type match → 100
 *  2. Exact title match + year match → 80
 *  3. Exact title match + type match → 70
 *  4. Exact title match (no year/type) → 60
 *  5. Normalized title match + year match → 50
 *  6. Normalized title match + type match → 40
 *  7. Normalized title match → 30
 *  8. Subtitle / parenthesized year match → 20
 *  9. No match → -1
 */
export function scoreResult(
  searchResult: JustWatchSearchResult,
  tmdbTitle: string,
  tmdbYear: number | null | undefined,
  expectedType: TitleType
): number {
  const normJwTitle = normalizeTitle(searchResult.title);
  const normTmdbTitle = normalizeTitle(tmdbTitle);
  const normJwOrigTitle = searchResult.originalTitle
    ? normalizeTitle(searchResult.originalTitle)
    : null;

  const yearMatch =
    tmdbYear != null &&
    searchResult.year != null &&
    searchResult.year === tmdbYear;
  const typeMatch = searchResult.type === expectedType;

  // Try matching against both the localized title and the original title.
  const titleExact =
    normJwTitle === normTmdbTitle ||
    (!!normJwOrigTitle && normJwOrigTitle === normTmdbTitle);
  const titleNormalized = titleExact;

  if (titleExact && yearMatch && typeMatch) return 100;
  if (titleExact && yearMatch) return 80;
  if (titleExact && typeMatch) return 70;
  if (titleExact) return 60;

  if (titleNormalized && yearMatch) return 50;
  if (titleNormalized && typeMatch) return 40;
  if (titleNormalized) return 30;

  // Weak signal: title contains or is contained by the search result.
  if (normJwTitle.includes(normTmdbTitle) || normTmdbTitle.includes(normJwTitle)) {
    if (yearMatch) return 20;
    if (typeMatch) return 15;
    return 10;
  }

  return -1;
}

/**
 * Search JustWatch for a title and return ranked search results with metadata.
 *
 * Returns an array of JustWatchSearchResult (may be empty if no results).
 * Returns `null` on network/GraphQL error (not an empty array — the caller
 * must distinguish "error" from "no results").
 */
async function searchJustWatch(
  title: string,
  country: string
): Promise<JustWatchSearchResult[] | null> {
  if (!title) return [];

  let res: Response;
  try {
    res = await fetch(JUSTWATCH_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; CineLog/2.0; +https://cinelogv2.vercel.app)"
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: {
          country,
          filter: { searchQuery: title }
        }
      })
    });
  } catch (err) {
    console.warn(
      `[ott-providers/justwatch] search fetch failed for "${title}":`,
      err
    );
    return null;
  }

  if (!res.ok) {
    console.warn(
      `[ott-providers/justwatch] search returned ${res.status} for "${title}"`
    );
    return null;
  }

  let json: {
    data?: { popularTitles?: { edges?: Array<{ node: JustWatchSearchNode }> } };
    errors?: Array<{ message: string }>;
  };
  try {
    json = await res.json();
  } catch (err) {
    console.warn(
      `[ott-providers/justwatch] search JSON parse failed for "${title}":`,
      err
    );
    return null;
  }

  if (json.errors && json.errors.length > 0) {
    console.warn(
      `[ott-providers/justwatch] search GraphQL errors for "${title}":`,
      json.errors.map((e) => e.message).join("; ")
    );
    return null;
  }

  const edges = json.data?.popularTitles?.edges ?? [];
  if (edges.length === 0) return [];

  return edges.map((edge) => {
    const node = edge.node;
    return {
      nodeId: node.id,
      title: node.title ?? "",
      originalTitle: node.originalTitle ?? null,
      year: node.releaseYear ?? null,
      type: node.objectType ? (OBJECT_TYPE_MAP[node.objectType] ?? "movie") : "movie"
    };
  });
}

/**
 * Fetch all offers for a JustWatch node ID and return the provider list.
 *
 * Returns a ProviderFetchResult:
 *  - ProviderFetchSuccess when offers query completed (even if empty).
 *  - ProviderFetchError when there was a network/GraphQL/HTTP/parse error.
 */
async function fetchOffers(
  nodeId: string,
  country: string
): Promise<ProviderFetchResult> {
  let res: Response;
  try {
    res = await fetch(JUSTWATCH_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; CineLog/2.0; +https://cinelogv2.vercel.app)"
      },
      body: JSON.stringify({
        query: OFFERS_QUERY,
        variables: { id: nodeId, country, platform: "WEB" }
      })
    });
  } catch (err) {
    return {
      error: `fetch failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  if (!res.ok) {
    return { error: `HTTP ${res.status}` };
  }

  let json: JustWatchOffersResponse;
  try {
    json = await res.json();
  } catch (err) {
    return {
      error: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  if (json.errors && json.errors.length > 0) {
    return {
      error: json.errors.map((e) => e.message).join("; ")
    };
  }

  const offers: JustWatchOffer[] = json.data?.node?.offers ?? [];

  // Extract unique providers from offers.
  const seen = new Set<string>();
  const providers: ProviderAvailabilityEntry[] = [];
  for (const offer of offers) {
    const name = offer.package?.clearName?.trim();
    const monetization = offer.monetizationType?.trim() ?? "unknown";
    if (!name) continue;
    const key = `${name}:${monetization}`;
    if (seen.has(key)) continue;
    seen.add(key);
    providers.push({
      providerName: name,
      monetizationType: monetization
    });
  }

  return {
    providers,
    justWatchNodeId: nodeId,
    noData: providers.length === 0
  };
}

/**
 * Fetch provider availability for a title from JustWatch.
 *
 * This is the core JustWatch provider source — queries JustWatch's public
 * GraphQL endpoint for per-offer `package.clearName` + `monetizationType`
 * and returns the list of providers where the title is available.
 *
 * Title matching: searches JustWatch by title, then ranks results by
 * title similarity, release year, and media type. Does NOT blindly use
 * the first search result.
 *
 * Error vs. no-data distinction:
 *  - `error` field set → JustWatch API failed (network/GraphQL/HTTP/parse).
 *    The caller must NOT cache this as an empty result.
 *  - `noData: true` → title was found and offers were fetched, but no
 *    providers are available. Safe to cache as empty.
 *  - `noData: false` → providers were found.
 */
export async function fetchProvidersFromJustWatch(
  title: string,
  country: string,
  type: TitleType,
  nodeId?: string,
  year?: number | null
): Promise<ProviderFetchResult> {
  // Step 1: Resolve node ID (search or use provided).
  let resolvedNodeId = nodeId;

  if (!resolvedNodeId) {
    const results = await searchJustWatch(title, country);
    if (results === null) {
      // Network/GraphQL error during search — do NOT treat as noData.
      return { error: "JustWatch title search failed" };
    }

    if (results.length === 0) {
      // No search results — this is a genuine "no match" situation.
      // We cannot confirm noData for a title we couldn't find, so return
      // an error to avoid caching a misleading empty result.
      return { error: "No JustWatch title found for search" };
    }

    // Rank results by match quality using scoreResult.
    let bestResult: JustWatchSearchResult | null = null;
    let bestScore = -1;

    for (const r of results) {
      const score = scoreResult(r, title, year, type);
      if (score > bestScore) {
        bestScore = score;
        bestResult = r;
      }
    }

    // Require at least some confidence (title + type match, or exact title).
    // A title-only partial match without type confirmation is not reliable.
    if (!bestResult || bestScore < 30) {
      return { error: "No reliable JustWatch title match found" };
    }

    resolvedNodeId = bestResult.nodeId;
  }

  // Step 2: Fetch offers.
  const fetchResult = await fetchOffers(resolvedNodeId, country);

  return fetchResult;
}

/**
 * Normalize a JustWatch region string: uppercase + 2-letter ISO 3166-1.
 * Falls back to "US" for invalid input.
 */
export function normalizeRegion(region: string | undefined): string {
  if (!region) return "US";
  const upper = region.trim().toUpperCase();
  if (upper.length === 2 && /^[A-Z]{2}$/.test(upper)) return upper;
  return "US";
}
