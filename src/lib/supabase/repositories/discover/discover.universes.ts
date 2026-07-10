/**
 * CineLog V2 — Discover Repository: Curated Universe Reads
 * ---------------------------------------------------------------------
 * READ-ONLY queries that determine a media item's relationship to
 * curated universes and the user's universe subscriptions
 * (Database Bible §07 + §08 + §09).
 *
 * Vault + collection membership queries live in `./discover.read.ts`;
 * aggregated metadata lives in `./discover.context.ts`.
 *
 * RLS compliance (Database Bible §90)
 * -----------------------------------
 *   • `curated_universes` / `curated_universe_entries`: readable by
 *     all authenticated users; write = admins only. The discover
 *     layer only reads.
 *   • `user_universe_subscriptions`: owner only (user_id = auth.uid()).
 *     Every query filters by user_id client-side (defense in depth).
 *   • Never uses the service role key.
 */

import type {
  CuratedUniverseEntryRow,
  CuratedUniverseRow,
  DiscoverListResult,
  MediaIdentity,
  TypedSupabaseClient,
  UniverseMembership,
  UserUniverseSubscriptionRow
} from "./discover.types";
import {
  SUBSCRIPTION_DISCOVER_COLUMNS,
  toError,
  UNIVERSE_DISCOVER_COLUMNS,
  UNIVERSE_ENTRY_DISCOVER_COLUMNS
} from "./discover.utils";

// ---------------------------------------------------------------------------
// Table name constants
// ---------------------------------------------------------------------------

const UNIVERSES_TABLE = "curated_universes" as const;
const UNIVERSE_ENTRIES_TABLE = "curated_universe_entries" as const;
const SUBSCRIPTIONS_TABLE = "user_universe_subscriptions" as const;

// ===========================================================================
// Universe membership — which universes contain a given media item?
// ===========================================================================

/**
 * Get all curated-universe entries for a given media item (by TMDB id
 * + media_type). These are developer-managed entries (Database Bible
 * §08) — the user cannot edit them.
 *
 * @returns A list of {@link CuratedUniverseEntryRow}, ordered by
 *          `position` ascending. Empty if the media is in no universe.
 */
export async function getUniverseEntriesForMedia(
  supabase: TypedSupabaseClient,
  identity: MediaIdentity
): Promise<DiscoverListResult<CuratedUniverseEntryRow>> {
  const { data, error } = await supabase
    .from(UNIVERSE_ENTRIES_TABLE)
    .select(UNIVERSE_ENTRY_DISCOVER_COLUMNS)
    .eq("tmdb_id", identity.tmdbId)
    .eq("media_type", identity.mediaType)
    .order("position", { ascending: true });

  return { data: (data ?? []) as CuratedUniverseEntryRow[], error: toError(error) };
}

/**
 * Get the full universe membership for a media item — each
 * curated-universe entry paired with its parent universe row AND the
 * user's subscription state (null if not subscribed).
 *
 * Uses a join `curated_universe_entries → curated_universes` to fetch
 * both rows in one query, then a separate batched lookup for the
 * user's subscriptions to those universes.
 *
 * @returns A list of {@link UniverseMembership}, ordered by the
 *          universe entry's `position`. Empty if the media is in no
 *          universe.
 */
