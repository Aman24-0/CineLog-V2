/**
 * CineLog V2 — Profile Repository: Internal Helpers
 * ---------------------------------------------------------------------
 * Pure, side-effect-free utilities used by the read and write modules.
 * Kept separate so the query modules stay focused on Supabase calls
 * and the business-rule validation lives in one auditable place.
 *
 * Nothing here is part of the public repository API — these functions
 * are only consumed by sibling modules in this folder.
 */

import type { ProfileUpdate, PreferencesUpdate } from "./profile.types";

// ---------------------------------------------------------------------------
// Constants — Database Bible §01 constraints
// ---------------------------------------------------------------------------

/** Maximum bio length (Database Bible §01: "Max 160 characters"). */
export const MAX_BIO_LENGTH = 160 as const;

/** ISO 3166-1 alpha-2 country code length. */
export const COUNTRY_CODE_LENGTH = 2 as const;

/** Account-deletion recovery window in days (Database Bible §00). */
export const ACCOUNT_DELETION_RECOVERY_DAYS = 7 as const;

// ---------------------------------------------------------------------------
// Validation — fail fast before hitting the database
// ---------------------------------------------------------------------------

/**
 * Validate a bio string. Returns `null` if valid, or an `Error` if it
 * exceeds the 160-character limit (Database Bible §01).
 *
 * `null` / `undefined` are valid (bio is nullable).
 */
export function validateBio(bio: string | null | undefined): Error | null {
  if (bio === null || bio === undefined) return null;
  if (bio.length > MAX_BIO_LENGTH) {
    return new Error(
      `[ProfileRepository] bio must be at most ${MAX_BIO_LENGTH} characters (received ${bio.length}).`
    );
  }
  return null;
}

/**
 * Validate an ISO 3166-1 alpha-2 country code. Returns `null` if valid,
 * or an `Error` if the length is wrong.
 *
 * Does NOT check whether the code is a real country — that is the DB's
 * responsibility if a CHECK constraint exists. The repository only
 * guards against obvious client-side mistakes.
 */
export function validateCountry(country: string | undefined): Error | null {
  if (country === undefined) return null;
  if (country.length !== COUNTRY_CODE_LENGTH) {
    return new Error(
      `[ProfileRepository] country must be a ${COUNTRY_CODE_LENGTH}-character ISO code (received "${country}").`
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Payload mapping — translate camelCase input payloads to snake_case DB rows
// ---------------------------------------------------------------------------

/**
 * Map a {@link CreateProfilePayload} (camelCase, public API) to the
 * snake-case `ProfileInsert` shape the DB expects.
 *
 * Centralised here so the write module stays readable.
 */
export function toProfileInsert(
  payload: import("./profile.types").CreateProfilePayload
): import("./profile.types").ProfileInsert {
  return {
    id: payload.id,
    username: payload.username,
    display_name: payload.displayName,
    avatar_url: payload.avatarUrl ?? null,
    bio: payload.bio ?? null,
    country: payload.country,
    language_code: payload.languageCode,
    timezone: payload.timezone
  };
}

/**
 * Map a {@link UpdateProfilePayload} to the snake-case `ProfileUpdate`
 * shape. Only sets fields that are present in the payload.
 *
 * Profile favorites are included — they're nullable, so `null` is a
 * valid "clear this favorite" value. `undefined` means "don't touch".
 */
export function toProfileUpdate(
  payload: import("./profile.types").UpdateProfilePayload
): ProfileUpdate {
  const update: ProfileUpdate = {};
  if (payload.username !== undefined) update.username = payload.username;
  if (payload.displayName !== undefined) {
    update.display_name = payload.displayName;
    // When the user manually edits their display_name, mark it as
    // initialized so ensureProfile never overwrites it on future logins.
    (update as ProfileUpdate & { display_name_initialized?: boolean }).display_name_initialized = true;
  }
  if (payload.avatarUrl !== undefined) update.avatar_url = payload.avatarUrl;
  if (payload.bio !== undefined) update.bio = payload.bio;
  if (payload.country !== undefined) update.country = payload.country;
  if (payload.languageCode !== undefined) update.language_code = payload.languageCode;
  if (payload.timezone !== undefined) update.timezone = payload.timezone;
  if (payload.favoriteMovieId !== undefined) update.favorite_movie_id = payload.favoriteMovieId;
  if (payload.favoriteSeriesId !== undefined) update.favorite_series_id = payload.favoriteSeriesId;
  if (payload.favoriteDirectorId !== undefined) update.favorite_director_id = payload.favoriteDirectorId;
  if (payload.favoriteGenre !== undefined) update.favorite_genre = payload.favoriteGenre;
  if (payload.bannerOverridePath !== undefined) update.banner_override_path = payload.bannerOverridePath;
  if (payload.bannerType !== undefined) update.banner_type = payload.bannerType;
  if (payload.bannerUrl !== undefined) update.banner_url = payload.bannerUrl;
  // Profile redesign fields — social_links (JSONB) + is_public (boolean).
  // socialLinks undefined = don't touch; null = clear to empty object;
  // object = set to that JSONB value.
  if (payload.socialLinks !== undefined) {
    update.social_links = payload.socialLinks ?? {};
  }
  if (payload.isPublic !== undefined) update.is_public = payload.isPublic;
  return update;
}

/**
 * Map a {@link UpdatePreferencesPayload} to the snake-case
 * `PreferencesUpdate` shape. Only sets fields that are present.
 */
export function toPreferencesUpdate(
  payload: import("./profile.types").UpdatePreferencesPayload
): PreferencesUpdate {
  const update: PreferencesUpdate = {};
  if (payload.theme !== undefined) update.theme = payload.theme;
  if (payload.accentColor !== undefined) update.accent_color = payload.accentColor;
  if (payload.density !== undefined) update.density = payload.density;
  if (payload.country !== undefined) update.country = payload.country;
  if (payload.languageCode !== undefined) update.language_code = payload.languageCode;
  if (payload.timezone !== undefined) update.timezone = payload.timezone;
  if (payload.preferredContent !== undefined) update.preferred_content = payload.preferredContent;
  if (payload.vaultView !== undefined) update.vault_view = payload.vaultView;
  if (payload.discoverView !== undefined) update.discover_view = payload.discoverView;
  if (payload.collectionView !== undefined) update.collection_view = payload.collectionView;
  if (payload.defaultSort !== undefined) update.default_sort = payload.defaultSort;
  if (payload.spoilerLevel !== undefined) update.spoiler_level = payload.spoilerLevel;
  if (payload.adultContent !== undefined) update.adult_content = payload.adultContent;
  return update;
}

// ---------------------------------------------------------------------------
// Account deletion timestamp helper
// ---------------------------------------------------------------------------

/**
 * Compute the `scheduled_deletion_at` timestamp — `now + 7 days`
 * (Database Bible §00: "Account Delete → 7-day Recovery → Permanent
 * Delete").
 *
 * Exposed so callers can override the recovery window in tests.
 */
export function computeScheduledDeletionAt(
  days: number = ACCOUNT_DELETION_RECOVERY_DAYS
): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// Re-export toError from shared (eliminates duplicate)
export { toError } from "../shared";
