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
//      user's region. The first result is used.
//   2. Queries the title node's `offers(country, platform: WEB)`.
//   3. Returns the list of providers (clearName + monetizationType)
//      available for the title in the given region.
//
// This is the SAME JustWatch endpoint used by the audio-language module.
// Both modules share the endpoint but have separate queries + cache tables.
//
// NOTES:
//   - JustWatch returns `[]` (empty) for offers with no provider data.
//     We treat that as noData: true.
//   - The `clearName` field is JustWatch's canonical provider name
//     (e.g. "Netflix", "Prime Video", "JioHotstar").
//   - We do NOT confuse audio languages with provider availability.
//     Only `package.clearName` + `monetizationType` are included.
//   - Per spec STEP 4: we DO NOT bypass auth/DRM. JustWatch's GraphQL
//     is a public endpoint that returns metadata only — no video,
//     no tokens, no auth required.

import type {
  ProviderAvailabilityEntry,
  JustWatchOffer,
  JustWatchOffersResponse,
  TitleType
} from "./types";

const JUSTWATCH_GRAPHQL = "https://apis.justwatch.com/graphql";

/** Search query: returns JustWatch node IDs for the search query. */
const SEARCH_QUERY = `query SearchTitles($country: Country!, $filter: TitleFilter!) {
  popularTitles(country: $country, first: 5, filter: $filter) {
    edges {
      node {
        id
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

interface JustWatchSearchEdge {
  node: {
    id: string;
  };
}

/**
 * Search JustWatch for a title and return the node ID.
 *
 * Returns `null` when no match is found.
 */
async function searchJustWatch(
  title: string,
  country: string
): Promise<string | null> {
  if (!title) return null;

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
    data?: { popularTitles?: { edges?: JustWatchSearchEdge[] } };
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
  if (edges.length === 0) return null;

  return edges[0]?.node.id ?? null;
}

/**
 * Fetch all offers for a JustWatch node ID and return the provider list.
 */
async function fetchOffers(
  nodeId: string,
  country: string
): Promise<{ offers: JustWatchOffer[]; error?: string }> {
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
      offers: [],
      error: `fetch failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  if (!res.ok) {
    return { offers: [], error: `HTTP ${res.status}` };
  }

  let json: JustWatchOffersResponse;
  try {
    json = await res.json();
  } catch (err) {
    return {
      offers: [],
      error: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  if (json.errors && json.errors.length > 0) {
    return {
      offers: [],
      error: json.errors.map((e) => e.message).join("; ")
    };
  }

  return { offers: json.data?.node?.offers ?? [] };
}

/**
 * Fetch provider availability for a title from JustWatch.
 *
 * This is the core JustWatch provider source — queries JustWatch's public
 * GraphQL endpoint for per-offer `package.clearName` + `monetizationType`
 * and returns the list of providers where the title is available.
 */
export async function fetchProvidersFromJustWatch(
  title: string,
  country: string,
  _type: TitleType,
  nodeId?: string
): Promise<{
  providers: ProviderAvailabilityEntry[];
  justWatchNodeId?: string;
  noData?: boolean;
  error?: string;
}> {
  // Step 1: Resolve node ID (search or use provided).
  const resolvedNodeId = nodeId ?? (await searchJustWatch(title, country));
  if (!resolvedNodeId) {
    return { providers: [], noData: true };
  }

  // Step 2: Fetch offers.
  const { offers, error } = await fetchOffers(resolvedNodeId, country);
  if (error) {
    return { providers: [], error, justWatchNodeId: resolvedNodeId };
  }

  if (offers.length === 0) {
    return { providers: [], noData: true, justWatchNodeId: resolvedNodeId };
  }

  // Step 3: Extract unique providers.
  const seen = new Set<string>();
  const providers: ProviderAvailabilityEntry[] = [];
  for (const offer of offers) {
    const name = offer.package?.clearName?.trim();
    const monetization = offer.monetizationType?.trim() ?? "unknown";
    if (!name) continue;
    // Deduplicate by provider name (JustWatch may list the same provider
    // multiple times with different monetization types).
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
    justWatchNodeId: resolvedNodeId,
    noData: providers.length === 0
  };
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
