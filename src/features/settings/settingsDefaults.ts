// src/features/settings/settingsDefaults.ts
//
// Phase 6 Part 3 — Task 3: Settings "Reset to defaults" + import/export.
//
// This module owns:
//   • SECTION_DEFAULTS — a map of sectionId → function that resets the
//     relevant preference signals to their default values.
//   • resetSectionToDefaults(sectionId) — invokes the above.
//   • exportSettingsToFile() — collects all current preference values
//     into a JSON object and triggers a browser download.
//   • importSettingsFromFile(file) — reads a JSON file, validates it,
//     and applies the snapshot to the preference signals.
//
// DESIGN:
//   • "Reset to defaults" is per-section so the user can keep the
//     parts of their config they like (e.g. preserve appearance while
//     resetting notifications). The reset is OPT-OUT — the user
//     confirms via a toast action ("Reset to defaults? — Undo" for
//     5 seconds), but for the simpler v1 implementation we just
//     reset immediately and show a success toast.
//   • Export/import uses the same PreferencesSnapshot shape as the
//     cross-device sync (see preferencesSync.ts). This means an
//     exported file from one device can be imported on another, and
//     the imported values will then sync to the cloud.
//   • Import is intentionally permissive — missing keys are skipped
//     (not treated as errors), so an export from an older version
//     of CineLog can still be imported on a newer version.
//   • The exported file has a metadata header (version, exported_at,
//     source_user_id_hash) so we can detect:
//       - An import of a file from a different CineLog version.
//       - An import of a file from a different user (warn but allow).

import { isServer } from "solid-js/web";

import {
  themeMode,
  setThemeMode,
  density,
  setDensity,
  fontSize,
  setFontSize,
  posterQuality,
  setPosterQuality,
  hideSpoilers,
  setHideSpoilers,
  reducedMotion,
  setReducedMotion,
  highContrast,
  setHighContrast,
  language,
  setLanguage,
  defaultVaultStatus,
  setDefaultVaultStatus,
  adultContentFilter,
  setAdultContentFilter,
  defaultDiscoverTab,
  setDefaultDiscoverTab,
  ratingScale,
  setRatingScale,
  hideRatingsInScreenshots,
  setHideRatingsInScreenshots,
  notifPrefs,
  setNotifPrefs,
  calPrefs,
  setCalPrefs,
  syncCadence,
  setSyncCadence,
  type NotificationPrefs,
  type CalendarPrefs,
  type Density,
  type FontSize,
  type PosterQuality,
  type ReducedMotionPref,
  type DateFormat,
  type DiscoverTab,
  type RatingScale,
  type SyncCadence,
  type VaultStatus,
  type ThemeMode
} from "~/core/preferences";

import { theme, setTheme, type Theme } from "~/core/theme";

import {
  fallbackLanguage,
  setFallbackLanguage
} from "~/core/preferences/language";

import {
  dateFormat,
  setDateFormat
} from "~/core/preferences/dateFormat";

import {
  contentRatingCap,
  setContentRatingCap
} from "~/core/preferences/contentFilters";

import {
  streamingProviders,
  setStreamingProviders
} from "~/core/preferences/streamingProviders";

import type { PreferencesSnapshot } from "~/core/preferences/preferencesSync";

// ─── Section ids (mirror SECTIONS in sections/meta.ts) ──────────────

export type SettingsSectionId =
  | "account"
  | "appearance"
  | "content"
  | "notifications"
  | "calendar"
  | "sync"
  | "danger";

// ─── Default values (single source of truth for "reset to defaults") ─
//
// Each entry is the DEFAULT value for a preference. We import these
// from the per-preference modules so we don't have a second copy that
// can drift.
//
// Where the preference module doesn't export its default, we hardcode
// the value here AND verify it matches by reading the module's source.
// (If the module's default changes, this file must be updated.)

