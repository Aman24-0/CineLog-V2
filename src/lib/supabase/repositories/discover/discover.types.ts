/**
 * CineLog V2 — Discover Repository: Shared Types
 * ---------------------------------------------------------------------
 * Type definitions shared across the discover repository modules.
 * The DiscoverRepository is a READ-ONLY layer that answers
 * "what is this media's relationship to the user's library?" — it
 * never writes, so these types describe only query inputs and result
 * shapes.
 *
 * Every type here is derived from the official CLI-generated
 * `database.types.ts` — no hand-rolled shapes, no `any`.
 */

import type { Enums, Tables } from "../../database.types";

// ---------------------------------------------------------------------------
// Row aliases — the tables the discover layer reads from
// ---------------------------------------------------------------------------

export type VaultRow = Tables<"vault">;
export type CollectionRow = Tables<"collections">;
export type CollectionEntryRow = Tables<"collection_entries">;
export type CuratedUniverseRow = Tables<"curated_universes">;
export type CuratedUniverseEntryRow = Tables<"curated_universe_entries">;
export type UserUniverseSubscriptionRow = Tables<"user_universe_subscriptions">;

// ---------------------------------------------------------------------------
// Enum aliases
// ---------------------------------------------------------------------------

/** `"movie" | "tv"` — mirrors the `media_type` enum. */
export type MediaType = Enums<"media_type">;

// ---------------------------------------------------------------------------
// Media identity — the composite key for TMDB-sourced media
// ---------------------------------------------------------------------------

/**
 * The composite identity of a TMDB media item. TMDB IDs are only
 * unique within their `media_type` namespace (Database Bible §03),
 * so `mediaType` is required to disambiguate movie/1398 from tv/1398.
 */
export interface MediaIdentity {
  readonly tmdbId: number;
  readonly mediaType: MediaType;
}

/**
 * A media identity scoped to a specific user. Used by vault and
 * collection-membership queries.
 */
export interface UserMediaIdentity extends MediaIdentity {
  readonly userId: string;
}

// ---------------------------------------------------------------------------
// Result shapes — rich, aggregated discover metadata
// ---------------------------------------------------------------------------

/**
 * The vault state for a media item — `null` when the media is not in
 * the user's vault. Mirrors the VaultRepository's `getVaultByTmdbId`
 * but wrapped in a discover-friendly shape.
 */
export interface VaultState {
  /** The vault row, or null if the media is not in the user's vault. */
  readonly vault: VaultRow | null;
  /** Convenience flag — true when `vault` is non-null. */
  readonly inVault: boolean;
}

/**
 * A collection that contains a given vault item. Returned by
 * `getCollectionMemberships` and `getRelatedCollections`.
 */
export interface CollectionMembership {
  readonly collection: CollectionRow;
  readonly entry: CollectionEntryRow;
}

/**
 * A curated universe that contains a given media item, paired with
 * the user's subscription state (null if not subscribed).
 */
export interface UniverseMembership {
  readonly universe: CuratedUniverseRow;
  readonly entry: CuratedUniverseEntryRow;
  /** The user's subscription row, or null if not subscribed. */
  readonly subscription: UserUniverseSubscriptionRow | null;
  /** Convenience flag — true when `subscription` is non-null. */
  readonly isSubscribed: boolean;
}

/**
 * The full discover metadata for a media item — everything the UI
 * needs to render a title's relationship to the user's library in
 * one round-trip-friendly shape.
 *
 * Combines:
 *   • vault state (is it saved? what status? what rating?)
 *   • collection memberships (which folders contain it?)
 *   • universe memberships (which curated universes contain it + is
 *     the user subscribed?)
 */
export interface DiscoverMetadata {
  readonly vault: VaultState;
  readonly collections: CollectionMembership[];
  readonly universes: UniverseMembership[];
}

/**
 * The user-owned context for a media item — a lighter-weight version
 * of {@link DiscoverMetadata} that excludes curated-universe data.
 * Useful when the UI only needs to know "is this in my library and
 * how have I organised it?".
 */
export interface UserMediaContext {
  readonly vault: VaultState;
  readonly collections: CollectionMembership[];
}

// ---------------------------------------------------------------------------
// Result types — uniform `{ data, error }` shape across all methods
// ---------------------------------------------------------------------------

/**
 * Result of a single-row or scalar read. `data` is `null` on error.
 */
export interface DiscoverResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
}

/**
 * Result of a list read. `data` is always an array (empty on error or
 * when no rows match).
 */
export interface DiscoverListResult<T> {
  readonly data: T[];
  readonly error: Error | null;
}

/**
 * Result of a boolean check (e.g. `isInVault`, `isInCollection`).
 */
export interface DiscoverBooleanResult {
  readonly value: boolean;
  readonly error: Error | null;
}

// ---------------------------------------------------------------------------
// Internal: typed Supabase client used by all repository modules
// ---------------------------------------------------------------------------

/**
 * The Supabase client generic over the CineLog `Database` schema.
 */
export type TypedSupabaseClient = import("@supabase/supabase-js").SupabaseClient<import("../../database.types").Database>;
