/**
 * CineLog V2 — Supabase Discover Hook
 * ---------------------------------------------------------------------
 * Wraps {@link DiscoverRepository} (read-only) into a Solid-friendly
 * hook. Answers "what is this media's relationship to the user's
 * library?".
 *
 * No business logic. No UI logic. No Firebase interaction. No TMDB
 * requests. Thin reactive adapter over the repository.
 */

import { getDiscoverRepository } from "../repositories";
import type {
  CollectionMembership,
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
} from "../repositories";
import { createAsyncState } from "./_shared";

/**
 * Result type for subscribed-universes (subscription + universe pair).
 */
type SubscribedUniverse = { subscription: UserUniverseSubscriptionRow; universe: CuratedUniverseRow };

/**
 * The return type of {@link useDiscover}.
 */
export interface UseDiscoverReturn {
  readonly loading: () => boolean;
  readonly error: () => Error | null;
  readonly clearError: () => void;

  // ---- Vault membership ----
  readonly isInVault: (identity: UserMediaIdentity) => Promise<DiscoverBooleanResult>;
  readonly getVaultState: (identity: UserMediaIdentity) => Promise<DiscoverResult<VaultState>>;

  // ---- Collection membership ----
  readonly getCollectionMemberships: (vaultId: string) => Promise<DiscoverListResult<CollectionMembership>>;
  readonly isInCollection: (collectionId: string, vaultId: string) => Promise<DiscoverBooleanResult>;
  readonly getRelatedCollections: (identity: UserMediaIdentity) => Promise<DiscoverListResult<CollectionMembership>>;

  // ---- Universe membership ----
  readonly getUniverseMembership: (
    identity: MediaIdentity,
    userId?: string
  ) => Promise<DiscoverListResult<UniverseMembership>>;
  readonly getRelatedUniverses: (identity: MediaIdentity) => Promise<DiscoverListResult<CuratedUniverseRow>>;
  readonly getSubscribedUniverses: (userId: string) => Promise<DiscoverListResult<SubscribedUniverse>>;

  // ---- Aggregated context ----
  readonly getDiscoverMetadata: (identity: UserMediaIdentity) => Promise<DiscoverResult<DiscoverMetadata>>;
  readonly getUserMediaContext: (identity: UserMediaIdentity) => Promise<DiscoverResult<UserMediaContext>>;
}

/**
 * useDiscover — reactive adapter over {@link DiscoverRepository}.
 *
 * The underlying repository is READ-ONLY, so this hook exposes no
 * write operations.
 */
export function useDiscover(): UseDiscoverReturn {
  const { loading, error, run, clearError } = createAsyncState();
  const repo = () => getDiscoverRepository();

  return {
    loading,
    error,
    clearError,

    // ---- Vault membership ----
    isInVault: (identity) => run(() => repo().isInVault(identity)),
    getVaultState: (identity) => run(() => repo().getVaultState(identity)),

    // ---- Collection membership ----
    getCollectionMemberships: (vaultId) => run(() => repo().getCollectionMemberships(vaultId)),
    isInCollection: (collectionId, vaultId) => run(() => repo().isInCollection(collectionId, vaultId)),
    getRelatedCollections: (identity) => run(() => repo().getRelatedCollections(identity)),

    // ---- Universe membership ----
    getUniverseMembership: (identity, userId) => run(() => repo().getUniverseMembership(identity, userId)),
    getRelatedUniverses: (identity) => run(() => repo().getRelatedUniverses(identity)),
    getSubscribedUniverses: (userId) => run(() => repo().getSubscribedUniverses(userId)),

    // ---- Aggregated context ----
    getDiscoverMetadata: (identity) => run(() => repo().getDiscoverMetadata(identity)),
    getUserMediaContext: (identity) => run(() => repo().getUserMediaContext(identity))
  };
}
