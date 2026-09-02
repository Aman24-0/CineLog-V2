// src/shared/types/justwatch.ts
//
// CineLog V2 — JustWatch OTT Migration — Shared Type Definitions
// ---------------------------------------------------------------------
// These types describe the shape of data returned by JustWatch's public
// GraphQL endpoint (https://apis.justwatch.com/graphql) as validated
// during Stage 3 capability inspection.
//
// Stage 3 findings these types encode:
//   - `Package.icon` returns a CDN URL template string of the form
//     `/icon/{numericId}/{profile}/{technicalName}.{format}`. The
//     consumer substitutes `{profile}` (s16|s32|s64|s100|s200) and
//     `{format}` (png|webp|jpg) and prefixes with
//     `https://images.justwatch.com`.
//   - `Offer.standardWebURL` and `Offer.deeplinkURL(platform: Platform!)`
//     both return real provider URLs (web browse + deep-link play).
//   - `Offer.monetizationType` is one of FLATRATE | RENT | BUY | FAST.
//   - `Movie.objectType` returns "MOVIE"; `Show.objectType` returns
//     "SHOW". Used as a discriminator when resolving search results.
//   - `audioLanguages` / `subtitleLanguages` are arrays of 2-letter
//     ISO 639-1 codes (may be empty when the provider reports no
//     language metadata for an offer).
//
// These types are intentionally permissive (`string | null` for fields
// JustWatch may omit) so the client can pass through real-world
// responses without throwing on minor schema drift.

export type JustWatchMonetizationType = "FLATRATE" | "RENT" | "BUY" | "FAST" | "CINEMA";

export type JustWatchPackage = {
  id: string;
  clearName: string;
  shortName: string;
  technicalName: string;
  icon: string;
};

export type JustWatchOffer = {
  monetizationType: JustWatchMonetizationType;
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

export type JustWatchTitleOffers = {
  nodeId: string;
  objectType?: "MOVIE" | "SHOW" | string | null;
  offers: JustWatchOffer[];
};

export type JustWatchSearchResult = {
  nodeId: string;
  objectType?: "MOVIE" | "SHOW" | string | null;
  /** Release year from JustWatch (for candidate ranking). */
  releaseYear?: number | null;
};

export type JustWatchProviderCatalog = {
  country: string;
  providers: JustWatchPackage[];
};
