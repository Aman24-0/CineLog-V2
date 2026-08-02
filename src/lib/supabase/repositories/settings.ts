// src/lib/supabase/repositories/settings.ts
//
// Settings repository — syncs the user's preferences between
// localStorage (instant UI) and the `user_preferences` table
// (cross-device sync).
//
// DESIGN:
//   localStorage is the PRIMARY store for all preference signals
//   (theme, density, fontSize, etc.) because:
//     1. They need to be readable synchronously on first paint to
//        avoid a flash of unstyled content.
//     2. They drive CSS custom properties / data-attributes that
//        affect every component.
//     3. The user may be offline or signed-out.
//
//   The `user_preferences` table is a SECONDARY store used for
//   cross-device sync: when the user signs in on a new device, we
//   fetch their saved prefs and apply them. When they change a pref,
//   we best-effort write it to the DB so it propagates.
//
//   If the DB write fails (offline, RLS error, etc.), the localStorage
//   value still stands and the user is unaffected. We log the error
//   but don't surface it — prefs are a UX concern, not a data-integrity
//   concern.

import { getClient, type TypedSupabaseClient } from "~/lib/supabase/repositories/shared";
import type { Database } from "~/lib/supabase/database.types";

/** Typed alias for the user_preferences Row shape. */
type UserPreferencesRow = Database["public"]["Tables"]["user_preferences"]["Row"];
type UserPreferencesInsert = Database["public"]["Tables"]["user_preferences"]["Insert"];

/**
 * A flat key→value map of all persisted preferences. Used for
 * cross-device sync. The keys match the column names in the
 * `user_preferences` table where possible; for prefs that don't have
 * a column (notifications, calendar, etc.), we pack them into a
 * JSONB column called `prefs_json`.
 *
 * We use the DB Row type directly so all values are correctly typed
 * (enums for theme/density/etc., Json for prefs_json).
 */
export type SettingsSnapshot = Partial<UserPreferencesRow>;

export interface SettingsResult {
  data: SettingsSnapshot | null;
  error: Error | null;
}

/**
 * Fetch the user's saved preferences from the DB. Returns null if the
 * user has no saved prefs (first sign-in on this device) or if the
 * fetch fails. The caller should fall back to localStorage defaults.
 */
export async function getUserSettings(
  userId: string,
  client: TypedSupabaseClient = getClient()
): Promise<SettingsResult> {
  try {
    const { data, error } = await client
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    if (!data) {
      return { data: null, error: null };
    }

    return { data: data as UserPreferencesRow, error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

/**
 * Save a settings snapshot to the DB. Uses upsert so it works whether
 * or not a row already exists for this user.
 *
 * Best-effort: if the write fails, the error is returned but the
 * caller should NOT surface it to the user (localStorage already
 * has the value).
 *
 * The snapshot is merged into a minimal insert payload so we only
 * write the columns we actually have values for.
 */
export async function saveUserSettings(
  userId: string,
  snapshot: SettingsSnapshot,
  client: TypedSupabaseClient = getClient()
): Promise<{ error: Error | null }> {
  try {
    const payload: UserPreferencesInsert = {
      user_id: userId,
      ...snapshot,
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from("user_preferences")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

/**
 * Save a single preference key to the DB. Convenience wrapper around
 * saveUserSettings — builds a minimal patch with just the changed key
 * and upserts it. For batch updates, prefer saveUserSettings.
 *
 * The key must be a known column on user_preferences (typed via
 * SettingsSnapshot). For extended prefs that live in prefs_json,
 * use saveExtendedPreference instead.
 */
export async function saveUserPreference(
  userId: string,
  key: keyof SettingsSnapshot,
  value: unknown,
  client: TypedSupabaseClient = getClient()
): Promise<{ error: Error | null }> {
  try {
    const payload: UserPreferencesInsert = {
      user_id: userId,
      [key]: value,
      updated_at: new Date().toISOString()
    } as UserPreferencesInsert;

    const { error } = await client
      .from("user_preferences")
      .upsert(payload, { onConflict: "user_id" });

    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

/**
 * Save an extended preference (one that doesn't have a dedicated
 * column) into the prefs_json JSONB column. Fetches the current
 * prefs_json, merges the key, and saves.
 *
 * This is less efficient than saveUserPreference (two round trips)
 * but keeps the schema simple and avoids a migration for every new
 * pref.
 */
export async function saveExtendedPreference(
  userId: string,
  key: string,
  value: unknown,
  client: TypedSupabaseClient = getClient()
): Promise<{ error: Error | null }> {
  try {
    const existing = await getUserSettings(userId, client);
    const prefsJson: Record<string, unknown> =
      (existing.data?.prefs_json as Record<string, unknown> | null) ?? {};
    prefsJson[key] = value;

    const payload: UserPreferencesInsert = {
      user_id: userId,
      prefs_json: prefsJson as unknown as Database["public"]["Tables"]["user_preferences"]["Insert"]["prefs_json"],
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from("user_preferences")
      .upsert(payload, { onConflict: "user_id" });

    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

/**
 * Reset all preferences to defaults for the given user. This deletes
 * the user_preferences row entirely (the DB default values will be
 * re-applied on next fetch). Best-effort.
 */
export async function resetUserSettings(
  userId: string,
  client: TypedSupabaseClient = getClient()
): Promise<{ error: Error | null }> {
  try {
    const { error } = await client
      .from("user_preferences")
      .delete()
      .eq("user_id", userId);

    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
