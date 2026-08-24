// src/shared/constants/settings.ts
//
// Single source of truth for static option lists used by the Settings UI
// (both the unified SettingsPage and the legacy /settings/* sub-routes).
//
// WHY THIS FILE EXISTS
// ────────────────────
// Before this module existed, every settings page re-declared its own copy
// of the option lists. The copies had drifted — `UI_LANGUAGES` had 13 entries
// in one file and 20 in another, with inconsistent descriptions and labels.
//
// This file consolidates the remaining independent Settings options. New code
// should import from here; adding a language or presentation option should
// require one change in this module. Theme identity is intentionally not an
// option: the Profile banner owns the consumer environment at runtime.
//
// Option types come from `~/core/preferences`, the canonical source for the
// signals that store independent user preferences.

import type {
  Density,
  FontSize,
  PosterQuality,
  DateFormat,
  ReducedMotionPref,
  VaultStatus,
  LanguageCode,
  DiscoverTab,
  RatingScale,
  FirstDayOfWeek,
  TimeFormat,
  CalendarView,
  NotificationPrefs,
  AmbientIntensity
} from "~/core/preferences";

// ────────────────────────────────────────────────────────────────────
// Appearance
// ────────────────────────────────────────────────────────────────────

export const DENSITY_OPTIONS: { id: Density; label: string }[] = [
  { id: "compact", label: "Compact" },
  { id: "comfortable", label: "Comfort" },
  { id: "spacious", label: "Spacious" }
];

export const FONT_SIZE_OPTIONS: { id: FontSize; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" }
];

export const POSTER_QUALITY_OPTIONS: { id: PosterQuality; label: string }[] = [
  { id: "high", label: "High" },
  { id: "medium", label: "Med" },
  { id: "low", label: "Low" },
  { id: "auto", label: "Auto" }
];

export const DATE_FORMAT_OPTIONS: {
  id: DateFormat;
  label: string;
  short: string;
  example: string;
}[] = [
  { id: "dmy", label: "DD/MM/YYYY", short: "D/M/Y", example: "15/07/2026" },
  { id: "mdy", label: "MM/DD/YYYY", short: "M/D/Y", example: "07/15/2026" },
  { id: "ymd", label: "YYYY-MM-DD", short: "Y-M-D", example: "2026-07-15" }
];

export const REDUCED_MOTION_OPTIONS: {
  id: ReducedMotionPref;
  label: string;
}[] = [
  { id: "off", label: "Off" },
  { id: "on", label: "On" },
  { id: "system", label: "System" }
];

// Phase 14 Chunk 2 — Ambient intensity (controls AmbientBackground blob
// opacity via the --ambient-intensity CSS var on <html>+<body>).
// Three curated levels — see src/core/preferences/ambientIntensity.ts.
export const AMBIENT_INTENSITY_OPTIONS: {
  id: AmbientIntensity;
  label: string;
}[] = [
  { id: "subtle", label: "Subtle" },
  { id: "normal", label: "Normal" },
  { id: "vibrant", label: "Vibrant" }
];

// ────────────────────────────────────────────────────────────────────
// Content & language
// ────────────────────────────────────────────────────────────────────

/**
 * Curated UI-language list — languages CineLog's UI is translated to
 * (or will be). For any other language, the UI stays English but TMDB
 * metadata is fetched in the chosen language.
 */
export const UI_LANGUAGES: {
  code: LanguageCode;
  label: string;
  native: string;
}[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "ru", label: "Russian", native: "Русский" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" }
];

export const VAULT_STATUS_OPTIONS: { id: VaultStatus; label: string }[] = [
  { id: "Planned", label: "Planned" },
  { id: "Plan to Watch", label: "Plan to Watch" },
  { id: "Watching", label: "Watching" },
  { id: "Completed", label: "Completed" },
  { id: "Dropped", label: "Dropped" }
];

export const DISCOVER_TAB_OPTIONS: { id: DiscoverTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "Series" }
];

export const RATING_SCALE_OPTIONS: { id: RatingScale; label: string }[] = [
  { id: "10star", label: "10-star" },
  { id: "5star", label: "5-star" },
  { id: "thumbs", label: "Thumbs" }
];

/**
 * Content rating options — depends on country. We show a union of US + India
 * ratings since those are the two most-used regions for CineLog.
 */
export const RATING_CAP_OPTIONS = [
  { value: "", label: "No cap — show everything" },
  { value: "G", label: "G (US) / U (IN) — General" },
  { value: "PG", label: "PG (US) / U/A — Parental Guidance" },
  { value: "PG-13", label: "PG-13 (US) / U/A 13+ — Teens" },
  { value: "UA-16", label: "U/A 16+ (IN) — Older Teens" },
  { value: "R", label: "R (US) / A (IN) — Adult" }
];

// ────────────────────────────────────────────────────────────────────
// Notifications
// ────────────────────────────────────────────────────────────────────

