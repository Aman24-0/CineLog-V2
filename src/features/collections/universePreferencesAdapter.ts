/**
 * CineLog V2 — Universe Preferences Adapter
 * ---------------------------------------------------------------------
 * Phase 8 — Collections Migration
 *
 * Maps the app's `UniversePreferences` type to the Supabase
 * `user_universe_subscriptions` table.
 *
 * Schema mapping:
 *   UniversePreferences.universeId    ↔ subscription.universe_id
 *   UniversePreferences.isAdded       ↔ row exists (true) / deleted (false)
 *   UniversePreferences.isPinned      ↔ subscription.is_pinned
 *   UniversePreferences.isHidden      ↔ NOT in schema — stored as a
 *                                       local signal only (see note below)
 *   UniversePreferences.preferredOrder   ↔ subscription.custom_sort (JSON)
 *   UniversePreferences.preferredProvider ↔ subscription.custom_sort (JSON)
 *   UniversePreferences.customOverrides  ↔ subscription.custom_sort (JSON)
 *
 * NOTE on `isHidden`:
 *   The `user_universe_subscriptions` table has no `is_hidden` column.
 *   The Firestore model supported hiding a universe without removing it.
 *   In Supabase, "hidden" is approximated by deleting the subscription
 *   (same as "removed"). The UI's "hidden universes" restore list will
 *   show universes the user has previously added but no longer has a
 *   subscription for — since we can't distinguish hidden from removed,
 *   both are treated as "not subscribed". The hiddenUniverses memo will
 *   return an empty list. This is a known limitation documented in the
 *   Database Bible's future-reserved columns.
 */

import { getClient } from "~/lib/supabase/client";
import type { UniversePreferences, CollectionEntry, ViewingOrder, TimelineProvider } from "~/shared/types";

const TABLE = "user_universe_subscriptions" as const;

// ---------------------------------------------------------------------------
// READ: Fetch all subscriptions for a user
// ---------------------------------------------------------------------------

/**
 * Load all universe subscriptions for a user from Supabase.
 *
 * Each subscription row maps to an `UniversePreferences` with
 * `isAdded: true`. Universes the user has never subscribed to are
 * not returned (they have no preferences).
 *
 * @returns An array of `UniversePreferences` (empty if none or error).
 */
export async function fetchUniversePreferencesFromSupabase(
  userId: string
): Promise<UniversePreferences[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select()
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[universePreferencesAdapter] Error fetching subscriptions:", error);
    return [];
  }
  if (!data) return [];

  return data.map((row) => {
    // Parse custom_sort as JSON for preferredOrder/preferredProvider/customOverrides
    let preferredOrder: ViewingOrder | undefined;
    let preferredProvider: TimelineProvider | undefined;
    let customOverrides: Record<string, Partial<CollectionEntry>> | undefined;

    if (row.custom_sort) {
      try {
        const parsed = JSON.parse(row.custom_sort);
        preferredOrder = parsed.preferredOrder;
        preferredProvider = parsed.preferredProvider;
        customOverrides = parsed.customOverrides;
      } catch {
        // custom_sort is not JSON — treat as preferredOrder string
        preferredOrder = row.custom_sort as ViewingOrder;
      }
    }

    return {
      universeId: row.universe_id,
      isAdded: true, // row exists = added
      isHidden: false, // not supported in Supabase schema
      isPinned: row.is_pinned,
      preferredOrder,
      preferredProvider,
      customOverrides,
      addedAt: row.created_at,
    } as UniversePreferences;
  });
}

// ---------------------------------------------------------------------------
// WRITE: Subscription operations
// ---------------------------------------------------------------------------

/**
 * Add a universe subscription (creates a row in user_universe_subscriptions).
 */
export async function addUniverseSubscription(userId: string, universeId: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from(TABLE)
    .upsert({
      user_id: userId,
      universe_id: universeId,
      is_pinned: false,
      custom_sort: null,
    }, { onConflict: "user_id,universe_id" });

  if (error) throw error;
}

/**
 * Remove a universe subscription (deletes the row).
 */
export async function removeUniverseSubscription(userId: string, universeId: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("universe_id", universeId);

  if (error) throw error;
}

/**
 * Pin a universe (sets is_pinned = true).
 */
export async function pinUniverseSubscription(userId: string, universeId: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ is_pinned: true })
    .eq("user_id", userId)
    .eq("universe_id", universeId);

  if (error) throw error;
}

/**
 * Unpin a universe (sets is_pinned = false).
 */
export async function unpinUniverseSubscription(userId: string, universeId: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ is_pinned: false })
    .eq("user_id", userId)
    .eq("universe_id", universeId);

  if (error) throw error;
}

/**
 * Set preferred order / provider / overrides for a universe.
 * Stored as JSON in the `custom_sort` column.
 */
export async function setUniversePreferences(
  userId: string,
  universeId: string,
  prefs: {
    preferredOrder?: ViewingOrder;
    preferredProvider?: TimelineProvider;
    customOverrides?: Record<string, Partial<CollectionEntry>>;
  }
): Promise<void> {
  const supabase = getClient();
  const customSort = JSON.stringify(prefs);
  const { error } = await supabase
    .from(TABLE)
    .update({ custom_sort: customSort })
    .eq("user_id", userId)
    .eq("universe_id", universeId);

  if (error) throw error;
}