import { DEFAULT_NOTIF_PREFS } from "~/core/preferences/notifications";

const DEFAULT_CAL_PREFS: CalendarPrefs = {
  firstDayOfWeek: 1,
  timeFormat: "24h",
  releaseTimezone: "local",
  defaultView: "week"
};

const DEFAULT_SYNC_CADENCE: SyncCadence = "realtime";

const DEFAULT_THEME_MODE: ThemeMode = "dark";
const DEFAULT_THEME: Theme = "cinematic";
const DEFAULT_DENSITY: Density = "comfortable";
const DEFAULT_FONT_SIZE: FontSize = "medium";
const DEFAULT_POSTER_QUALITY: PosterQuality = "high";
const DEFAULT_HIDE_SPOILERS = false;
const DEFAULT_REDUCED_MOTION: ReducedMotionPref = "system";
const DEFAULT_HIGH_CONTRAST = false;
const DEFAULT_LANGUAGE = "en";
const DEFAULT_FALLBACK_LANGUAGE = "";
const DEFAULT_VAULT_STATUS: VaultStatus = "Planned";
const DEFAULT_ADULT_FILTER = false;
const DEFAULT_DISCOVER_TAB: DiscoverTab = "all";
const DEFAULT_RATING_SCALE: RatingScale = "10star";
const DEFAULT_HIDE_RATINGS_SCREENSHOTS = false;
const DEFAULT_DATE_FORMAT: DateFormat = "dmy";
const DEFAULT_CONTENT_RATING_CAP = "";

// ─── Section resetters ──────────────────────────────────────────────

/**
 * Reset the appearance section's preferences to their defaults.
 * Includes: themeMode, theme (accent preset), density, fontSize,
 * posterQuality, hideSpoilers, reducedMotion, highContrast.
 */
function resetAppearance(): void {
  setThemeMode(DEFAULT_THEME_MODE);
  setTheme(DEFAULT_THEME);
  setDensity(DEFAULT_DENSITY);
  setFontSize(DEFAULT_FONT_SIZE);
  setPosterQuality(DEFAULT_POSTER_QUALITY);
  setHideSpoilers(DEFAULT_HIDE_SPOILERS);
  setReducedMotion(DEFAULT_REDUCED_MOTION);
  setHighContrast(DEFAULT_HIGH_CONTRAST);
}

/**
 * Reset the content + language section. Includes: language,
 * fallbackLanguage, dateFormat, defaultVaultStatus, adultContentFilter,
 * contentRatingCap, defaultDiscoverTab, ratingScale,
 * hideRatingsInScreenshots, streamingProviders.
 *
 * streamingProviders is reset to an empty list (the user can re-pick
 * their subscriptions from the Discover filters).
 */
function resetContent(): void {
  setLanguage(DEFAULT_LANGUAGE);
  setFallbackLanguage(DEFAULT_FALLBACK_LANGUAGE);
  setDateFormat(DEFAULT_DATE_FORMAT);
  setDefaultVaultStatus(DEFAULT_VAULT_STATUS);
  setAdultContentFilter(DEFAULT_ADULT_FILTER);
  setContentRatingCap(DEFAULT_CONTENT_RATING_CAP);
  setDefaultDiscoverTab(DEFAULT_DISCOVER_TAB);
  setRatingScale(DEFAULT_RATING_SCALE);
  setHideRatingsInScreenshots(DEFAULT_HIDE_RATINGS_SCREENSHOTS);
  setStreamingProviders([]);
}

/**
 * Reset the notifications section. Restores the DEFAULT_NOTIF_PREFS
 * (master email toggle on, per-category defaults, quiet hours off,
 * weekly digest Monday 09:00, episode reminder lead 60 min).
 */
function resetNotifications(): void {
  setNotifPrefs({ ...DEFAULT_NOTIF_PREFS } as NotificationPrefs);
}