export async function getUniverseMembership(
  supabase: TypedSupabaseClient,
  identity: MediaIdentity,
  userId?: string
): Promise<DiscoverListResult<UniverseMembership>> {
  // 1. Join entries → universes.
  const { data: entries, error } = await supabase
    .from(UNIVERSE_ENTRIES_TABLE)
    .select(`${UNIVERSE_ENTRY_DISCOVER_COLUMNS}, universe:${UNIVERSES_TABLE}!curated_universe_entries_universe_fk (${UNIVERSE_DISCOVER_COLUMNS})`)
    .eq("tmdb_id", identity.tmdbId)
    .eq("media_type", identity.mediaType)
    .order("position", { ascending: true });

  if (error) return { data: [], error: toError(error) };
  if (!entries || entries.length === 0) return { data: [], error: null };

  // 2. If no userId, return memberships with null subscriptions.
  const typedEntries = entries as (CuratedUniverseEntryRow & {
    universe: CuratedUniverseRow | null;
  })[];

  if (!userId) {
    return {
      data: typedEntries
        .filter((e) => e.universe !== null)
        .map((e) => ({
          universe: e.universe as CuratedUniverseRow,
          entry: e as CuratedUniverseEntryRow,
          subscription: null,
          isSubscribed: false
        })),
      error: null
    };
  }

  // 3. Batch-fetch the user's subscriptions to these universes.
  const universeIds = typedEntries
    .map((e) => e.universe?.id)
    .filter((id): id is string => id !== undefined && id !== null);

  let subscriptions: UserUniverseSubscriptionRow[] = [];
  if (universeIds.length > 0) {
    const subResult = await getSubscriptionsForUniverses(supabase, userId, universeIds);
    if (subResult.error) return { data: [], error: subResult.error };
    subscriptions = subResult.data;
  }
  const subByUniverseId = new Map(subscriptions.map((s) => [s.universe_id, s]));

  // 4. Assemble the memberships.
  return {
    data: typedEntries
      .filter((e) => e.universe !== null)
      .map((e) => {
        const subscription = subByUniverseId.get(e.universe!.id) ?? null;
        return {
          universe: e.universe as CuratedUniverseRow,
          entry: e as CuratedUniverseEntryRow,
          subscription,
          isSubscribed: subscription !== null
        };
      }),
    error: null
  };
}

/**
 * Get the curated universes related to a media item — the
 * discover-friendly alias that returns just the universe rows (no
 * subscription state). Internally calls {@link getUniverseMembership}
 * and projects out the `universe` field.
 */
export async function getRelatedUniverses(
  supabase: TypedSupabaseClient,
  identity: MediaIdentity
): Promise<DiscoverListResult<CuratedUniverseRow>> {
  const memberships = await getUniverseMembership(supabase, identity);
  if (memberships.error) return { data: [], error: memberships.error };
  return { data: memberships.data.map((m) => m.universe), error: null };
}

// ===========================================================================
// User subscriptions — which universes has the user subscribed to?
// ===========================================================================

/**
 * Get all universes the user has subscribed to, ordered by
 * `created_at` desc (most recent subscription first).
 *
 * Joins `user_universe_subscriptions → curated_universes` so the
 * caller gets both the subscription row (with custom_cover, is_pinned,
 * etc.) and the universe row (with name, slug, cover_url, etc.) in
 * one query.
 *
 * @returns A list of subscription + universe pairs. Empty if the user
 *          has subscribed to no universes.
 */
export async function getSubscribedUniverses(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<DiscoverListResult<{ subscription: UserUniverseSubscriptionRow; universe: CuratedUniverseRow }>> {
  const { data, error } = await supabase
    .from(SUBSCRIPTIONS_TABLE)
    .select(`${SUBSCRIPTION_DISCOVER_COLUMNS}, universe:${UNIVERSES_TABLE}!user_universe_subscriptions_universe_fk (${UNIVERSE_DISCOVER_COLUMNS})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: toError(error) };
  if (!data) return { data: [], error: null };

  const typed = data as (UserUniverseSubscriptionRow & {
    universe: CuratedUniverseRow | null;
  })[];

  return {
    data: typed
      .filter((row) => row.universe !== null)
      .map((row) => ({
        subscription: row as UserUniverseSubscriptionRow,
        universe: row.universe as CuratedUniverseRow
      })),
    error: null
  };
}

/**
 * Internal helper: batch-fetch the user's subscriptions for a set of
 * universe ids. Used by {@link getUniverseMembership}.
 */
export async function getSubscriptionsForUniverses(
  supabase: TypedSupabaseClient,
  userId: string,
  universeIds: string[]
): Promise<DiscoverListResult<UserUniverseSubscriptionRow>> {
  const { data, error } = await supabase
    .from(SUBSCRIPTIONS_TABLE)
    .select(SUBSCRIPTION_DISCOVER_COLUMNS)
    .eq("user_id", userId)
    .in("universe_id", universeIds);

  return { data: (data ?? []) as UserUniverseSubscriptionRow[], error: toError(error) };
}
