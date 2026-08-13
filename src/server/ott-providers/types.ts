// src/server/ott-providers/types.ts
//
// CineLog V2 — OTT Provider Availability Types
// ---------------------------------------------------------------------
// Types for the JustWatch-based provider availability pipeline.

export type TitleType = "movie" | "tv";

export interface JustWatchOffer {
  monetizationType?: string;
  package?: { clearName?: string };
}

export interface JustWatchOffersResponse {
  data?: {
    node?: {
      id: string;
      offers?: JustWatchOffer[];
    };
  };
  errors?: Array<{ message: string }>;
}

export interface ProviderAvailabilityEntry {
  /** Provider name from JustWatch `package.clearName`. */
  providerName: string;
  /** monetizationType from JustWatch (e.g. "flatrate", "rent", "buy", "free", "ads"). */
  monetizationType: string;
}

export interface ProviderAvailabilityResult {
  tmdbId: number;
  type: TitleType;
  region: string;
  providers: ProviderAvailabilityEntry[];
  checkedAt: string;
  /** JustWatch node ID for this title (for cache invalidation / debugging). */
  justWatchNodeId?: string;
  /** True if JustWatch explicitly confirmed no providers exist. */
  noData?: boolean;
}

export interface GetProviderAvailabilityOptions {
  tmdbId: number;
  type: TitleType;
  region?: string;
  /** Pre-resolved title string (skips the JustWatch title search if provided). */
  title?: string;
  /** Pre-resolved JustWatch node ID (skips the search if provided). */
  nodeId?: string;
  /** Pre-resolved release year (used for JustWatch title matching). */
  year?: number;
  /** If true, force a fresh fetch even if cache is fresh. */
  forceRefresh?: boolean;
  /**
   * If true and cache is stale, return stale data immediately and trigger
   * a non-blocking background refresh. If false (default), run the worker
   * synchronously on stale cache (wait for fresh data before returning).
   */
  backgroundRefreshIfStale?: boolean;
}

export interface GetProviderAvailabilityResponse {
  result: ProviderAvailabilityResult;
  fromCache: boolean;
  stale: boolean;
}

/**
 * Error result returned by fetchProvidersFromJustWatch when the JustWatch
 * API fails. This is NOT a "no data" result — it means the lookup failed
 * and should NOT be cached as an empty provider list.
 */
export interface ProviderFetchError {
  error: string;
  noData?: false;
  justWatchNodeId?: string;
}

/**
 * Success result returned by fetchProvidersFromJustWatch when the lookup
 * completed successfully (even if no providers were found).
 */
export interface ProviderFetchSuccess {
  providers: ProviderAvailabilityEntry[];
  justWatchNodeId?: string;
  noData: boolean;
}

export type ProviderFetchResult = ProviderFetchSuccess | ProviderFetchError;

/** Type guard: is this a successful (non-error) fetch result? */
export function isFetchSuccess(
  result: ProviderFetchResult
): result is ProviderFetchSuccess {
  return !("error" in result);
}

/**
 * A single JustWatch search result with metadata for title matching.
 */
export interface JustWatchSearchResult {
  nodeId: string;
  title: string;
  originalTitle: string | null;
  year: number | null;
  type: TitleType;
}

/**
 * Raw GraphQL node shape returned by JustWatch's popularTitles search.
 */
export interface JustWatchSearchNode {
  id: string;
  title?: string;
  originalTitle?: string | null;
  releaseYear?: number | null;
  objectType?: string;
}
