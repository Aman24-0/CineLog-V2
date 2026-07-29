/**
 * CineLog V2 — Discover Repository: Vault + Collection Reads
 * ---------------------------------------------------------------------
 * READ-ONLY queries that determine a media item's relationship to the
 * user's vault and collections. Universe-membership queries live in
 * `./discover.universes.ts`; aggregated metadata lives in
 * `./discover.context.ts`.
 *
 * RLS compliance (Database Bible §90)
 * -----------------------------------
 *   • `vault` RLS: user_id = auth.uid(). Every query filters by
 *     user_id client-side (defense in depth).
 *   • `collections` RLS: USER = owner, CURATED = readable by all.
 *   • `collection_entries` RLS: owner through collection ownership.
 *   • Never uses the service role key.
 *
 * Soft-delete handling
 * --------------------
 *   • Vault lookups exclude soft-deleted rows (`deleted_at IS NULL`)
 *     so a trashed vault item is treated as "not in vault" for
 *     discover purposes (Database Bible §03 partial index).
 *   • Collections exclude soft-deleted rows (Bible §04).
 */

import type {
  CollectionEntryRow,
  CollectionMembership,
  CollectionRow,
  DiscoverBooleanResult,
  DiscoverListResult,
  DiscoverResult,
  TypedSupabaseClient,
  UserMediaIdentity,
  VaultRow,
  VaultState
} from "./discover.types";
import {
  COLLECTION_DISCOVER_COLUMNS,
  ENTRY_DISCOVER_COLUMNS,
  toError,
  VAULT_DISCOVER_COLUMNS
} from "./discover.utils";

// ---------------------------------------------------------------------------
// Table name constants
// ---------------------------------------------------------------------------

const VAULT_TABLE = "vault" as const;
const COLLECTIONS_TABLE = "collections" as const;
const ENTRIES_TABLE = "collection_entries" as const;

// ===========================================================================
// Vault membership
// ===========================================================================

/**
 * Check whether a media item is in the user's vault. Excludes
 * soft-deleted rows.
 *
 * Uses `.select("id").limit(1).maybeSingle()` — cheaper than fetching
 * the full row when the caller only needs a boolean.
 */
export async function isInVault(
  supabase: TypedSupabaseClient,
  identity: UserMediaIdentity
): Promise<DiscoverBooleanResult> {
  const { data, error } = await supabase
    .from(VAULT_TABLE)
    .select("id")
    .eq("user_id", identity.userId)
    .eq("tmdb_id", identity.tmdbId)
    .eq("media_type", identity.mediaType)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  return { value: data !== null, error: toError(error) };
}

/**
 * Get the full vault state for a media item — the vault row (or null
 * if not saved) plus a convenience `inVault` flag.
 *
 * Excludes soft-deleted rows.
 */
export async function getVaultState(
  supabase: TypedSupabaseClient,
  identity: UserMediaIdentity
): Promise<DiscoverResult<VaultState>> {
  const { data, error } = await supabase
    .from(VAULT_TABLE)
    .select(VAULT_DISCOVER_COLUMNS)
    .eq("user_id", identity.userId)
    .eq("tmdb_id", identity.tmdbId)
    .eq("media_type", identity.mediaType)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { data: null, error: toError(error) };
  const vault = data as VaultRow | null;
  return { data: { vault, inVault: vault !== null }, error: null };
}

// ===========================================================================
// Collection membership
// ===========================================================================

/**
 * Get all collections that contain a given vault item, paired with
 * the entry row (which carries the `position`).
 *
 * The caller must supply the `vaultId` (the vault row's UUID, NOT the
 * TMDB id). Use {@link getVaultState} first to resolve the vaultId
 * from a TMDB identity, or use the higher-level
 * `getUserMediaContext` / `getDiscoverMetadata` which do this
 * automatically.
 *
 * Excludes soft-deleted collections. Returns an empty array if the
 * vault item is in no collections.
 */
export async function getCollectionMemberships(
  supabase: TypedSupabaseClient,
  vaultId: string
): Promise<DiscoverListResult<CollectionMembership>> {
  // Join collection_entries → collections to get both rows in one
  // query. PostgREST returns nested objects when the FK is detected.
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .select(`${ENTRY_DISCOVER_COLUMNS}, collection:${COLLECTIONS_TABLE}!collection_entries_collection_fk (${COLLECTION_DISCOVER_COLUMNS})`)
    .eq("vault_id", vaultId)
    .order("position", { ascending: true });

  if (error) return { data: [], error: toError(error) };
  if (!data || data.length === 0) return { data: [], error: null };

  // Flatten the nested join into the CollectionMembership shape.
  // The `collection` field is the joined collections row; we filter
  // out any entries whose collection is soft-deleted.
  const memberships: CollectionMembership[] = [];
  for (const row of data) {
    const entry = row as CollectionEntryRow & {
      collection: CollectionRow | null;
    };
    if (!entry.collection) continue;
    // Exclude soft-deleted collections (Bible §04).
    if ("deleted_at" in entry.collection && entry.collection.deleted_at !== null) continue;
    memberships.push({
      collection: entry.collection,
      // Cast through unknown — the row's shape comes from a join
      // query that may not include every column on CollectionEntryRow
      // (e.g. order_index, which was added in a later migration).
      // The fields we actually consume downstream are present.
      entry: row as unknown as CollectionEntryRow
    });
  }

  return { data: memberships, error: null };
}

/**
 * Check whether a vault item is in a specific collection. Uses the
 * UNIQUE(collection_id, vault_id) constraint (Database Bible §05) —
 * at most one row can match.
 */
export async function isInCollection(
  supabase: TypedSupabaseClient,
  collectionId: string,
  vaultId: string
): Promise<DiscoverBooleanResult> {
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .select("id")
    .eq("collection_id", collectionId)
    .eq("vault_id", vaultId)
    .limit(1)
    .maybeSingle();

  return { value: data !== null, error: toError(error) };
}

/**
 * Get collections related to a media item — i.e. collections that
 * contain the user's vault entry for this TMDB title. This is the
 * discover-friendly alias of {@link getCollectionMemberships} that
 * accepts a TMDB identity and resolves the vaultId internally.
 *
 * If the media is not in the user's vault, returns an empty list
 * (no memberships possible).
 */
export async function getRelatedCollections(
  supabase: TypedSupabaseClient,
  identity: UserMediaIdentity
): Promise<DiscoverListResult<CollectionMembership>> {
  const vaultState = await getVaultState(supabase, identity);
  if (vaultState.error) return { data: [], error: vaultState.error };
  if (!vaultState.data?.vault) return { data: [], error: null };

  return getCollectionMemberships(supabase, vaultState.data.vault.id);
}
