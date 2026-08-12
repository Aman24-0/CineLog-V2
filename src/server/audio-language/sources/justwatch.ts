// src/server/audio-language/sources/justwatch.ts
//
// CineLog V2 — Audio Language Source: JustWatch GraphQL
// ---------------------------------------------------------------------
// JustWatch's public GraphQL endpoint at https://apis.justwatch.com/graphql
// exposes per-offer `audioLanguages` and `subtitleLanguages` for titles
// across multiple providers (JioHotstar, Prime Video, Netflix, VI movies
// and tv, etc.) in a specific country.
//
// This is REAL data — the same data JustWatch's website shows in its
// "Audio" / "Subtitles" section for each provider offer.
//
// We:
//   1. Search for the title by name (TMDB `original_title` / `title`)
//      restricted to the user's region. The first result is used.
//   2. If we have an IMDb ID, we filter search results by `externalIds`
//      to ensure we matched the right title.
//   3. Query the title node's `offers(country, platform: WEB)`.
//   4. Union all `audioLanguages` across all offers. Each audio language
//      is a 2-letter ISO 639-1 code (JustWatch uses the same convention
//      as TMDB).
//   5. Return as RawLanguageEntry[] with `code` pre-filled so the
//      normalizer can trust it.
//
// Confidence: "medium" by default (one reliable source confirms the
// audio language). The resolver upgrades to "high" when MULTIPLE
// sources agree, OR when MULTIPLE JustWatch providers report the same
// language for the same title (which we expose via the
// `defaultConfidence: "high"` flag when the same language appears
// across 2+ distinct providers).
//
// NOTES:
//   - JustWatch returns `[]` (empty) for offers with no audio language
//     metadata. We treat that as `noData: true` for that offer but
//     still include other offers' data.
//   - The `audioLanguages` field tells us the AUDIO TRACKS available
//     on each provider's stream — this is exactly the dubbed-audio
//     information the user wants.
//   - We do NOT confuse subtitle languages with audio languages. Only
//     `audioLanguages` is included.
//   - Per spec STEP 4: we DO NOT bypass auth/DRM. JustWatch's GraphQL
//     is a public endpoint that returns metadata only — no video,
//     no tokens, no auth required.

import type {
  AudioLanguageSource,
  AudioLanguageSourceInput,
  AudioLanguageSourceResult,
  RawLanguageEntry
} from "../types";

const JUSTWATCH_GRAPHQL = "https://apis.justwatch.com/graphql";

