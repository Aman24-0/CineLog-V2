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
}

export interface GetProviderAvailabilityOptions {
  tmdbId: number;
  type: TitleType;
  region?: string;
  /** Pre-resolved title string (skips the JustWatch title search if provided). */
  title?: string;
  /** Pre-resolved JustWatch node ID (skips the search if provided). */
  nodeId?: string;
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