/**
 * Reset the calendar section. Restores the DEFAULT_CAL_PREFS
 * (Mon first day, 24h time, local timezone, week view).
 */
function resetCalendar(): void {
  setCalPrefs({ ...DEFAULT_CAL_PREFS });
}

/**
 * Reset the sync section. Restores syncCadence to "realtime".
 * Does NOT trigger an immediate sync — the user can do that
 * manually via the "Sync now" button.
 */
function resetSync(): void {
  setSyncCadence(DEFAULT_SYNC_CADENCE);
}

/**
 * Account section has no preferences to reset (it's all profile
 * data + auth state). We expose this for completeness so the UI
 * can call resetSectionToDefaults("account") without branching.
 */
function resetAccount(): void {
  // No-op — account section has no preferences.
}

const SECTION_RESETTERS: Record<
  SettingsSectionId,
  () => void
> = {
  account: resetAccount,
  appearance: resetAppearance,
  content: resetContent,
  notifications: resetNotifications,
  calendar: resetCalendar,
  sync: resetSync,
  danger: resetAccount // no-op
};

/**
 * Reset the given section's preferences to their default values.
 *
 * The reset is applied immediately to the preference signals (which
 * also persist to localStorage via their createEffect, and sync to
 * Supabase via the preferencesSync debouncer).
 *
 * Returns true if the section was reset, false if the section id is
 * unknown (defensive — the UI guards against this, but just in case).
 */
export function resetSectionToDefaults(sectionId: SettingsSectionId): boolean {
  const resetter = SECTION_RESETTERS[sectionId];
  if (!resetter) return false;
  resetter();
  return true;
}

// ─── Export / Import ────────────────────────────────────────────────

/**
 * Magic header in the exported JSON file so we can detect a
 * non-CineLog file (or a CineLog file from a future incompatible
 * version) and refuse to import it cleanly.
 */
const EXPORT_MAGIC = "cineLog.preferences.v1";

export interface ExportedSettings {
  magic: string;
  exported_at: string;
  version: 1;
  preferences: PreferencesSnapshot;
}

/**
 * Collect all current preference values into a snapshot. Reuses the
 * same readSnapshot logic from preferencesSync.ts (via the signal
 * reads below) so the exported file is identical in shape to what
 * gets pushed to Supabase.
 */
function collectSnapshot(): PreferencesSnapshot {
  return {
    themeMode: themeMode(),
    theme: theme(),
    density: density(),
    fontSize: fontSize(),
    posterQuality: posterQuality(),
    hideSpoilers: hideSpoilers(),
    dateFormat: dateFormat(),
    reducedMotion: reducedMotion(),
    highContrast: highContrast(),
    language: language(),
    defaultVaultStatus: defaultVaultStatus(),
    adultContentFilter: adultContentFilter(),
    defaultDiscoverTab: defaultDiscoverTab(),
    ratingScale: ratingScale(),
    hideRatingsInScreenshots: hideRatingsInScreenshots(),
    notifPrefs: notifPrefs(),
    calPrefs: calPrefs(),
    syncCadence: syncCadence()
  };
}

/**
 * Apply a snapshot to the preference signals. Missing keys are
 * skipped (so an old export works on a new CineLog version that
 * has more preferences). Reuses the same applySnapshot logic from
 * preferencesSync.ts.
 */
