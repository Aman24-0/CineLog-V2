/**
 * CineLog V2 — Supabase Profile Hook
 * ---------------------------------------------------------------------
 * Wraps {@link ProfileRepository} into a Solid-friendly hook.
 *
 * No business logic. No UI logic. No Firebase interaction. Thin
 * reactive adapter — does NOT cache or dedupe; the consuming
 * component owns result state.
 *
 * SSR safety
 * ----------
 * `getProfileRepository()` returns a fresh per-request server client
 * on SSR and the singleton browser client on the client.
 */

import { getProfileRepository } from "../repositories";
import type {
  CreateProfilePayload,
  PreferencesRow,
  ProfileResult,
  ProfileRow,
  ProfileWriteResult,
  UpdatePreferencesPayload,
  UpdateProfilePayload
} from "../repositories";
import { createAsyncState } from "./_shared";

/**
 * The return type of {@link useProfile}.
 */
export interface UseProfileReturn {
  readonly loading: () => boolean;
  readonly error: () => Error | null;
  readonly clearError: () => void;

  // ---- Reads ----
  readonly getProfile: (userId: string) => Promise<ProfileResult<ProfileRow>>;
  readonly getProfileByUsername: (username: string) => Promise<ProfileResult<ProfileRow>>;
  readonly getPreferences: (userId: string) => Promise<ProfileResult<PreferencesRow>>;
  readonly profileExists: (userId: string) => Promise<{ exists: boolean; error: Error | null }>;

  // ---- Creates ----
  readonly createProfile: (payload: CreateProfilePayload) => Promise<ProfileResult<ProfileRow>>;

  // ---- Updates ----
  readonly updateProfile: (userId: string, payload: UpdateProfilePayload) => Promise<ProfileResult<ProfileRow>>;
  readonly updateAvatar: (userId: string, avatarUrl: string | null) => Promise<ProfileResult<ProfileRow>>;
  readonly updateBio: (userId: string, bio: string | null) => Promise<ProfileResult<ProfileRow>>;
  readonly updatePreferences: (
    userId: string,
    payload: UpdatePreferencesPayload
  ) => Promise<ProfileResult<PreferencesRow>>;

  // ---- Account lifecycle ----
  readonly scheduleDeletion: (userId: string, deletionAt?: string) => Promise<ProfileResult<ProfileRow>>;
  readonly restoreProfile: (userId: string) => Promise<ProfileResult<ProfileRow>>;
  readonly permanentlyDeleteProfile: (userId: string) => Promise<ProfileWriteResult>;
}

/**
 * useProfile — reactive adapter over {@link ProfileRepository}.
 */
export function useProfile(): UseProfileReturn {
  const { loading, error, run, clearError } = createAsyncState();
  const repo = () => getProfileRepository();

  return {
    loading,
    error,
    clearError,

    // ---- Reads ----
    getProfile: (userId) => run(() => repo().getProfile(userId)),
    getProfileByUsername: (username) => run(() => repo().getProfileByUsername(username)),
    getPreferences: (userId) => run(() => repo().getPreferences(userId)),
    profileExists: (userId) => run(() => repo().profileExists(userId)),

    // ---- Creates ----
    createProfile: (payload) => run(() => repo().createProfile(payload)),

    // ---- Updates ----
    updateProfile: (userId, payload) => run(() => repo().updateProfile(userId, payload)),
    updateAvatar: (userId, avatarUrl) => run(() => repo().updateAvatar(userId, avatarUrl)),
    updateBio: (userId, bio) => run(() => repo().updateBio(userId, bio)),
    updatePreferences: (userId, payload) => run(() => repo().updatePreferences(userId, payload)),

    // ---- Account lifecycle ----
    scheduleDeletion: (userId, deletionAt) => run(() => repo().scheduleDeletion(userId, deletionAt)),
    restoreProfile: (userId) => run(() => repo().restoreProfile(userId)),
    permanentlyDeleteProfile: (userId) => run(() => repo().permanentlyDeleteProfile(userId))
  };
}
