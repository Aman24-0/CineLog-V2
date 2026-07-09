/**
 * CineLog V2 — Profile Repository
 * ---------------------------------------------------------------------
 * Composes the read and write modules into a single class with a clean
 * public API. This is the only file callers should import directly
 * (via the barrel at `repositories/profile/index.ts`).
 *
 * The class holds a typed Supabase client and delegates every method
 * to the corresponding function in `profile.read.ts` or
 * `profile.write.ts`. This keeps the class thin (Single Responsibility:
 * orchestration) while the query logic lives in testable, stateless
 * functions.
 *
 * Pattern (Supabase Integration Guide §05):
 *
 *     Component → ProfileRepository → Supabase → Database
 *
 * Phase scope
 * -----------
 * Foundation only. NOT wired into the application — the existing
 * Firebase auth + Firestore profile code remains the sole source of
 * truth until the migration explicitly cuts over (Integration Guide
 * §07, Phase 4–5).
 */

import { getClient } from "../../client";
import type { TypedSupabaseClient } from "./profile.types";
import {
  getPreferences,
  getProfile,
  getProfileByUsername,
  profileExists
} from "./profile.read";
import {
  createProfile,
  updateAvatar,
  updateBio,
  updatePreferences,
  updateProfile
} from "./profile.write";
import {
  permanentlyDeleteProfile,
  restoreProfile,
  scheduleDeletion
} from "./profile.lifecycle";
import type {
  CreateProfilePayload,
  PreferencesRow,
  ProfileResult,
  ProfileRow,
  ProfileWriteResult,
  UpdatePreferencesPayload,
  UpdateProfilePayload
} from "./profile.types";

// ---------------------------------------------------------------------------
// ProfileRepository
// ---------------------------------------------------------------------------

export class ProfileRepository {
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

  // ---- Reads ---------------------------------------------------------

  /** Get a profile by user id. Excludes soft-deleted rows. */
  getProfile(userId: string): Promise<ProfileResult<ProfileRow>> {
    return getProfile(this.supabase, userId);
  }

  /** Get a profile by username (case-insensitive, citext). */
  getProfileByUsername(username: string): Promise<ProfileResult<ProfileRow>> {
    return getProfileByUsername(this.supabase, username);
  }

  /** Get the preferences row (1:1 with profiles). */
  getPreferences(userId: string): Promise<ProfileResult<PreferencesRow>> {
    return getPreferences(this.supabase, userId);
  }

  /** Cheap existence check (excludes soft-deleted rows). */
  profileExists(userId: string): Promise<{ exists: boolean; error: Error | null }> {
    return profileExists(this.supabase, userId);
  }

  // ---- Creates -------------------------------------------------------

  /** Create a new profile row (migrations / tests / trigger recovery). */
  createProfile(payload: CreateProfilePayload): Promise<ProfileResult<ProfileRow>> {
    return createProfile(this.supabase, payload);
  }

  // ---- Updates -------------------------------------------------------

  /** Partially update a profile. */
  updateProfile(userId: string, payload: UpdateProfilePayload): Promise<ProfileResult<ProfileRow>> {
    return updateProfile(this.supabase, userId, payload);
  }

  /** Update only the avatar URL. */
  updateAvatar(userId: string, avatarUrl: string | null): Promise<ProfileResult<ProfileRow>> {
    return updateAvatar(this.supabase, userId, avatarUrl);
  }

  /** Update only the bio (validates 160-char limit). */
  updateBio(userId: string, bio: string | null): Promise<ProfileResult<ProfileRow>> {
    return updateBio(this.supabase, userId, bio);
  }

  /** Upsert the preferences row (1:1 with profiles). */
  updatePreferences(
    userId: string,
    payload: UpdatePreferencesPayload
  ): Promise<ProfileResult<PreferencesRow>> {
    return updatePreferences(this.supabase, userId, payload);
  }

  // ---- Account lifecycle --------------------------------------------

  /** Schedule account deletion (sets scheduled_deletion_at = now + 7d). */
  scheduleDeletion(
    userId: string,
    deletionAt?: string
  ): Promise<ProfileResult<ProfileRow>> {
    return scheduleDeletion(this.supabase, userId, deletionAt);
  }

  /** Restore a profile scheduled for deletion (clears scheduled_deletion_at). */
  restoreProfile(userId: string): Promise<ProfileResult<ProfileRow>> {
    return restoreProfile(this.supabase, userId);
  }

  /**
   * Permanently delete a profile.
   *
   * ⚠️ Requires an elevated-privilege client (service role key or
   * admin edge function) — see `profile.write.ts` for the full
   * architecture note. Will return an RLS error with the standard
   * anon-key client.
   */
  permanentlyDeleteProfile(userId: string): Promise<ProfileWriteResult> {
    return permanentlyDeleteProfile(this.supabase, userId);
  }
}

// ---------------------------------------------------------------------------
// Default singleton — browser caches; SSR is always fresh
// ---------------------------------------------------------------------------

let _defaultInstance: ProfileRepository | null = null;

/**
 * Get the default ProfileRepository instance.
 *
 * Browser: lazily-initialised singleton sharing the singleton browser
 * client. SSR: fresh instance per call (auth state isolation).
 */
export function getProfileRepository(): ProfileRepository {
  if (typeof window === "undefined") {
    return new ProfileRepository();
  }
  if (!_defaultInstance) {
    _defaultInstance = new ProfileRepository();
  }
  return _defaultInstance;
}