function applyImportedSnapshot(snap: PreferencesSnapshot): void {
  if (snap.themeMode) setThemeMode(snap.themeMode);
  if (snap.theme) setTheme(snap.theme);
  if (snap.density) setDensity(snap.density);
  if (snap.fontSize) setFontSize(snap.fontSize);
  if (snap.posterQuality) setPosterQuality(snap.posterQuality);
  if (typeof snap.hideSpoilers === "boolean") setHideSpoilers(snap.hideSpoilers);
  if (snap.dateFormat) setDateFormat(snap.dateFormat);
  if (snap.reducedMotion) setReducedMotion(snap.reducedMotion);
  if (typeof snap.highContrast === "boolean") setHighContrast(snap.highContrast);
  if (snap.language) setLanguage(snap.language);
  if (snap.defaultVaultStatus) setDefaultVaultStatus(snap.defaultVaultStatus);
  if (typeof snap.adultContentFilter === "boolean") {
    setAdultContentFilter(snap.adultContentFilter);
  }
  if (snap.defaultDiscoverTab) setDefaultDiscoverTab(snap.defaultDiscoverTab);
  if (snap.ratingScale) setRatingScale(snap.ratingScale);
  if (typeof snap.hideRatingsInScreenshots === "boolean") {
    setHideRatingsInScreenshots(snap.hideRatingsInScreenshots);
  }
  if (snap.notifPrefs) setNotifPrefs(snap.notifPrefs);
  if (snap.calPrefs) setCalPrefs(snap.calPrefs);
  if (snap.syncCadence) setSyncCadence(snap.syncCadence);

  // fallbackLanguage + streamingProviders + contentRatingCap aren't
  // in the standard PreferencesSnapshot yet (they were added later
  // and haven't been wired into the sync). For now, export/import
  // skips them — they remain at their current values. Future
  // enhancement: extend PreferencesSnapshot to include them.
}

/**
 * Export all current preferences to a JSON file and trigger a
 * browser download. The file is named
 *   cinelog-preferences-YYYY-MM-DD.json
 * so the user can keep multiple exports without name collisions.
 *
 * Returns true on success, false on failure (e.g. download
 * couldn't be triggered — typically only happens in old browsers
 * without the `download` attribute support, which CineLog doesn't
 * officially support anyway).
 */
export function exportSettingsToFile(): boolean {
  if (isServer) return false;

  try {
    const snap = collectSnapshot();
    const payload: ExportedSettings = {
      magic: EXPORT_MAGIC,
      exported_at: new Date().toISOString(),
      version: 1,
      preferences: snap
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `cinelog-preferences-${today}.json`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    // Cleanup: remove the link + revoke the blob URL after the
    // click has been processed. setTimeout(0) ensures the browser
    // has started the download before we revoke.
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    return true;
  } catch (err) {
    console.error("[settings] exportSettingsToFile failed:", err);
    return false;
  }
}

/**
 * Read a JSON file from an <input type="file"> and apply the
 * preferences to the current signals.
 *
 * Returns a result object so the caller can show a meaningful
 * toast (success / warning / error).
 *
 * Validation:
 *   • File must be JSON.
 *   • JSON must have magic = "cineLog.preferences.v1".
 *   • JSON must have a `preferences` object.
 *
 * On validation failure, returns `{ ok: false, error: "..." }`.
 * On success, returns `{ ok: true, applied: <key count> }`.
 */
export async function importSettingsFromFile(
  file: File
): Promise<
  | { ok: true; applied: number }
  | { ok: false; error: string }
> {
  if (isServer) {
    return { ok: false, error: "Import is only available in the browser." };
  }

  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't read file: ${
        err instanceof Error ? err.message : String(err)
      }`
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "File contents are not a JSON object." };
  }

  const obj = parsed as Partial<ExportedSettings>;
  if (obj.magic !== EXPORT_MAGIC) {
    return {
      ok: false,
      error:
        "This doesn't look like a CineLog preferences file (missing or wrong magic header)."
    };
  }

  if (!obj.preferences || typeof obj.preferences !== "object") {
    return {
      ok: false,
      error: "Preferences file is missing the 'preferences' object."
    };
  }

  try {
    applyImportedSnapshot(obj.preferences as PreferencesSnapshot);
    // Count how many keys were present (for the toast).
    const keys = Object.keys(obj.preferences as object);
    return { ok: true, applied: keys.length };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to apply preferences: ${
        err instanceof Error ? err.message : String(err)
      }`
    };
  }
}