export interface NotifCategoryDef {
  key: keyof NotificationPrefs;
  label: string;
  desc: string;
  icon: string;
}

export const NOTIF_CATEGORIES: NotifCategoryDef[] = [
  {
    key: "newSeason",
    label: "New Season Available",
    desc: "When a series in your vault gets a new season.",
    icon: "new_releases"
  },
  {
    key: "continueWatching",
    label: "Continue Watching",
    desc: "Gentle reminders to resume in-progress titles.",
    icon: "play_circle"
  },
  {
    key: "weeklyRecap",
    label: "Weekly Recap",
    desc: "A summary of your watching activity each week.",
    icon: "insights"
  },
  {
    key: "recommendations",
    label: "Recommendations",
    desc: "When Discover has new picks based on your taste.",
    icon: "auto_awesome"
  },
  {
    key: "syncStatus",
    label: "Sync Status",
    desc: "When your data syncs or a sync error occurs.",
    icon: "sync"
  }
];

// ────────────────────────────────────────────────────────────────────
// Email notification categories (Phase 2 — Task 15)
// ────────────────────────────────────────────────────────────────────
//
// Mirrors NOTIF_CATEGORIES but with `email`-prefixed keys so each
// category's email toggle maps directly to its NotificationPrefs field.
// Used by the "Email Notifications" subsection of NotificationSection.
// The labels + descriptions are identical to the push equivalents so
// the UI reads naturally — the subsection header makes the channel
// clear ("Email Notifications"), so per-row descriptors don't need
// to repeat "via email".

export const EMAIL_NOTIF_CATEGORIES: NotifCategoryDef[] = [
  {
    key: "emailNewSeason",
    label: "New Season Available",
    desc: "Emailed when a series in your vault gets a new season.",
    icon: "new_releases"
  },
  {
    key: "emailContinueWatching",
    label: "Continue Watching",
    desc: "Emailed reminders to resume in-progress titles.",
    icon: "play_circle"
  },
  {
    key: "emailWeeklyRecap",
    label: "Weekly Recap",
    desc: "Emailed summary of your watching activity each week.",
    icon: "insights"
  },
  {
    key: "emailRecommendations",
    label: "Recommendations",
    desc: "Emailed when Discover has new picks based on your taste.",
    icon: "auto_awesome"
  },
  {
    key: "emailSyncStatus",
    label: "Sync Status",
    desc: "Emailed when your data syncs or a sync error occurs.",
    icon: "sync"
  }
];

export const LEAD_TIME_OPTIONS = [
  { id: 0, label: "Never" },
  { id: 5, label: "5 min" },
  { id: 15, label: "15 min" },
  { id: 30, label: "30 min" },
  { id: 60, label: "1 hour" },
  { id: 1440, label: "Day before" }
];

// ────────────────────────────────────────────────────────────────────
// Weekly Recap — day & time options
// ────────────────────────────────────────────────────────────────────
//
// Used by the Weekly Recap subsection of NotificationSection.
// The day value is an integer 0-6 (0=Sunday, 6=Saturday) matching
// the weeklyDigestDay field in NotificationPrefs.
// The time value is an "HH:MM" string matching weeklyDigestTime.
//
// NOTE: The actual delivery time depends on the pg_cron schedule
// (runs at 09:00 UTC every Monday by default). The per-user time
// preference is stored but currently informational — implementing
// per-user-time delivery would require running the cron hourly and
// filtering by time string, which adds complexity for little benefit
// on a weekly digest. The day-of-week preference IS respected.

export const WEEKLY_DIGEST_DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" }
];

export const WEEKLY_DIGEST_TIME_OPTIONS = [
  { value: "08:00", label: "08:00" },
  { value: "09:00", label: "09:00" },
  { value: "10:00", label: "10:00" },
  { value: "12:00", label: "12:00" },
  { value: "18:00", label: "18:00" },
  { value: "19:00", label: "19:00" },
  { value: "20:00", label: "20:00" }
];

// ────────────────────────────────────────────────────────────────────
// Calendar
// ────────────────────────────────────────────────────────────────────

export const FIRST_DAY_OPTIONS: { id: FirstDayOfWeek; label: string }[] = [
  { id: 0, label: "Sun" },
  { id: 1, label: "Mon" },
  { id: 6, label: "Sat" }
];

export const TIME_FORMAT_OPTIONS: { id: TimeFormat; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "12h", label: "12h" }
];

export const DEFAULT_VIEW_OPTIONS: { id: CalendarView; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "agenda", label: "Agenda" }
];

export const TZ_OPTIONS = [
  { value: "local", label: "My local time (auto)" },
  { value: "us-east", label: "US Eastern (ET) — Netflix/HBO default" },
  { value: "us-pacific", label: "US Pacific (PT) — Apple TV+ default" },
  { value: "utc", label: "UTC" }
];