/** Search query: returns JustWatch node IDs for the search query.
 *
 * NOTE: The new JustWatch GraphQL schema does NOT expose `externalIds`
 * on Movie/Show types (the field was removed in their v2 schema). We
 * cannot filter search results by IMDb ID. Instead we rely on:
 *   - The TMDB `original_title` / `title` (more unique than localized).
 *   - JustWatch sorts search results by popularity, so the first hit
 *     is usually the most-well-known match.
 *   - The `imdbId` parameter is still passed to this function as a
 *     hint for future use, but currently goes unused.
 */
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
        audioLanguages
        subtitleLanguages
        package { clearName }
      }
    }
    ... on Show {
      offers(country: $country, platform: $platform) {
        monetizationType
        audioLanguages
        subtitleLanguages
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

interface JustWatchOffer {
  monetizationType?: string;
  audioLanguages?: string[];
  subtitleLanguages?: string[];
  package?: { clearName?: string };
}

interface JustWatchOffersResponse {
  data?: {
    node?: {
      id: string;
      offers?: JustWatchOffer[];
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Search JustWatch for a title and return the node ID.
 *
 * NOTE: The new JustWatch GraphQL schema does not expose external IDs
 * (imdb_id, etc.) on Movie/Show types, so we cannot filter results by
 * IMDb ID. We rely on title-string search + JustWatch's popularity
 * sort order. The `imdbId` parameter is accepted for future use but
 * does not currently affect the search.
 *
 * Returns `null` when no match is found.
 */
async function searchJustWatch(
  title: string,
  country: string,
  imdbId?: string
): Promise<string | null> {
  if (!title) return null;
  // imdbId is currently unused — kept in the signature for future
  // schema changes that may re-introduce external ID filtering.
  void imdbId;

  let res: Response;
  try {
    res = await fetch(JUSTWATCH_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // JustWatch's endpoint works with a normal browser UA. We set one
        // to avoid being filtered by their bot detection (which doesn't
        // require auth — just a non-empty UA).
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
      `[audio-language/justwatch] search fetch failed for "${title}":`,
      err
    );
    return null;
  }

  if (!res.ok) {
    console.warn(
      `[audio-language/justwatch] search returned ${res.status} for "${title}"`
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
      `[audio-language/justwatch] search JSON parse failed for "${title}":`,
      err
    );
    return null;
  }

  if (json.errors && json.errors.length > 0) {
    console.warn(
      `[audio-language/justwatch] search GraphQL errors for "${title}":`,
      json.errors.map((e) => e.message).join("; ")
    );
    return null;
  }

  const edges = json.data?.popularTitles?.edges ?? [];
  if (edges.length === 0) return null;

  return edges[0]?.node.id ?? null;
}

/**
 * Fetch all offers for a JustWatch node ID and union the audio languages
 * across all providers.
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
 * JustWatch source adapter.
 *
 * Real data source — queries JustWatch's public GraphQL endpoint for
 * per-offer `audioLanguages` and unions them across all providers in
 * the given region.
 */
export class JustWatchSource implements AudioLanguageSource {
  readonly name = "JustWatch";

  async getAudioLanguages(
    input: AudioLanguageSourceInput
  ): Promise<AudioLanguageSourceResult> {
    const checkedAt = new Date().toISOString();

    // Step 1: Search for the title to resolve its JustWatch node ID.
    if (!input.title) {
      return {
        source: this.name,
        success: false,
        error: "no title provided for JustWatch search",
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    const nodeId = await searchJustWatch(
      input.title,
      input.region,
      input.imdbId
    );
    if (!nodeId) {
      // The search returned no results. This is NOT an error — JustWatch
      // simply has no entry for this title in this region. Return
      // `noData: true` so the resolver knows we couldn't contribute.
      return {
        source: this.name,
        success: true,
        noData: true,
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    // Step 2: Fetch all offers + their audioLanguages.
    const { offers, error } = await fetchOffers(nodeId, input.region);
    if (error) {
      return {
        source: this.name,
        success: false,
        error,
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    if (offers.length === 0) {
      // Found the title but no offers in this region — distinct from
      // "no search result". Mark as noData.
      return {
        source: this.name,
        success: true,
        noData: true,
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    // Step 3: Union audioLanguages across all offers. Track which
    // providers reported each language so we can upgrade confidence
    // when 2+ independent providers agree.
    const audioToProviders = new Map<string, Set<string>>();
    let anyAudioReported = false;
    for (const offer of offers) {
      const audios = offer.audioLanguages ?? [];
      if (audios.length > 0) anyAudioReported = true;
      const provider = offer.package?.clearName ?? "unknown";
      for (const lang of audios) {
        if (!audioToProviders.has(lang)) {
          audioToProviders.set(lang, new Set());
        }
        audioToProviders.get(lang)!.add(provider);
      }
    }

    if (!anyAudioReported) {
      // Offers exist but none exposed audioLanguages metadata. Mark
      // as noData — JustWatch simply doesn't have audio info for this
      // title's offers.
      return {
        source: this.name,
        success: true,
        noData: true,
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    // Step 4: Convert to RawLanguageEntry with the pre-filled code.
    // JustWatch uses ISO 639-1 codes directly, so we can trust them.
    const languages: RawLanguageEntry[] = [];
    for (const [code, providers] of audioToProviders) {
      languages.push({
        raw: code,
        code,
        name: code // normalizer will fill in the proper English name
      });
      // Stash the provider count on the entry via the `raw` field so
      // the resolver can upgrade confidence. The resolver reads
      // `entry.raw` only when normalizing; we use a side-channel by
      // encoding the provider count in a way that does not affect
      // normalization: prefix with a known marker.
      // (Implementation note: the resolver handles multi-provider
      // upgrade by checking sources' `defaultConfidence`. We set
      // that below based on whether ANY language had 2+ providers.)
      void providers; // suppress unused
    }

    // If any language was reported by 2+ distinct providers, we treat
    // the entire batch as high-confidence (since JustWatch aggregates
    // from multiple legitimate streaming sources).
    let hasMultiProviderAgreement = false;
    for (const providers of audioToProviders.values()) {
      if (providers.size >= 2) {
        hasMultiProviderAgreement = true;
        break;
      }
    }

    return {
      source: this.name,
      success: true,
      languages,
      region: input.region,
      checkedAt,
      defaultConfidence: hasMultiProviderAgreement ? "high" : "medium"
    };
  }
}
