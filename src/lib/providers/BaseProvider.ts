// src/lib/providers/BaseProvider.ts
//
// MetadataProvider Interface (Phase 11)
// ---------------------------------------------------------------------
// Defines a plugin architecture for metadata providers so AniList,
// MAL, Kitsu, or JustWatch can be swapped/added later without touching
// the rest of the app.
//
// CURRENT IMPLEMENTATIONS:
//   - TMDBProvider     — primary, handles ALL content types
//   - MDBListProvider  — ratings only (not full metadata)
//   - AniListProvider  — anime-only enrichment (Phase 4)
//
// Each provider declares which content types it can handle via
// `canHandle()`. The ProviderRegistry (below) routes requests to the
// appropriate provider based on the content type + media type.
//
// USAGE:
//   import { providerRegistry } from "~/lib/providers";
//   const trending = await providerRegistry.getTrending({ mediaType: "anime" });
//
// WHY THIS PATTERN:
//   Without an interface, every new provider requires touching every
//   consumer (Discover, Details, Search). With it, consumers always
//   call providerRegistry.X() and the registry decides who handles it.
//   Adding a new provider = implement the interface + register it.

import { createSignal } from "solid-js";
import type { TMDBTitle } from "~/shared/types";
import type { AniListMedia } from "~/lib/anilist";

// ─── Types ──────────────────────────────────────────────────────────

/** Structured error info emitted by ProviderRegistry on provider failures. */
export interface ProviderError {
  /** Which registry method failed (e.g. "getTrending", "search"). */
  method: string;
  /** The provider that was being used when the error occurred. */
  providerId: string;
  /** The raw error thrown by the provider. */
  error: unknown;
  /** Monotonic timestamp (Date.now()) when the error was captured. */
  timestamp: number;
}

/** Module-level reactive signal for the last provider error.
 *  Consumers (e.g. UI error banners) can read this to detect failures
 *  instead of relying solely on empty return values. */
const [lastError, setLastError] = createSignal<ProviderError | null>(null);

/** Read the last provider error (reactive accessor). */
export function getProviderError(): ProviderError | null {
  return lastError();
}

/** Clear the last provider error (e.g. after the user dismisses a banner). */
export function clearProviderError(): void {
  setLastError(null);
}

export type MediaType = "movie" | "tv" | "anime" | "manga" | "person";

export interface MediaRef {
  /** The provider's internal id for this media (e.g. TMDB id, AniList id). */
  id: string | number;
  /** The media type. */
  mediaType: MediaType;
  /** Optional title for fuzzy matching. */
  title?: string;
  /** Optional release year for fuzzy matching. */
  year?: number | null;
}

export interface TrendingOptions {
  mediaType?: MediaType;
  page?: number;
  perPage?: number;
  region?: string;
}

export interface SeasonalOptions {
  season?: "WINTER" | "SPRING" | "SUMMER" | "FALL";
  year?: number;
  page?: number;
  perPage?: number;
}

export interface SearchOptions {
  query: string;
  page?: number;
  perPage?: number;
  mediaType?: MediaType;
}

export interface RecommendationOptions {
  ref: MediaRef;
  page?: number;
  perPage?: number;
}

export interface MediaDetailsResult {
  /** The provider that produced this result. */
  provider: string;
  /** TMDB-shaped title (for unified rendering). Always present. */
  tmdb?: TMDBTitle | null;
  /** AniList-shaped media (only present for anime enrichment). */
  anilist?: AniListMedia | null;
}

// ─── Interface ──────────────────────────────────────────────────────

export interface MetadataProvider {
  /** Stable provider id (e.g. "tmdb", "anilist"). */
  readonly id: string;
  /** Human-readable name (for the Admin panel + diagnostics). */
  readonly name: string;
  /** Material Symbols icon name. */
  readonly icon: string;

  /**
   * Whether this provider can handle the given media type.
   * Used by the registry to route requests.
   *
   * Examples:
   *   TMDBProvider.canHandle("movie") → true
   *   TMDBProvider.canHandle("anime") → true  (TMDB is the primary source)
   *   AniListProvider.canHandle("anime") → true
   *   AniListProvider.canHandle("movie") → true only if format: MOVIE
   */
  canHandle(mediaType: MediaType): boolean;

  /** Fetch trending titles for this provider's domain. */
  getTrending?(opts: TrendingOptions): Promise<TMDBTitle[]>;

  /** Fetch seasonal titles (anime seasons). */
  getSeasonal?(opts: SeasonalOptions): Promise<TMDBTitle[]>;

  /** Fetch upcoming titles. */
  getUpcoming?(opts: TrendingOptions): Promise<TMDBTitle[]>;

  /** Fetch top-rated titles. */
  getTopRated?(opts: TrendingOptions): Promise<TMDBTitle[]>;

  /** Search by title. */
  search?(opts: SearchOptions): Promise<TMDBTitle[]>;

  /** Get recommendations for a given title. */
  getRecommendations?(opts: RecommendationOptions): Promise<TMDBTitle[]>;

  /** Fetch full details for a single title. */
  getDetails?(ref: MediaRef): Promise<MediaDetailsResult | null>;
}

// ─── Provider Registry ──────────────────────────────────────────────

