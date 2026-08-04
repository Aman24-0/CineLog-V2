/**
 * CineLog V2 — Universe Preferences Adapter
 * ---------------------------------------------------------------------
 * Phase 8 — Collections Migration
 * Phase 4 Task 2 — is_hidden column added to user_universe_subscriptions
 *
 * Maps the app's `UniversePreferences` type to the Supabase
 * `user_universe_subscriptions` table.
 *
 * Schema mapping:
 *   UniversePreferences.universeId    ↔ subscription.universe_id
 *   UniversePreferences.isAdded       ↔ row exists (true) / deleted (false)
 *   UniversePreferences.isPinned      ↔ subscription.is_pinned
 *   UniversePreferences.isHidden      ↔ subscription.is_hidden  (Phase 4 Task 2)
 *   UniversePreferences.preferredOrder   ↔ subscription.custom_sort (JSON)
 *   UniversePreferences.preferredProvider ↔ subscription.custom_sort (JSON)
 *   UniversePreferences.customOverrides  ↔ subscription.custom_sort (JSON)
 *
 * NOTE on `isHidden` (Phase 4 Task 2):
 *   The `user_universe_subscriptions` table now has an `is_hidden` column
 *   (migration 20260804_add_universe_is_hidden.sql). Hiding a universe
 *   UPDATEs the row (is_hidden = TRUE) instead of DELETEing it. Restoring
 *   UPDATEs it back to FALSE. The `hiddenUniverses` memo now returns real
 *   data — universes the user has subscribed to AND marked hidden.
 */

import { getClient } from "~/lib/supabase/client";
import type {
  UniversePreferences,
  CollectionEntry,
  ViewingOrder,
  TimelineProvider
} from "~/shared/types";

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
    console.error(
      "[universePreferencesAdapter] Error fetching subscriptions:",
      error
    );
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
      // Phase 4 Task 2: read the is_hidden column. A hidden universe
      // is still "added" (the subscription row exists) but is filtered
      // out of the default "added universes" list by the hook.
      isHidden: row.is_hidden ?? false,
      isPinned: row.is_pinned,
      preferredOrder,
      preferredProvider,
      customOverrides,
      addedAt: row.created_at
    } as UniversePreferences;
  });
}

// ---------------------------------------------------------------------------
// WRITE: Subscription operations
// ---------------------------------------------------------------------------

/**
 * Add a universe subscription (creates a row in user_universe_subscriptions).
 */
export async function addUniverseSubscription(
  userId: string,
  universeId: string
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      universe_id: universeId,
      is_pinned: false,
      custom_sort: null
    },
    { onConflict: "user_id,universe_id" }
  );

  if (error) throw error;
}

/**
 * Remove a universe subscription (deletes the row).
 */
export async function removeUniverseSubscription(
  userId: string,
  universeId: string
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("universe_id", universeId);

  if (error) throw error;
}

/**
 * Phase 4 Task 2 — Hide a universe subscription (sets is_hidden = TRUE).
 *
 * The subscription row is RETAINED — the universe stays in the user's
 * subscription list but is filtered out of the default "added universes"
 * view. The user can restore it from the "hidden universes" list.
 */
export async function hideUniverseSubscription(
  userId: string,
  universeId: string
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ is_hidden: true })
    .eq("user_id", userId)
    .eq("universe_id", universeId);

  if (error) throw error;
}

/**
 * Phase 4 Task 2 — Restore a hidden universe (sets is_hidden = FALSE).
 *
 * Brings the universe back into the default "added universes" view.
 * The subscription row must already exist (the universe was previously
 * added then hidden — NOT removed).
 */
export async function restoreUniverseSubscription(
  userId: string,
  universeId: string
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ is_hidden: false })
    .eq("user_id", userId)
    .eq("universe_id", universeId);

  if (error) throw error;
}

/**
 * Pin a universe (sets is_pinned = true).
 */
export async function pinUniverseSubscription(
  userId: string,
  universeId: string
): Promise<void> {
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
export async function unpinUniverseSubscription(
  userId: string,
  universeId: string
): Promise<void> {
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
