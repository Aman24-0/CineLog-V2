/**
 * CineLog V2 — Profile Repository (Barrel)
 * ---------------------------------------------------------------------
 * Public surface of the Supabase Profile Repository. Application code
 * should import from here (or from the parent `repositories/index.ts`)
 * so the internal file layout can evolve without touching call-sites.
 *
 * Module structure (Single Responsibility, files kept < 250 lines):
 *   profile.types.ts       — shared types
 *   profile.utils.ts       — validation + payload-mapping helpers
 *   profile.read.ts        — read queries (getProfile, …)
 *   profile.write.ts       — write operations (create, update, …)
 *   profile.repository.ts  — main class composing read + write
 *   index.ts               — this barrel
 */

export { ProfileRepository, getProfileRepository } from "./profile.repository";
export { ensureProfile, checkUsernameAvailability } from "./profile.lifecycle";
// Profile-redesign write helpers (convenience wrappers around updateProfile
// for the social/privacy payload shape).
export {
  updateProfileMetadata,
  toggleProfileVisibility
} from "./profile.write";

export type {
  // Row / Insert / Update aliases
  ProfileRow,
  PreferencesRow,
  ProfileInsert,
  ProfileUpdate,
  PreferencesInsert,
  PreferencesUpdate,
  // Enum aliases
  ThemeType,
  DensityType,
  PreferredContentType,
  VaultViewType,
  DiscoverViewType,
  CollectionViewType,
  SortModeType,
  SpoilerLevelType,
  AdultContentType,
  // Input payload types
  CreateProfilePayload,
  UpdateProfilePayload,
  UpdatePreferencesPayload,
  // Result types
  ProfileResult,
  ProfileWriteResult
} from "./profile.types";
