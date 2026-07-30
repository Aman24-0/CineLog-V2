/**
 * CineLog V2 — Discover Repository
 * ---------------------------------------------------------------------
 * READ-ONLY layer that answers "what is this media's relationship to
 * the user's library?". Composes the functions in `discover.read.ts`,
 * `discover.universes.ts`, and `discover.context.ts` into a single
 * class with a clean public API. This is the only file callers should
 * import directly (via the barrel at `repositories/discover/index.ts`).
 *
 * ⚠️  This repository contains NO write operations. It exists solely
 *     to read a media item's relationship to the user's vault,
 *     collections, and curated-universe subscriptions. All mutations
 *     go through the Vault / Collection repositories.
 *
 * No TMDB requests. No recommendation engine. No external API
 * integration. Pure database reads against the CineLog schema.
 *
 * Pattern (Supabase Integration Guide §05):
 *
 *     Component → DiscoverRepository → Supabase → Database (read-only)
 *
 * Phase scope
 * -----------
 * Foundation only. NOT wired into the application — the existing
 * Firebase-backed `useDiscoverTaste.ts`, `useSpotlight.ts`, etc.
 * remain the sole source of discover truth until the migration
 * explicitly cuts over (Integration Guide §07, Phase 4–5).
 */

import { getClient } from "../../client";
import type { TypedSupabaseClient } from "./discover.types";
import {
  getCollectionMemberships,
  isInCollection,
  isInVault,
  getRelatedCollections,
  getVaultState
} from "./discover.read";
import {
  getAllCuratedUniverses,
  getCuratedUniverseBySlug,
  getCuratedUniverseById,
  getCuratedUniverseEntries,
  getRelatedUniverses,
  getSubscribedUniverses,
  getUniverseMembership
} from "./discover.universes";
import { getDiscoverMetadata, getUserMediaContext } from "./discover.context";
import type {
  CollectionMembership,
  CuratedUniverseEntryRow,
  CuratedUniverseRow,
  DiscoverBooleanResult,
  DiscoverListResult,
  DiscoverMetadata,
  DiscoverResult,
  MediaIdentity,
  UniverseMembership,
  UserMediaContext,
  UserMediaIdentity,
  UserUniverseSubscriptionRow,
  VaultState
} from "./discover.types";

// ---------------------------------------------------------------------------
// DiscoverRepository
// ---------------------------------------------------------------------------

export class DiscoverRepository {
  private readonly supabase: TypedSupabaseClient;

  /**
   * @param client  Optional Supabase client. Defaults to the
   *                environment-aware `getClient()` (browser singleton
   *                or SSR per-request client). Pass an explicit client
   *                for tests or per-request isolation.
   */
  constructor(client: TypedSupabaseClient = getClient()) {
    this.supabase = client;
  }

  // ---- Vault membership ------------------------------------------------

  /** Check if a media item is in the user's vault (excludes soft-deleted). */
  isInVault(identity: UserMediaIdentity): Promise<DiscoverBooleanResult> {
    return isInVault(this.supabase, identity);
  }

  /** Get the vault state for a media item (row + inVault flag). */
  getVaultState(
    identity: UserMediaIdentity
  ): Promise<DiscoverResult<VaultState>> {
    return getVaultState(this.supabase, identity);
  }

  // ---- Collection membership -------------------------------------------

  /** Get all collections containing a vault item (paired with entry rows). */
  getCollectionMemberships(
    vaultId: string
  ): Promise<DiscoverListResult<CollectionMembership>> {
    return getCollectionMemberships(this.supabase, vaultId);
  }

  /** Check if a vault item is in a specific collection. */
  isInCollection(
    collectionId: string,
    vaultId: string
  ): Promise<DiscoverBooleanResult> {
    return isInCollection(this.supabase, collectionId, vaultId);
  }

  /** Get collections related to a media item (resolves vaultId internally). */
  getRelatedCollections(
    identity: UserMediaIdentity
  ): Promise<DiscoverListResult<CollectionMembership>> {
    return getRelatedCollections(this.supabase, identity);
  }

  // ---- Universe membership ---------------------------------------------

  /** Get universe memberships for a media item (entry + universe + subscription). */
  getUniverseMembership(
    identity: MediaIdentity,
    userId?: string
  ): Promise<DiscoverListResult<UniverseMembership>> {
    return getUniverseMembership(this.supabase, identity, userId);
  }

  /** Get curated universes related to a media item (universe rows only). */
  getRelatedUniverses(
    identity: MediaIdentity
  ): Promise<DiscoverListResult<CuratedUniverseRow>> {
    return getRelatedUniverses(this.supabase, identity);
  }

  /** Get all universes the user has subscribed to (subscription + universe pairs). */
  getSubscribedUniverses(
    userId: string
  ): Promise<
    DiscoverListResult<{
      subscription: UserUniverseSubscriptionRow;
      universe: CuratedUniverseRow;
    }>
  > {
    return getSubscribedUniverses(this.supabase, userId);
  }

  /** Get ALL curated universes — the complete developer-managed catalog (Add Universe dialog). */
  getAllCuratedUniverses(): Promise<DiscoverListResult<CuratedUniverseRow>> {
    return getAllCuratedUniverses(this.supabase);
  }

  /** Get a single curated universe by its slug (URL-safe identifier). */
  getCuratedUniverseBySlug(
    slug: string
  ): Promise<DiscoverResult<CuratedUniverseRow>> {
    return getCuratedUniverseBySlug(this.supabase, slug);
  }

  /** Get a single curated universe by its primary key (UUID). */
  getCuratedUniverseById(
    id: string
  ): Promise<DiscoverResult<CuratedUniverseRow>> {
    return getCuratedUniverseById(this.supabase, id);
  }

  /** Get all entries for a curated universe, ordered by position ascending. */
  getCuratedUniverseEntries(
    universeId: string
  ): Promise<DiscoverListResult<CuratedUniverseEntryRow>> {
    return getCuratedUniverseEntries(this.supabase, universeId);
  }

  // ---- Aggregated context ----------------------------------------------

  /** Full discover metadata: vault + collections + universes in one call. */
  getDiscoverMetadata(
    identity: UserMediaIdentity
  ): Promise<DiscoverResult<DiscoverMetadata>> {
    return getDiscoverMetadata(this.supabase, identity);
  }

  /** User-owned context: vault + collections only (lighter weight). */
  getUserMediaContext(
    identity: UserMediaIdentity
  ): Promise<DiscoverResult<UserMediaContext>> {
    return getUserMediaContext(this.supabase, identity);
  }
}

// ---------------------------------------------------------------------------
// Default singleton — browser caches; SSR is always fresh
// ---------------------------------------------------------------------------

let _defaultInstance: DiscoverRepository | null = null;

/**
 * Get the default DiscoverRepository instance.
 *
 * Browser: lazily-initialised singleton sharing the singleton browser
 * client. SSR: fresh instance per call (auth state isolation).
 */
export function getDiscoverRepository(): DiscoverRepository {
  if (typeof window === "undefined") {
    return new DiscoverRepository();
  }
  if (!_defaultInstance) {
    _defaultInstance = new DiscoverRepository();
  }
  return _defaultInstance;
}
