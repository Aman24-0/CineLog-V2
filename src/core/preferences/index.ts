// src/core/preferences/index.ts
//
// Centralised user-preference signals for CineLog V2.
//
// Every preference here:
//   • Persists to localStorage under the `cinelog_` prefix
//   • SSR-safe (no localStorage access on the server)
//   • Applies a side-effect to <html> (data-attribute or class) so CSS
//     can react purely declaratively — no JS reads needed in components.
//
// All signals are lazy-imported where needed; importing this module is
// cheap (signals + effects, no React-style provider needed in SolidJS).
//
// This barrel re-exports from per-preference modules so each preference
// can evolve without affecting the others.

// Storage helpers (rarely imported directly by consumers)
export { readStored, writeStored, applyDataAttr } from "./_storage";

// Theme mode (dark / light / system)
export {
  themeMode,
  setThemeMode,
  effectiveThemeMode,
  type ThemeMode
} from "./themeMode";

// Custom accent (overrides --p tokens)
export {
  customAccent,
  setCustomAccent,
  contrastOn,
  applyAccentToDocument,
  clearAccentFromDocument
} from "./customAccent";

// Display density
export { density, setDensity, type Density } from "./density";

// Font size
export { fontSize, setFontSize, type FontSize } from "./fontSize";

// Poster quality (downgrades TMDB image sizes)
export {
  posterQuality,
  setPosterQuality,
  applyPosterQuality,
  type PosterQuality
} from "./posterQuality";

// Hide spoilers
export { hideSpoilers, setHideSpoilers } from "./hideSpoilers";

// Date format
export {
  dateFormat,
  setDateFormat,
  formatDateUser,
  type DateFormat
} from "./dateFormat";

// Reduced motion
export {
  reducedMotion,
  setReducedMotion,
  effectiveReducedMotion,
  type ReducedMotionPref
} from "./reducedMotion";

// High contrast
export { highContrast, setHighContrast } from "./highContrast";

// Language (UI + TMDB fallback)
export {
  language,
  setLanguage,
  fallbackLanguage,
  setFallbackLanguage,
  effectiveTMDBLanguage,
  pickOverview,
  type LanguageCode
} from "./language";

// Default vault status
export {
  defaultVaultStatus,
  setDefaultVaultStatus,
  type VaultStatus
} from "./vaultStatus";

// Adult content filter + certification cap
export {
  adultContentFilter,
  setAdultContentFilter,
  contentRatingCap,
  setContentRatingCap,
  tmdbIncludeAdult,
  filterAdultTitles
} from "./contentFilters";

// Streaming provider subscriptions
export {
  streamingProviders,
  setStreamingProviders,
  toggleStreamingProvider,
  hasStreamingProvider,
  mergeAndSortProviders,
  type TmdbProvider
} from "./streamingProviders";

// Default discover tab
export {
  defaultDiscoverTab,
  setDefaultDiscoverTab,
  type DiscoverTab
} from "./discoverTab";

// Rating scale
export {
  ratingScale,
  setRatingScale,
  formatRating,
  type RatingScale
} from "./ratingScale";

// Notification preferences
export {
  notifPrefs,
  setNotifPrefs,
  updateNotifPref,
  isInQuietHours,
  type NotificationPrefs
} from "./notifications";

// Calendar preferences
export {
  calPrefs,
  setCalPrefs,
  updateCalPref,
  formatTimeUser,
  type CalendarPrefs,
  type FirstDayOfWeek,
  type TimeFormat,
  type CalendarView
} from "./calendar";

// Sync cadence
export {
  syncCadence,
  setSyncCadence,
  shouldSyncNow,
  type SyncCadence
} from "./syncCadence";

// Hide ratings in screenshots
export {
  hideRatingsInScreenshots,
  setHideRatingsInScreenshots
} from "./hideRatingsScreenshots";

// Cross-device preference sync (Phase 1 audit fix)
// Wires the localStorage-backed signals above to the
// user_preferences.prefs_json Supabase column.
export {
  syncPreferencesFromSupabase,
  pushPreferencesToSupabase,
  startPreferenceSync,
  stopPreferenceSync,
  syncPreferencesNow,
  type PreferencesSnapshot
} from "./preferencesSync";
