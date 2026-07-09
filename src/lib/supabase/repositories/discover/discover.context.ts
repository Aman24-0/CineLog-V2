/**
 * CineLog V2 — Discover Repository: Aggregated Context
 * ---------------------------------------------------------------------
 * READ-ONLY aggregation queries that combine vault state, collection
 * memberships, and universe memberships into single round-trip-friendly
 * shapes for the discover UI.
 *
 * Split out from `discover.read.ts` and `discover.universes.ts` to
 * keep each file focused on one responsibility and under 250 lines.
 */

import type {
  CollectionMembership,
  DiscoverMetadata,
  DiscoverResult,
  TypedSupabaseClient,
  UserMediaContext,
  UserMediaIdentity
} from "./discover.types";
import { getCollectionMemberships, getVaultState } from "./discover.read";
import { getUniverseMembership } from "./discover.universes";

/**
 * Get the full discover metadata for a media item — vault state +
 * collection memberships + universe memberships — in one logical call.
 *
 * Internally runs three queries in parallel where possible:
 *   1. Vault state (resolves the vaultId needed for collection memberships).
 *   2. Universe membership (independent of vault — runs in parallel).
 *   3. Collection memberships (depends on vaultId from step 1).
 *
 * @returns A single {@link DiscoverMetadata} object. On any error,
 *          returns `{ data: null, error }`.
 */
export async function getDiscoverMetadata(
  supabase: TypedSupabaseClient,
  identity: UserMediaIdentity
): Promise<DiscoverResult<DiscoverMetadata>> {
  // 1. Vault state + universe membership run in parallel.
  const [vaultResult, universeResult] = await Promise.all([
    getVaultState(supabase, identity),
    getUniverseMembership(supabase, identity, identity.userId)
  ]);

  if (vaultResult.error) return { data: null, error: vaultResult.error };
  if (universeResult.error) return { data: null, error: universeResult.error };

  // 2. Collection memberships depend on the vaultId.
  let collections: CollectionMembership[] = [];
  if (vaultResult.data?.vault) {
    const colResult = await getCollectionMemberships(supabase, vaultResult.data.vault.id);
    if (colResult.error) return { data: null, error: colResult.error };
    collections = colResult.data;
  }

  return {
    data: {
      vault: vaultResult.data!,
      collections,
      universes: universeResult.data
    },
    error: null
  };
}

/**
 * Get the user-owned context for a media item — vault state +
 * collection memberships only (no curated-universe data). Lighter
 * weight than {@link getDiscoverMetadata} when the UI only needs to
 * know "is this in my library and how have I organised it?".
 *
 * @returns A single {@link UserMediaContext} object. On any error,
 *          returns `{ data: null, error }`.
 */
export async function getUserMediaContext(
  supabase: TypedSupabaseClient,
  identity: UserMediaIdentity
): Promise<DiscoverResult<UserMediaContext>> {
  // 1. Vault state.
  const vaultResult = await getVaultState(supabase, identity);
  if (vaultResult.error) return { data: null, error: vaultResult.error };

  // 2. Collection memberships (only if the media is in the vault).
  let collections: CollectionMembership[] = [];
  if (vaultResult.data?.vault) {
    const colResult = await getCollectionMemberships(supabase, vaultResult.data.vault.id);
    if (colResult.error) return { data: null, error: colResult.error };
    collections = colResult.data;
  }

  return {
    data: {
      vault: vaultResult.data!,
      collections
    },
    error: null
  };
}