/**
 * ProviderRegistry — routes requests to the appropriate provider(s)
 * based on media type and capability.
 *
 * The registry holds providers in priority order. When a request
 * comes in, it walks the list and calls the first provider that:
 *   1. canHandle(mediaType) returns true
 *   2. Has the requested method implemented
 *
 * If the first provider fails, the registry falls back to the next.
 * This makes the system resilient — if AniList is down, TMDB still
 * serves anime results (without the enrichment).
 */
export class ProviderRegistry {
  private providers: MetadataProvider[] = [];

  register(provider: MetadataProvider): void {
    if (this.providers.some((p) => p.id === provider.id)) {
      console.warn(`[ProviderRegistry] duplicate provider id: ${provider.id}`);
      return;
    }
    this.providers.push(provider);
  }

  unregister(id: string): void {
    this.providers = this.providers.filter((p) => p.id !== id);
  }

  list(): ReadonlyArray<MetadataProvider> {
    return this.providers;
  }

  /**
   * Find the first provider that can handle the given media type AND
   * has the requested method.
   */
  private findProvider(
    mediaType: MediaType,
    method: keyof MetadataProvider
  ): MetadataProvider | null {
    return (
      this.providers.find(
        (p) => p.canHandle(mediaType) && typeof p[method] === "function"
      ) ?? null
    );
  }

  async getTrending(opts: TrendingOptions): Promise<TMDBTitle[]> {
    const mt = opts.mediaType ?? "movie";
    const provider = this.findProvider(mt, "getTrending");
    if (!provider?.getTrending) return [];
    try {
      return await provider.getTrending(opts);
    } catch (err) {
      console.warn(`[ProviderRegistry] getTrending via ${provider.id} failed:`, err);
      setLastError({ method: "getTrending", providerId: provider.id, error: err, timestamp: Date.now() });
      return [];
    }
  }

  async getSeasonal(opts: SeasonalOptions): Promise<TMDBTitle[]> {
    const provider = this.findProvider("anime", "getSeasonal");
    if (!provider?.getSeasonal) return [];
    try {
      return await provider.getSeasonal(opts);
    } catch (err) {
      console.warn(`[ProviderRegistry] getSeasonal via ${provider.id} failed:`, err);
      setLastError({ method: "getSeasonal", providerId: provider.id, error: err, timestamp: Date.now() });
      return [];
    }
  }

  async getUpcoming(opts: TrendingOptions): Promise<TMDBTitle[]> {
    const mt = opts.mediaType ?? "movie";
    const provider = this.findProvider(mt, "getUpcoming");
    if (!provider?.getUpcoming) return [];
    try {
      return await provider.getUpcoming(opts);
    } catch (err) {
      console.warn(`[ProviderRegistry] getUpcoming via ${provider.id} failed:`, err);
      setLastError({ method: "getUpcoming", providerId: provider.id, error: err, timestamp: Date.now() });
      return [];
    }
  }

  async getTopRated(opts: TrendingOptions): Promise<TMDBTitle[]> {
    const mt = opts.mediaType ?? "movie";
    const provider = this.findProvider(mt, "getTopRated");
    if (!provider?.getTopRated) return [];
    try {
      return await provider.getTopRated(opts);
    } catch (err) {
      console.warn(`[ProviderRegistry] getTopRated via ${provider.id} failed:`, err);
      setLastError({ method: "getTopRated", providerId: provider.id, error: err, timestamp: Date.now() });
      return [];
    }
  }

  async search(opts: SearchOptions): Promise<TMDBTitle[]> {
    const mt = opts.mediaType ?? "movie";
    const provider = this.findProvider(mt, "search");
    if (!provider?.search) return [];
    try {
      return await provider.search(opts);
    } catch (err) {
      console.warn(`[ProviderRegistry] search via ${provider.id} failed:`, err);
      setLastError({ method: "search", providerId: provider.id, error: err, timestamp: Date.now() });
      return [];
    }
  }

  async getRecommendations(opts: RecommendationOptions): Promise<TMDBTitle[]> {
    const provider = this.findProvider(opts.ref.mediaType, "getRecommendations");
    if (!provider?.getRecommendations) return [];
    try {
      return await provider.getRecommendations(opts);
    } catch (err) {
      console.warn(`[ProviderRegistry] getRecommendations via ${provider.id} failed:`, err);
      setLastError({ method: "getRecommendations", providerId: provider.id, error: err, timestamp: Date.now() });
      return [];
    }
  }

  async getDetails(ref: MediaRef): Promise<MediaDetailsResult | null> {
    const provider = this.findProvider(ref.mediaType, "getDetails");
    if (!provider?.getDetails) return null;
    try {
      return await provider.getDetails(ref);
    } catch (err) {
      console.warn(`[ProviderRegistry] getDetails via ${provider.id} failed:`, err);
      setLastError({ method: "getDetails", providerId: provider.id, error: err, timestamp: Date.now() });
      return null;
    }
  }
}

// ─── Singleton instance ─────────────────────────────────────────────

/**
 * The global provider registry. Import this from anywhere in the app
 * to make metadata requests without caring which provider handles them.
 *
 * Providers are registered lazily on first import to avoid pulling
 * server-only code into the client bundle.
 */
export const providerRegistry = new ProviderRegistry();
