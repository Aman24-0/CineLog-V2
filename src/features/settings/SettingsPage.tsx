// src/features/settings/SettingsPage.tsx
//
// SettingsPage — the unified, single-page settings hub.
//
// LAYOUT:
//   Desktop (≥768px): Two-column grid.
//     • Left: sticky sidebar with section anchors + global search.
//     • Right: scrollable list of setting sections (accordions).
//   Mobile (<768px): Single column.
//     • Sticky search bar at top.
//     • Accordion sections (tap to expand).
//
// SECTIONS (6 + Danger Zone):
//   1. Account          — profile, email, password, 2FA, sessions
//   2. Appearance       — theme cards, accent swatches (incl Dynamic), density, font, poster, spoilers
//   3. Content & Language — language, region, date format, vault status, adult filter, rating cap, rating scale, discover tab, streaming providers
//   4. Notifications    — push, 5 categories, quiet hours, lead time
//   5. Calendar         — first day of week, time format, timezone, default view
//   6. Data & Sync      — cloud sync, cadence, import, export
//   7. Danger Zone      — reset library, delete account (DELETE confirm)
//
// SEARCH:
//   The search input filters sections by title, description, and
//   row labels. Matching sections auto-expand; non-matching sections
//   are hidden. Matching text is highlighted with <mark> tags.
//
// ACCORDION:
//   On mobile, each section is a collapsible. On desktop, sections
//   are also collapsible (the sidebar provides anchor navigation).
//
// All settings render INLINE — there is no sub-page navigation.

import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  For,
  Show,
  type Component,
  type JSX
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { signOut } from "~/shared/hooks/useAuthActions";
import { useProfile } from "~/lib/supabase/hooks/useProfile";
import { getClient as getSupabaseClient } from "~/lib/supabase/client";

// Existing settings components (2FA, sessions, login history)
import TwoFactorSetup from "~/features/settings/components/TwoFactorSetup";
import SessionList from "~/features/settings/components/SessionList";
import LoginHistoryList from "~/features/settings/components/LoginHistoryList";

// New visual picker components
import ThemeCard, { type ThemePreview } from "~/features/settings/components/ThemeCard";
import AccentSwatch from "~/features/settings/components/AccentSwatch";

// Shared controls (segmented, toggle, select, time)
import {
  Segmented,
  ControlRow,
  ToggleRow,
  SelectRow,
  TimeRow
} from "~/features/settings/sharedControls";

// Sync feature cards (cloud status, cadence, import, export, danger zone)
import CloudStatusCard from "~/features/sync/components/CloudStatusCard";
import SyncCadenceCard from "~/features/sync/components/SyncCadenceCard";
import ImportHub from "~/features/sync/components/ImportHub";
import CsvImportCard from "~/features/sync/components/CsvImportCard";
import BackupCards from "~/features/sync/components/BackupCards";
import CsvExportCard from "~/features/sync/components/CsvExportCard";
import DangerZoneCard from "~/features/sync/components/DangerZoneCard";

// Account sheets (email/password changes, deactivate, sign-out)
import UpdateEmailSheet from "~/features/account/components/UpdateEmailSheet";
import ChangePasswordSheet from "~/features/account/components/ChangePasswordSheet";
import DeactivateAccountSheet from "~/features/account/components/DeactivateAccountSheet";
import ConfirmSignOutSheet from "~/features/account/components/ConfirmSignOutSheet";
import LinkEmailPasswordSheet from "~/features/account/components/LinkEmailPasswordSheet";

// Theme + preferences
import { theme, setTheme } from "~/core/theme";
import type { Theme } from "~/core/theme";
import {
  themeMode,
  setThemeMode,
  customAccent,
  setCustomAccent,
  density,
  setDensity,
  fontSize,
  setFontSize,
  posterQuality,
  setPosterQuality,
  hideSpoilers,
  setHideSpoilers,
  dateFormat,
  setDateFormat,
  reducedMotion,
  setReducedMotion,
  highContrast,
  setHighContrast,
  language,
  setLanguage,
  fallbackLanguage,
  setFallbackLanguage,
  defaultVaultStatus,
  setDefaultVaultStatus,
  adultContentFilter,
  setAdultContentFilter,
  contentRatingCap,
  setContentRatingCap,
  streamingProviders,
  toggleStreamingProvider,
  defaultDiscoverTab,
  setDefaultDiscoverTab,
  ratingScale,
  setRatingScale,
  notifPrefs,
  updateNotifPref,
  calPrefs,
  updateCalPref,
  hideRatingsInScreenshots,
  setHideRatingsInScreenshots,
  type ThemeMode,
  type Density,
  type FontSize,
  type PosterQuality,
  type DateFormat,
  type ReducedMotionPref,
  type VaultStatus,
  type LanguageCode,
  type DiscoverTab,
  type RatingScale,
  type FirstDayOfWeek,
  type TimeFormat,
  type CalendarView,
  type CalendarPrefs,
  type NotificationPrefs
} from "~/core/preferences";

import { setDiscoverRegion, useDiscoverRegion } from "~/core/config/discoverRegion";
import {
  COUNTRIES,
  countryLabel
} from "~/shared/data/countryLanguages";
import {
  getWatchProviderList,
  getWatchProviderListTv
} from "~/core/tmdb/discover";
import { mergeAndSortProviders, type TmdbProvider } from "~/core/preferences";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { extractDominantColor } from "~/shared/utils/colorExtractor";

// ────────────────────────────────────────────────────────────────────
// Static option lists
// ────────────────────────────────────────────────────────────────────

const THEMES_LIST: { id: Theme; name: string; desc: string; swatch: string }[] = [
  { id: "sage", name: "Sage", desc: "Soft green", swatch: "#a8ff78" },
  { id: "matrix", name: "Neon Green", desc: "Default", swatch: "#39ff14" },
  { id: "netflix", name: "Crimson", desc: "Bold red", swatch: "#ff2d55" },
  { id: "interstellar", name: "Interstellar", desc: "Deep blue", swatch: "#00c2ff" },
  { id: "neonhorizon", name: "Neon Horizon", desc: "Pink + cyan", swatch: "#ff2af0" },
  { id: "vibranium", name: "Vibranium", desc: "Purple", swatch: "#9d4edd" },
  { id: "cinematic", name: "Cinematic", desc: "Gold", swatch: "#FFD700" },
  { id: "pearl", name: "Pearl", desc: "Minimal white", swatch: "#ffffff" }
];

const THEME_MODE_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" }
];

const THEME_MODE_PREVIEWS: Record<ThemeMode, ThemePreview> = {
  dark: {
    bg: "#0a0a0c",
    surface: "#1a1a1f",
    text: "#e4e4e7",
    accent: "var(--p)"
  },
  light: {
    bg: "#f5f5f7",
    surface: "#ffffff",
    text: "#1a1a1f",
    accent: "var(--p)"
  },
  system: {
    bg: "linear-gradient(135deg, #0a0a0c 0%, #0a0a0c 50%, #f5f5f7 50%, #f5f5f7 100%)",
    surface: "linear-gradient(135deg, #1a1a1f 0%, #1a1a1f 50%, #ffffff 50%, #ffffff 100%)",
    text: "linear-gradient(135deg, #e4e4e7 0%, #1a1a1f 100%)",
    accent: "var(--p)"
  }
};

const DENSITY_OPTIONS: { id: Density; label: string }[] = [
  { id: "compact", label: "Compact" },
  { id: "comfortable", label: "Comfort" },
  { id: "spacious", label: "Spacious" }
];

const FONT_SIZE_OPTIONS: { id: FontSize; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" }
];

const POSTER_QUALITY_OPTIONS: { id: PosterQuality; label: string }[] = [
  { id: "high", label: "High" },
  { id: "medium", label: "Med" },
  { id: "low", label: "Low" },
  { id: "auto", label: "Auto" }
];

const DATE_FORMAT_OPTIONS: { id: DateFormat; label: string; short: string }[] = [
  { id: "dmy", label: "DD/MM/YYYY", short: "D/M/Y" },
  { id: "mdy", label: "MM/DD/YYYY", short: "M/D/Y" },
  { id: "ymd", label: "YYYY-MM-DD", short: "Y-M-D" }
];

const REDUCED_MOTION_OPTIONS: { id: ReducedMotionPref; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "on", label: "On" },
  { id: "system", label: "System" }
];

const UI_LANGUAGES: { code: LanguageCode; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "bn", label: "Bengali", native: "বাংলা" }
];

const VAULT_STATUS_OPTIONS: { id: VaultStatus; label: string }[] = [
  { id: "Planned", label: "Planned" },
  { id: "Watching", label: "Watching" },
  { id: "Completed", label: "Completed" },
  { id: "Dropped", label: "Dropped" }
];

const DISCOVER_TAB_OPTIONS: { id: DiscoverTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "Series" }
];

const RATING_SCALE_OPTIONS: { id: RatingScale; label: string }[] = [
  { id: "10star", label: "10-star" },
  { id: "5star", label: "5-star" },
  { id: "thumbs", label: "Thumbs" }
];

const RATING_CAP_OPTIONS = [
  { value: "", label: "No cap — show everything" },
  { value: "G", label: "G / U — General" },
  { value: "PG", label: "PG / U/A — Parental Guidance" },
  { value: "PG-13", label: "PG-13 / U/A 13+ — Teens" },
  { value: "UA-16", label: "U/A 16+ — Older Teens" },
  { value: "R", label: "R / A — Adult" }
];

const NOTIF_CATEGORIES: {
  key: keyof NotificationPrefs;
  label: string;
  desc: string;
  icon: string;
}[] = [
  { key: "newSeason", label: "New Season", desc: "Series in your vault gets a new season.", icon: "new_releases" },
  { key: "continueWatching", label: "Continue Watching", desc: "Resume in-progress titles.", icon: "play_circle" },
  { key: "weeklyRecap", label: "Weekly Recap", desc: "Summary of your activity.", icon: "insights" },
  { key: "recommendations", label: "Recommendations", desc: "New picks based on your taste.", icon: "auto_awesome" },
  { key: "syncStatus", label: "Sync Status", desc: "When your data syncs.", icon: "sync" }
];

const LEAD_TIME_OPTIONS = [
  { id: 0, label: "Never" },
  { id: 5, label: "5 min" },
  { id: 15, label: "15 min" },
  { id: 30, label: "30 min" },
  { id: 60, label: "1 hour" },
  { id: 1440, label: "1 day" }
];

const FIRST_DAY_OPTIONS: { id: FirstDayOfWeek; label: string }[] = [
  { id: 0, label: "Sun" },
  { id: 1, label: "Mon" },
  { id: 6, label: "Sat" }
];

const TIME_FORMAT_OPTIONS: { id: TimeFormat; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "12h", label: "12h" }
];

const DEFAULT_VIEW_OPTIONS: { id: CalendarView; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "agenda", label: "Agenda" }
];

const TZ_OPTIONS = [
  { value: "local", label: "My local time (auto)" },
  { value: "us-east", label: "US Eastern (ET)" },
  { value: "us-pacific", label: "US Pacific (PT)" },
  { value: "utc", label: "UTC" }
];

// ────────────────────────────────────────────────────────────────────
// Section metadata — used for sidebar nav + search
// ────────────────────────────────────────────────────────────────────

interface SectionMeta {
  id: string;
  title: string;
  desc: string;
  icon: string;
  // Searchable keywords — joined into the search filter
  keywords: string[];
}

const SECTIONS: SectionMeta[] = [
  {
    id: "account",
    title: "Account",
    desc: "Profile, security, 2FA, sessions",
    icon: "manage_accounts",
    keywords: [
      "name", "email", "password", "oauth", "google", "apple",
      "2fa", "two-factor", "authenticator", "session", "device", "sign out",
      "login history", "security"
    ]
  },
  {
    id: "appearance",
    title: "Appearance",
    desc: "Theme, accent, density, font",
    icon: "palette",
    keywords: [
      "dark", "light", "system", "accent", "color", "sage", "neon",
      "crimson", "gold", "dynamic", "density", "compact", "spacious",
      "font size", "poster quality", "spoilers", "animations", "contrast"
    ]
  },
  {
    id: "content",
    title: "Content & Language",
    desc: "Language, region, filters, ratings",
    icon: "tune",
    keywords: [
      "language", "fallback", "country", "region", "date format",
      "vault status", "planned", "watching", "completed", "dropped",
      "adult", "rating cap", "certification", "rating scale", "star",
      "thumbs", "discover", "tab", "streaming", "provider", "netflix",
      "prime", "disney", "hotstar"
    ]
  },
  {
    id: "notifications",
    title: "Notifications",
    desc: "Push, categories, quiet hours",
    icon: "notifications",
    keywords: [
      "push", "permission", "new season", "continue watching",
      "weekly recap", "recommendations", "sync", "quiet hours",
      "reminder", "lead time", "digest"
    ]
  },
  {
    id: "calendar",
    title: "Calendar",
    desc: "Week, time format, timezone",
    icon: "calendar_month",
    keywords: [
      "first day", "week", "sunday", "monday", "saturday",
      "12-hour", "24-hour", "timezone", "default view", "agenda", "month"
    ]
  },
  {
    id: "sync",
    title: "Data & Sync",
    desc: "Cloud, import, export, backup",
    icon: "sync",
    keywords: [
      "cloud", "sync", "cadence", "real-time", "wifi", "manual",
      "import", "json", "csv", "letterboxd", "trakt", "imdb", "tv time",
      "export", "backup"
    ]
  }
];

const DANGER_ZONE_META: SectionMeta = {
  id: "danger",
  title: "Danger Zone",
  desc: "Reset library, delete account",
  icon: "warning",
  keywords: ["reset", "delete", "deactivate", "remove", "destroy", "erase"]
};

// ────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────

const SettingsPage: Component = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const profileRepo = useProfile();
  const { showToast } = useToast();
  const region = useDiscoverRegion();

  // ── Search + accordion state ────────────────────────────────────
  const [query, setQuery] = createSignal("");
  const [expanded, setExpanded] = createSignal<Set<string>>(
    new Set(["account"])
  );

  // ── Account state ────────────────────────────────────────────────
  const [hasPassword, setHasPassword] = createSignal<boolean>(false);
  const [country, setCountry] = createSignal<string>("US");
  const [displayName, setDisplayName] = createSignal<string>("");
  const [bio, setBio] = createSignal<string>("");
  const [bannerUrl, setBannerUrl] = createSignal<string | null>(null);
  const [editingProfile, setEditingProfile] = createSignal(false);
  const [savingProfile, setSavingProfile] = createSignal(false);
  const [nameInput, setNameInput] = createSignal("");
  const [bioInput, setBioInput] = createSignal("");
  const [showEmailSheet, setShowEmailSheet] = createSignal(false);
  const [showPasswordSheet, setShowPasswordSheet] = createSignal(false);
  const [showLinkEmailPasswordSheet, setShowLinkEmailPasswordSheet] =
    createSignal(false);
  const [showDeactivateSheet, setShowDeactivateSheet] = createSignal(false);
  const [deactivateMode, setDeactivateMode] = createSignal<
    "deactivate" | "delete"
  >("deactivate");
  const [showSignOutSheet, setShowSignOutSheet] = createSignal(false);
  const [show2FAPanel, setShow2FAPanel] = createSignal(false);
  const [showSessionsPanel, setShowSessionsPanel] = createSignal(false);
  const [showLoginHistoryPanel, setShowLoginHistoryPanel] = createSignal(false);

  // ── Appearance state ─────────────────────────────────────────────
  const [dynamicAccentColor, setDynamicAccentColor] = createSignal<string>("");
  const [extractingColor, setExtractingColor] = createSignal(false);

  // ── Content state ────────────────────────────────────────────────
  const [providers, setProviders] = createSignal<TmdbProvider[]>([]);
  const [providersLoading, setProvidersLoading] = createSignal(true);

  // ── Notifications state ──────────────────────────────────────────
  const [pushPermission, setPushPermission] = createSignal<
    NotificationPermission | "unsupported"
  >("default");

  // ── Initial data loading ────────────────────────────────────────
  onMount(() => {
    void refreshHasPassword();
    void loadProfile();
    void loadProviders(region());

    if (typeof Notification === "undefined") {
      setPushPermission("unsupported");
    } else {
      setPushPermission(Notification.permission);
    }
  });

  // Re-fetch providers when the region changes.
  createEffect(() => {
    const r = region();
    void loadProviders(r);
  });

  // ── Account handlers ────────────────────────────────────────────

  /**
   * Refresh whether the user has a password set on their account.
   *
   * `user().providers` is cached in app_metadata and can lag behind a
   * fresh password-link. Calling supabase.auth.getUser() forces a fresh
   * fetch and lets us check the providers list AND whether the user has
   * a password set.
   *
   * Supabase adds "email" to app_metadata.providers as soon as a
   * password is linked, so we just check the fresh providers list.
   */
  async function refreshHasPassword() {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.getUser();
      if (error) return; // keep cached value on error
      const providers: string[] = data?.user?.app_metadata?.providers ?? [];
      setHasPassword(providers.includes("email"));
    } catch (e) {
      console.warn("[settings] refreshHasPassword failed:", e);
    }
  }

  async function loadProfile() {
    const uid = user()?.uid;
    if (!uid) return;
    try {
      const res = await profileRepo.getProfile(uid);
      if (res.data) {
        if (res.data.country) {
          setCountry(res.data.country);
          setDiscoverRegion(res.data.country);
        }
        if (res.data.display_name) setDisplayName(res.data.display_name);
        if (res.data.bio) setBio(res.data.bio);
        if (res.data.banner_url) setBannerUrl(res.data.banner_url);
      }
    } catch (e) {
      console.warn("[settings] loadProfile failed:", e);
    }
  }

  async function loadProviders(reg: string) {
    setProvidersLoading(true);
    try {
      const [movieRes, tvRes] = await Promise.allSettled([
        getWatchProviderList(reg),
        getWatchProviderListTv(reg)
      ]);
      const movieRows = movieRes.status === "fulfilled" ? movieRes.value : [];
      const tvRows = tvRes.status === "fulfilled" ? tvRes.value : [];
      setProviders(mergeAndSortProviders(movieRows, tvRows));
    } catch (err) {
      console.warn("[settings] Failed to load providers:", err);
      setProviders([]);
    } finally {
      setProvidersLoading(false);
    }
  }

  const handleSaveCountry = async (newCountry: string) => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to save your country.", "error");
      return;
    }
    setCountry(newCountry);
    try {
      const { error } = await profileRepo.updateProfile(uid, {
        country: newCountry
      });
      if (error) throw error;
      setDiscoverRegion(newCountry);
      showToast(`Country set to ${countryLabel(newCountry)}`, "success", 1800);
    } catch (err) {
      console.error("[settings] Failed to save country:", err);
      showToast("Failed to save country.", "error");
    }
  };

  const handleStartEditProfile = () => {
    setNameInput(displayName() || user()?.displayName || "");
    setBioInput(bio());
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to save your profile.", "error");
      return;
    }
    const trimmedName = nameInput().trim();
    if (!trimmedName) {
      showToast("Name can't be empty.", "error");
      return;
    }
    setSavingProfile(true);
    try {
      const { error } = await profileRepo.updateProfile(uid, {
        displayName: trimmedName,
        bio: bioInput().trim()
      });
      if (error) throw error;
      setDisplayName(trimmedName);
      setBio(bioInput().trim());
      setEditingProfile(false);
      showToast("Profile saved.", "success", 1500);
    } catch (err) {
      console.error("[settings] Failed to save profile:", err);
      showToast("Failed to save profile.", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelEditProfile = () => {
    setEditingProfile(false);
    setNameInput(displayName());
    setBioInput(bio());
  };

  const handleSignOut = () => setShowSignOutSheet(true);

  const handleConfirmSignOut = async () => {
    await signOut();
    navigate("/discover");
  };

  const handleDeactivate = () => {
    setDeactivateMode("deactivate");
    setShowDeactivateSheet(true);
  };

  const handleDelete = () => {
    setDeactivateMode("delete");
    setShowDeactivateSheet(true);
  };

  // ── Appearance: accent + dynamic ────────────────────────────────

  const isPresetActive = (presetId: Theme): boolean =>
    customAccent() === "" && theme() === presetId;

  /**
   * The "Dynamic" swatch is active when:
   *   - We've extracted a color from the banner (dynamicAccentColor is set)
   *   - customAccent() matches that extracted color
   *
   * If the user switches to a preset (which clears customAccent to ""),
   * dynamic is no longer active. If they re-extract (banner changed),
   * the new color overwrites the old.
   */
  const isDynamicActive = (): boolean =>
    dynamicAccentColor() !== "" &&
    customAccent() === dynamicAccentColor();

  const handlePresetClick = (presetId: Theme) => {
    setCustomAccent("");
    setTheme(presetId);
  };

  /**
   * Handle "Dynamic" accent swatch click.
   *
   * If we already have a dynamicAccentColor cached and it's the active
   * accent, do nothing (already active). Otherwise extract from the
   * banner (or fall back to Gold if no banner).
   */
  const handleDynamicClick = async () => {
    if (isDynamicActive()) {
      // Already the active accent — no-op.
      return;
    }

    // If we have a cached dynamic color from a previous extraction,
    // re-apply it without re-extracting.
    if (dynamicAccentColor()) {
      setCustomAccent(dynamicAccentColor());
      return;
    }

    setExtractingColor(true);
    try {
      const url = bannerUrl();
      if (!url) {
        // No banner — use Gold (matches Cinematic preset).
        const fallback = "#FFD700";
        setDynamicAccentColor(fallback);
        setCustomAccent(fallback);
        showToast("No banner set — using Gold accent.", "info", 1800);
        return;
      }

      const color = await extractDominantColor(url);
      setDynamicAccentColor(color);
      setCustomAccent(color);
      showToast(`Dynamic accent set: ${color}`, "success", 1800);
    } catch (e) {
      console.error("[settings] Dynamic accent extraction failed:", e);
      showToast("Couldn't extract banner color. Try another image.", "error");
    } finally {
      setExtractingColor(false);
    }
  };

  // ── Notifications handlers ──────────────────────────────────────

  const requestPushPermission = async () => {
    if (typeof Notification === "undefined") {
      showToast("Push notifications not supported in this browser.", "error");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm === "granted") {
        showToast("Push notifications enabled.", "success");
        new Notification("CineLog notifications enabled", {
          body: "You'll now get reminders for new seasons and weekly recaps."
        });
      } else if (perm === "denied") {
        showToast("Push notifications blocked by browser.", "error");
      }
    } catch (e) {
      console.error("[settings] Push permission failed:", e);
      showToast("Could not request push permission.", "error");
    }
  };

  const handleCategoryToggle = (
    key: keyof NotificationPrefs,
    value: boolean
  ) => {
    updateNotifPref(key, value);
    if (value && pushPermission() === "default") {
      void requestPushPermission();
    }
  };

  // ── Content: streaming providers ────────────────────────────────

  const handleToggleProvider = (provider: TmdbProvider) => {
    toggleStreamingProvider(provider.id);
  };

  // ── Derived display values ──────────────────────────────────────

  const joinDate = (): string => {
    const created = user()?.createdAt;
    if (!created) return "Unknown";
    try {
      return new Date(created).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } catch {
      return "Unknown";
    }
  };

  const emailDisplay = (): string => user()?.email ?? "Not set";
  const nameDisplay = (): string =>
    displayName() || user()?.displayName || "Not set";

  const countryOptions = createMemo(() =>
    COUNTRIES.map((c) => ({ value: c.code, label: c.label }))
  );

  const languageOptions = createMemo(() =>
    UI_LANGUAGES.map((l) => ({
      value: l.code,
      label: `${l.native} (${l.label})`
    }))
  );

  const fallbackOptions = createMemo(() =>
    UI_LANGUAGES.filter((l) => l.code !== language()).map((l) => ({
      value: l.code,
      label: `${l.native} (${l.label})`
    }))
  );

  const activeProviderCount = createMemo(() => streamingProviders().length);

  // ── Search filter ────────────────────────────────────────────────

  const filteredSections = createMemo<SectionMeta[]>(() => {
    const q = query().trim().toLowerCase();
    const all = [...SECTIONS, DANGER_ZONE_META];
    if (!q) return all;

    const matchSection = (s: SectionMeta) => {
      if (s.title.toLowerCase().includes(q)) return true;
      if (s.desc.toLowerCase().includes(q)) return true;
      return s.keywords.some((k) => k.toLowerCase().includes(q));
    };

    return all.filter(matchSection);
  });

  function toggleSection(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isExpanded(id: string): boolean {
    if (query().trim().length > 0) {
      // When searching, expand all matching sections.
      return filteredSections().some((s) => s.id === id);
    }
    return expanded().has(id);
  }

  function scrollToSection(id: string) {
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("settings-section-highlight");
      setTimeout(() => el.classList.remove("settings-section-highlight"), 1500);
    }
  }

  function handleSidebarClick(id: string) {
    if (!isExpanded(id)) toggleSection(id);
    setTimeout(() => scrollToSection(id), 50);
  }

  // Highlight matched text in section titles/descriptions.
  const highlightText = (text: string): JSX.Element => {
    const q = query().trim();
    if (!q) return <>{text}</>;
    const lower = text.toLowerCase();
    const ql = q.toLowerCase();
    const idx = lower.indexOf(ql);
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark class="settings-search-mark">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  // ── Render helpers ───────────────────────────────────────────────

  const renderSegmented = <T extends string | number>(
    options: { id: T; label: string; short?: string }[],
    current: () => T,
    onChange: (id: T) => void,
    name: string
  ) => (
    <Segmented
      options={options}
      current={current}
      onChange={onChange}
      name={name}
    />
  );

  // ── Render ───────────────────────────────────────────────────────

  return (
    <>
      <Title>CineLog — Settings</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <ScrollToTop />
        <div class="sec-page sec-fade-in">
          {/* Header */}
          <div class="sec-header">
            <a
              href="/profile"
              class="sec-back focus-ring"
              aria-label="Back to profile"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "14px" }}
                aria-hidden="true"
              >
                arrow_back
              </span>
              Profile
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Preferences</h1>
            <p class="sec-subtitle">
              Account, appearance, content, sync, and more — all in one place.
            </p>
          </div>

          {/* Search bar — sticky on mobile, inline on desktop */}
          <div class="settings-search-wrapper">
            <div class="settings-search">
              <span
                class="material-symbols-outlined settings-search-icon"
                aria-hidden="true"
              >
                search
              </span>
              <input
                type="search"
                class="settings-search-input focus-ring"
                placeholder="Search settings…"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                aria-label="Search settings"
              />
              <Show when={query()}>
                <button
                  type="button"
                  class="settings-search-clear focus-ring"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
              </Show>
            </div>
          </div>

          {/* Two-column layout: sidebar (desktop) + sections */}
          <div class="settings-layout">
            {/* Sidebar — desktop only */}
            <aside class="settings-sidebar" aria-label="Settings sections">
              <nav>
                <ul class="settings-sidebar-list">
                  <For each={[...SECTIONS, DANGER_ZONE_META]}>
                    {(s) => (
                      <li>
                        <button
                          type="button"
                          class="settings-sidebar-link focus-ring"
                          data-danger={s.id === "danger"}
                          onClick={() => handleSidebarClick(s.id)}
                        >
                          <span
                            class="material-symbols-outlined settings-sidebar-icon"
                            aria-hidden="true"
                          >
                            {s.icon}
                          </span>
                          <span class="settings-sidebar-label">{s.title}</span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </nav>
            </aside>

            {/* Sections — accordion on mobile, expanded on desktop */}
            <div class="settings-content">
              <Show
                when={filteredSections().length > 0}
                fallback={
                  <div class="settings-search-empty">
                    <span
                      class="material-symbols-outlined"
                      aria-hidden="true"
                      style={{ "font-size": "40px", color: "var(--text-soft)" }}
                    >
                      search_off
                    </span>
                    <p>No settings match "{query()}"</p>
                    <button
                      type="button"
                      class="btn-ghost focus-ring"
                      onClick={() => setQuery("")}
                    >
                      Clear search
                    </button>
                  </div>
                }
              >
                {/* =========================================================== */}
                {/* 1. ACCOUNT                                                   */}
                {/* =========================================================== */}
                <Show when={filteredSections().some((s) => s.id === "account")}>
                  <section
                    id="section-account"
                    class="settings-accordion-section"
                  >
                    <button
                      type="button"
                      class="settings-accordion-header focus-ring"
                      onClick={() => toggleSection("account")}
                      aria-expanded={isExpanded("account")}
                      aria-controls="panel-account"
                    >
                      <span
                        class="material-symbols-outlined settings-accordion-icon"
                        aria-hidden="true"
                      >
                        manage_accounts
                      </span>
                      <div class="settings-accordion-meta">
                        <span class="settings-accordion-title">
                          {highlightText("Account")}
                        </span>
                        <span class="settings-accordion-desc">
                          {highlightText("Profile, security, 2FA, sessions")}
                        </span>
                      </div>
                      <span
                        class="material-symbols-outlined settings-accordion-chevron"
                        aria-hidden="true"
                        style={{
                          transform: isExpanded("account")
                            ? "rotate(180deg)"
                            : "none",
                          transition: "transform 200ms ease"
                        }}
                      >
                        expand_more
                      </span>
                    </button>

                    <Show when={isExpanded("account")}>
                      <div id="panel-account" class="settings-accordion-panel">
                        <div class="setting-group">
                          {/* Profile row — opens inline edit */}
                          <Show when={isSignedIn()}>
                            {/* Display name + bio — inline editable */}
                            <Show
                              when={!editingProfile()}
                              fallback={
                                <div
                                  class="setting-row"
                                  style={{
                                    cursor: "default",
                                    "flex-direction": "column",
                                    "align-items": "stretch",
                                    gap: "var(--sp-2)"
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      "align-items": "center",
                                      gap: "var(--sp-3)"
                                    }}
                                  >
                                    <div
                                      class="setting-row-icon"
                                      aria-hidden="true"
                                    >
                                      <span
                                        class="material-symbols-outlined"
                                        style={{ "font-size": "18px" }}
                                        aria-hidden="true"
                                      >
                                        person
                                      </span>
                                    </div>
                                    <div
                                      class="setting-row-text"
                                      style={{ flex: 1, "min-width": 0 }}
                                    >
                                      <span class="setting-row-label">
                                        Profile
                                      </span>
                                      <span class="setting-row-desc">
                                        Name, bio, and avatar.
                                      </span>
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      "flex-direction": "column",
                                      gap: "var(--sp-2)",
                                      padding: "0 var(--sp-3)"
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={nameInput()}
                                      onInput={(e) =>
                                        setNameInput(e.currentTarget.value)
                                      }
                                      placeholder="Display name"
                                      maxlength={60}
                                      class="custom-hex-input focus-ring"
                                      aria-label="Display name"
                                    />
                                    <textarea
                                      value={bioInput()}
                                      onInput={(e) =>
                                        setBioInput(e.currentTarget.value)
                                      }
                                      placeholder="Bio (optional)"
                                      maxlength={160}
                                      rows={2}
                                      class="custom-hex-input focus-ring"
                                      style={{
                                        resize: "vertical",
                                        "font-family": "'Outfit', sans-serif"
                                      }}
                                      aria-label="Bio"
                                    />
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "var(--sp-2)"
                                      }}
                                    >
                                      <button
                                        type="button"
                                        class="settings-link-btn focus-ring"
                                        onClick={() => void handleSaveProfile()}
                                        disabled={savingProfile()}
                                      >
                                        <Show
                                          when={!savingProfile()}
                                          fallback="Saving…"
                                        >
                                          Save
                                        </Show>
                                      </button>
                                      <button
                                        type="button"
                                        class="settings-link-btn focus-ring"
                                        onClick={handleCancelEditProfile}
                                        disabled={savingProfile()}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              }
                            >
                              <button
                                type="button"
                                class="setting-row focus-ring"
                                onClick={handleStartEditProfile}
                                aria-label="Edit profile"
                              >
                                <div
                                  class="setting-row-icon"
                                  aria-hidden="true"
                                >
                                  <span
                                    class="material-symbols-outlined"
                                    style={{ "font-size": "18px" }}
                                    aria-hidden="true"
                                  >
                                    person
                                  </span>
                                </div>
                                <div class="setting-row-text">
                                  <span class="setting-row-label">Profile</span>
                                  <span class="setting-row-desc">
                                    {nameDisplay()}
                                  </span>
                                </div>
                                <span
                                  class="material-symbols-outlined setting-row-chevron"
                                  aria-hidden="true"
                                >
                                  edit
                                </span>
                              </button>
                            </Show>

                            {/* Email */}
                            <button
                              type="button"
                              class="setting-row focus-ring"
                              onClick={() => setShowEmailSheet(true)}
                              aria-label="Update email"
                            >
                              <div
                                class="setting-row-icon"
                                aria-hidden="true"
                              >
                                <span
                                  class="material-symbols-outlined"
                                  style={{ "font-size": "18px" }}
                                  aria-hidden="true"
                                >
                                  mail
                                </span>
                              </div>
                              <div class="setting-row-text">
                                <span class="setting-row-label">Email</span>
                                <span class="setting-row-desc">
                                  {emailDisplay()}
                                </span>
                              </div>
                              <span
                                class="material-symbols-outlined setting-row-chevron"
                                aria-hidden="true"
                              >
                                chevron_right
                              </span>
                            </button>

                            {/* Password — "Connected" or "Not set" */}
                            <button
                              type="button"
                              class="setting-row focus-ring"
                              onClick={() =>
                                hasPassword()
                                  ? setShowPasswordSheet(true)
                                  : setShowLinkEmailPasswordSheet(true)
                              }
                              aria-label="Password settings"
                            >
                              <div
                                class="setting-row-icon"
                                aria-hidden="true"
                              >
                                <span
                                  class="material-symbols-outlined"
                                  style={{ "font-size": "18px" }}
                                  aria-hidden="true"
                                >
                                  lock
                                </span>
                              </div>
                              <div class="setting-row-text">
                                <span class="setting-row-label">Password</span>
                                <span class="setting-row-desc">
                                  {hasPassword() ? "Connected" : "Not set"}
                                </span>
                              </div>
                              <span
                                class="setting-row-value"
                                style={{
                                  color: hasPassword()
                                    ? "#4ade80"
                                    : "var(--text-muted)"
                                }}
                              >
                                {hasPassword() ? "Connected" : "Set"}
                              </span>
                            </button>

                            {/* Country — inline select */}
                            <SelectRow
                              icon="public"
                              label="Country"
                              desc="Affects Discover and Where-to-Watch."
                              value={country}
                              onChange={handleSaveCountry}
                              options={countryOptions()}
                            />

                            {/* Joined — read-only */}
                            <div
                              class="setting-row"
                              style={{ cursor: "default" }}
                            >
                              <div
                                class="setting-row-icon"
                                aria-hidden="true"
                              >
                                <span
                                  class="material-symbols-outlined"
                                  style={{ "font-size": "18px" }}
                                  aria-hidden="true"
                                >
                                  event
                                </span>
                              </div>
                              <div class="setting-row-text">
                                <span class="setting-row-label">Joined</span>
                                <span class="setting-row-desc">
                                  {joinDate()}
                                </span>
                              </div>
                            </div>

                            {/* 2FA */}
                            <button
                              type="button"
                              class="setting-row focus-ring"
                              onClick={() =>
                                setShow2FAPanel(!show2FAPanel())
                              }
                              aria-expanded={show2FAPanel()}
                              aria-label="Two-factor authentication"
                            >
                              <div
                                class="setting-row-icon"
                                aria-hidden="true"
                              >
                                <span
                                  class="material-symbols-outlined"
                                  style={{ "font-size": "18px" }}
                                  aria-hidden="true"
                                >
                                  phonelink_lock
                                </span>
                              </div>
                              <div class="setting-row-text">
                                <span class="setting-row-label">
                                  Two-factor authentication
                                </span>
                                <span class="setting-row-desc">
                                  Extra security at sign-in.
                                </span>
                              </div>
                              <span
                                class="material-symbols-outlined setting-row-chevron"
                                aria-hidden="true"
                                style={{
                                  transform: show2FAPanel()
                                    ? "rotate(180deg)"
                                    : "none",
                                  transition: "transform 200ms ease"
                                }}
                              >
                                expand_more
                              </span>
                            </button>
                            <Show when={show2FAPanel()}>
                              <div class="settings-expandable-panel">
                                <TwoFactorSetup />
                              </div>
                            </Show>

                            {/* Sessions & devices */}
                            <button
                              type="button"
                              class="setting-row focus-ring"
                              onClick={() =>
                                setShowSessionsPanel(!showSessionsPanel())
                              }
                              aria-expanded={showSessionsPanel()}
                              aria-label="Sessions and devices"
                            >
                              <div
                                class="setting-row-icon"
                                aria-hidden="true"
                              >
                                <span
                                  class="material-symbols-outlined"
                                  style={{ "font-size": "18px" }}
                                  aria-hidden="true"
                                >
                                  devices
                                </span>
                              </div>
                              <div class="setting-row-text">
                                <span class="setting-row-label">
                                  Sessions &amp; devices
                                </span>
                                <span class="setting-row-desc">
                                  Sign out everywhere.
                                </span>
                              </div>
                              <span
                                class="material-symbols-outlined setting-row-chevron"
                                aria-hidden="true"
                                style={{
                                  transform: showSessionsPanel()
                                    ? "rotate(180deg)"
                                    : "none",
                                  transition: "transform 200ms ease"
                                }}
                              >
                                expand_more
                              </span>
                            </button>
                            <Show when={showSessionsPanel()}>
                              <div class="settings-expandable-panel">
                                <SessionList />
                              </div>
                            </Show>

                            {/* Login history */}
                            <button
                              type="button"
                              class="setting-row focus-ring"
                              onClick={() =>
                                setShowLoginHistoryPanel(
                                  !showLoginHistoryPanel()
                                )
                              }
                              aria-expanded={showLoginHistoryPanel()}
                              aria-label="Login history"
                            >
                              <div
                                class="setting-row-icon"
                                aria-hidden="true"
                              >
                                <span
                                  class="material-symbols-outlined"
                                  style={{ "font-size": "18px" }}
                                  aria-hidden="true"
                                >
                                  history
                                </span>
                              </div>
                              <div class="setting-row-text">
                                <span class="setting-row-label">
                                  Login history
                                </span>
                                <span class="setting-row-desc">
                                  Recent sign-ins.
                                </span>
                              </div>
                              <span
                                class="material-symbols-outlined setting-row-chevron"
                                aria-hidden="true"
                                style={{
                                  transform: showLoginHistoryPanel()
                                    ? "rotate(180deg)"
                                    : "none",
                                  transition: "transform 200ms ease"
                                }}
                              >
                                expand_more
                              </span>
                            </button>
                            <Show when={showLoginHistoryPanel()}>
                              <div class="settings-expandable-panel">
                                <LoginHistoryList />
                              </div>
                            </Show>

                            {/* Sign out (this device only) */}
                            <button
                              type="button"
                              class="setting-row focus-ring setting-row-danger"
                              onClick={handleSignOut}
                              aria-label="Sign out of this device"
                            >
                              <div
                                class="setting-row-icon"
                                aria-hidden="true"
                              >
                                <span
                                  class="material-symbols-outlined"
                                  style={{ "font-size": "18px" }}
                                  aria-hidden="true"
                                >
                                  logout
                                </span>
                              </div>
                              <div class="setting-row-text">
                                <span class="setting-row-label">Sign out</span>
                                <span class="setting-row-desc">
                                  End your session on this device.
                                </span>
                              </div>
                              <span
                                class="material-symbols-outlined setting-row-chevron"
                                aria-hidden="true"
                              >
                                chevron_right
                              </span>
                            </button>
                          </Show>

                          <Show when={!isSignedIn()}>
                            <div
                              class="settings-empty-section"
                              role="status"
                            >
                              <span
                                class="material-symbols-outlined"
                                aria-hidden="true"
                                style={{
                                  "font-size": "32px",
                                  color: "var(--p)"
                                }}
                              >
                                account_circle
                              </span>
                              <p>Sign in to manage your account.</p>
                            </div>
                          </Show>
                        </div>
                      </div>
                    </Show>
                  </section>
                </Show>

                {/* =========================================================== */}
                {/* 2. APPEARANCE                                                */}
                {/* =========================================================== */}
                <Show
                  when={filteredSections().some((s) => s.id === "appearance")}
                >
                  <section
                    id="section-appearance"
                    class="settings-accordion-section"
                  >
                    <button
                      type="button"
                      class="settings-accordion-header focus-ring"
                      onClick={() => toggleSection("appearance")}
                      aria-expanded={isExpanded("appearance")}
                      aria-controls="panel-appearance"
                    >
                      <span
                        class="material-symbols-outlined settings-accordion-icon"
                        aria-hidden="true"
                      >
                        palette
                      </span>
                      <div class="settings-accordion-meta">
                        <span class="settings-accordion-title">
                          {highlightText("Appearance")}
                        </span>
                        <span class="settings-accordion-desc">
                          {highlightText("Theme, accent, density, font")}
                        </span>
                      </div>
                      <span
                        class="material-symbols-outlined settings-accordion-chevron"
                        aria-hidden="true"
                        style={{
                          transform: isExpanded("appearance")
                            ? "rotate(180deg)"
                            : "none",
                          transition: "transform 200ms ease"
                        }}
                      >
                        expand_more
                      </span>
                    </button>

                    <Show when={isExpanded("appearance")}>
                      <div
                        id="panel-appearance"
                        class="settings-accordion-panel"
                      >
                        {/* Theme mode — 3 visual cards */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Theme</p>
                          <div class="theme-card-grid">
                            <For each={THEME_MODE_OPTIONS}>
                              {(opt) => (
                                <ThemeCard
                                  id={opt.id}
                                  label={opt.label}
                                  desc={
                                    opt.id === "dark"
                                      ? "Always dark"
                                      : opt.id === "light"
                                      ? "Always light"
                                      : "Match system"
                                  }
                                  selected={themeMode() === opt.id}
                                  onSelect={() => setThemeMode(opt.id)}
                                  preview={THEME_MODE_PREVIEWS[opt.id]}
                                />
                              )}
                            </For>
                          </div>
                        </div>

                        {/* Accent color — 9 swatches */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Accent color</p>
                          <div class="accent-swatch-row">
                            <For each={THEMES_LIST}>
                              {(t) => (
                                <AccentSwatch
                                  variant="preset"
                                  id={t.id}
                                  label={t.name}
                                  color={t.swatch}
                                  selected={isPresetActive(t.id)}
                                  onSelect={() => handlePresetClick(t.id)}
                                />
                              )}
                            </For>
                            {/* 9th swatch — Dynamic */}
                            <AccentSwatch
                              variant="dynamic"
                              id="dynamic"
                              label={extractingColor() ? "Extracting…" : "Dynamic"}
                              dynamicColor={dynamicAccentColor()}
                              selected={isDynamicActive()}
                              onSelect={() => void handleDynamicClick()}
                            />
                          </div>
                          <Show when={isDynamicActive() && dynamicAccentColor()}>
                            <p class="accent-dynamic-info">
                              Extracted from your banner:{" "}
                              <code>{dynamicAccentColor()}</code>
                            </p>
                          </Show>
                        </div>

                        {/* Density */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Density</p>
                          <div class="setting-group">
                            <ControlRow
                              icon="view_agenda"
                              label="Spacing"
                              desc="How compact cards and lists are."
                            >
                              {renderSegmented(
                                DENSITY_OPTIONS,
                                density,
                                (id) => setDensity(id),
                                "Density"
                              )}
                            </ControlRow>
                          </div>
                        </div>

                        {/* Font size */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Font size</p>
                          <div class="setting-group">
                            <ControlRow
                              icon="text_fields"
                              label="Text size"
                              desc="Scales body text app-wide."
                            >
                              {renderSegmented(
                                FONT_SIZE_OPTIONS,
                                fontSize,
                                (id) => setFontSize(id),
                                "Font size"
                              )}
                            </ControlRow>
                          </div>
                        </div>

                        {/* Poster quality */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Poster quality</p>
                          <div class="setting-group">
                            <ControlRow
                              icon="image"
                              label="Image resolution"
                              desc="Lower saves mobile data."
                            >
                              {renderSegmented(
                                POSTER_QUALITY_OPTIONS,
                                posterQuality,
                                (id) => setPosterQuality(id),
                                "Poster quality"
                              )}
                            </ControlRow>
                          </div>
                        </div>

                        {/* Hide spoilers */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Spoilers</p>
                          <div class="setting-group">
                            <ToggleRow
                              icon="visibility_off"
                              label="Hide spoilers"
                              desc="Blur plot details until tapped."
                              current={hideSpoilers}
                              onChange={setHideSpoilers}
                            />
                          </div>
                        </div>

                        {/* Accessibility */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Accessibility</p>
                          <div class="setting-group">
                            <ControlRow
                              icon="animation"
                              label="Reduced motion"
                              desc="Disable animations app-wide."
                            >
                              {renderSegmented(
                                REDUCED_MOTION_OPTIONS,
                                reducedMotion,
                                (id) => setReducedMotion(id),
                                "Reduced motion"
                              )}
                            </ControlRow>
                            <ToggleRow
                              icon="contrast"
                              label="High contrast"
                              desc="Boost text and border brightness."
                              current={highContrast}
                              onChange={setHighContrast}
                            />
                          </div>
                        </div>
                      </div>
                    </Show>
                  </section>
                </Show>

                {/* =========================================================== */}
                {/* 3. CONTENT & LANGUAGE                                        */}
                {/* =========================================================== */}
                <Show
                  when={filteredSections().some((s) => s.id === "content")}
                >
                  <section
                    id="section-content"
                    class="settings-accordion-section"
                  >
                    <button
                      type="button"
                      class="settings-accordion-header focus-ring"
                      onClick={() => toggleSection("content")}
                      aria-expanded={isExpanded("content")}
                      aria-controls="panel-content"
                    >
                      <span
                        class="material-symbols-outlined settings-accordion-icon"
                        aria-hidden="true"
                      >
                        tune
                      </span>
                      <div class="settings-accordion-meta">
                        <span class="settings-accordion-title">
                          {highlightText("Content & Language")}
                        </span>
                        <span class="settings-accordion-desc">
                          {highlightText("Language, region, filters, ratings")}
                        </span>
                      </div>
                      <span
                        class="material-symbols-outlined settings-accordion-chevron"
                        aria-hidden="true"
                        style={{
                          transform: isExpanded("content")
                            ? "rotate(180deg)"
                            : "none",
                          transition: "transform 200ms ease"
                        }}
                      >
                        expand_more
                      </span>
                    </button>

                    <Show when={isExpanded("content")}>
                      <div
                        id="panel-content"
                        class="settings-accordion-panel"
                      >
                        {/* Language */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Language</p>
                          <div class="setting-group">
                            <SelectRow
                              icon="translate"
                              label="Primary language"
                              desc="Used for title overviews and posters."
                              value={language}
                              onChange={(v) => setLanguage(v)}
                              options={languageOptions()}
                            />
                            <SelectRow
                              icon="swap_horiz"
                              label="Fallback language"
                              desc="Used when no content in primary language."
                              value={fallbackLanguage}
                              onChange={(v) => setFallbackLanguage(v)}
                              options={fallbackOptions()}
                            />
                          </div>
                        </div>

                        {/* Date format */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Date format</p>
                          <div class="setting-group">
                            <ControlRow
                              icon="calendar_month"
                              label="Date display"
                              desc="How dates appear across the app."
                            >
                              {renderSegmented(
                                DATE_FORMAT_OPTIONS,
                                dateFormat,
                                (id) => setDateFormat(id),
                                "Date format"
                              )}
                            </ControlRow>
                          </div>
                        </div>

                        {/* Default vault status */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">
                            Default vault status
                          </p>
                          <div class="setting-group">
                            <ControlRow
                              icon="bookmark_add"
                              label="New titles added"
                              desc="Status assigned automatically."
                            >
                              {renderSegmented(
                                VAULT_STATUS_OPTIONS,
                                defaultVaultStatus,
                                (id) => setDefaultVaultStatus(id),
                                "Default vault status"
                              )}
                            </ControlRow>
                          </div>
                        </div>

                        {/* Adult content filter */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Content filter</p>
                          <div class="setting-group">
                            <ToggleRow
                              icon="no_adult_content"
                              label="Adult content filter"
                              desc="Hide adult titles from Discover."
                              current={adultContentFilter}
                              onChange={(v) => {
                                setAdultContentFilter(v);
                                showToast(
                                  v
                                    ? "Adult content hidden"
                                    : "Adult content visible",
                                  "info",
                                  1200
                                );
                              }}
                            />
                            <SelectRow
                              icon="family_restroom"
                              label="Rating cap"
                              desc="Hide titles rated above this."
                              value={contentRatingCap}
                              onChange={(v) => {
                                setContentRatingCap(v);
                                showToast(
                                  v
                                    ? `Rating cap set to ${v}`
                                    : "Rating cap removed",
                                  "info",
                                  1200
                                );
                              }}
                              options={RATING_CAP_OPTIONS}
                            />
                          </div>
                        </div>

                        {/* Rating scale */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Rating scale</p>
                          <div class="setting-group">
                            <ControlRow
                              icon="grade"
                              label="How ratings appear"
                              desc="Star or thumbs display."
                            >
                              {renderSegmented(
                                RATING_SCALE_OPTIONS,
                                ratingScale,
                                (id) => setRatingScale(id),
                                "Rating scale"
                              )}
                            </ControlRow>
                          </div>
                        </div>

                        {/* Default discover tab */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">
                            Default Discover tab
                          </p>
                          <div class="setting-group">
                            <ControlRow
                              icon="tab"
                              label="Discover opens to"
                              desc="Which tab Discover starts on."
                            >
                              {renderSegmented(
                                DISCOVER_TAB_OPTIONS,
                                defaultDiscoverTab,
                                (id) => setDefaultDiscoverTab(id),
                                "Default Discover tab"
                              )}
                            </ControlRow>
                          </div>
                        </div>

                        {/* Streaming providers */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">
                            Streaming providers
                            <Show when={activeProviderCount() > 0}>
                              <span
                                style={{
                                  "margin-left": "var(--sp-2)",
                                  "font-size": "0.6875rem",
                                  color: "var(--p)",
                                  "font-weight": 700
                                }}
                              >
                                {activeProviderCount()} active
                              </span>
                            </Show>
                          </p>
                          <div
                            class="setting-group"
                            style={{ padding: "var(--sp-3) var(--sp-4)" }}
                          >
                            <p class="setting-subsection-hint">
                              Tap the providers you subscribe to.
                            </p>
                            <div class="provider-chip-grid">
                              <For each={providers()}>
                                {(provider) => {
                                  const active = createMemo(() =>
                                    streamingProviders().includes(provider.id)
                                  );
                                  const logoUrl = createMemo(() =>
                                    provider.logoPath
                                      ? tmdbImage(provider.logoPath, "w92")
                                      : ""
                                  );
                                  return (
                                    <button
                                      type="button"
                                      class="provider-chip focus-ring"
                                      data-active={active()}
                                      onClick={() =>
                                        handleToggleProvider(provider)
                                      }
                                      aria-label={`${active() ? "Remove" : "Add"} ${provider.name}`}
                                      aria-pressed={active()}
                                    >
                                      <div
                                        class="provider-chip-icon"
                                        aria-hidden="true"
                                      >
                                        <Show
                                          when={logoUrl()}
                                          fallback={
                                            <span class="provider-chip-icon-letter">
                                              {provider.name.charAt(0)}
                                            </span>
                                          }
                                        >
                                          <img
                                            src={logoUrl()}
                                            class="provider-chip-logo"
                                            alt=""
                                            loading="lazy"
                                            decoding="async"
                                            onError={(e) => {
                                              e.currentTarget.style.display =
                                                "none";
                                            }}
                                          />
                                        </Show>
                                      </div>
                                      <span class="provider-chip-name">
                                        {provider.name}
                                      </span>
                                      <span
                                        class="material-symbols-outlined provider-chip-check"
                                        aria-hidden="true"
                                      >
                                        check_circle
                                      </span>
                                    </button>
                                  );
                                }}
                              </For>
                              <Show
                                when={
                                  providersLoading() && providers().length === 0
                                }
                              >
                                <div class="provider-chip-loading">
                                  Loading providers…
                                </div>
                              </Show>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Show>
                  </section>
                </Show>

                {/* =========================================================== */}
                {/* 4. NOTIFICATIONS                                             */}
                {/* =========================================================== */}
                <Show
                  when={filteredSections().some(
                    (s) => s.id === "notifications"
                  )}
                >
                  <section
                    id="section-notifications"
                    class="settings-accordion-section"
                  >
                    <button
                      type="button"
                      class="settings-accordion-header focus-ring"
                      onClick={() => toggleSection("notifications")}
                      aria-expanded={isExpanded("notifications")}
                      aria-controls="panel-notifications"
                    >
                      <span
                        class="material-symbols-outlined settings-accordion-icon"
                        aria-hidden="true"
                      >
                        notifications
                      </span>
                      <div class="settings-accordion-meta">
                        <span class="settings-accordion-title">
                          {highlightText("Notifications")}
                        </span>
                        <span class="settings-accordion-desc">
                          {highlightText("Push, categories, quiet hours")}
                        </span>
                      </div>
                      <span
                        class="material-symbols-outlined settings-accordion-chevron"
                        aria-hidden="true"
                        style={{
                          transform: isExpanded("notifications")
                            ? "rotate(180deg)"
                            : "none",
                          transition: "transform 200ms ease"
                        }}
                      >
                        expand_more
                      </span>
                    </button>

                    <Show when={isExpanded("notifications")}>
                      <div
                        id="panel-notifications"
                        class="settings-accordion-panel"
                      >
                        {/* Push permission */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">
                            Push notifications
                          </p>
                          <div class="setting-group">
                            <div class="setting-row-control">
                              <div class="setting-row-control-header">
                                <div
                                  class="setting-row-icon"
                                  aria-hidden="true"
                                >
                                  <span
                                    class="material-symbols-outlined"
                                    style={{ "font-size": "16px" }}
                                    aria-hidden="true"
                                  >
                                    notifications_active
                                  </span>
                                </div>
                                <div class="setting-row-control-meta">
                                  <span class="setting-row-control-label">
                                    Device permission
                                  </span>
                                  <span class="setting-row-control-desc">
                                    <Show
                                      when={pushPermission() !== "unsupported"}
                                      fallback={
                                        <span
                                          style={{
                                            color: "var(--text-muted)"
                                          }}
                                        >
                                          Not supported in this browser.
                                        </span>
                                      }
                                    >
                                      <Show
                                        when={pushPermission() === "granted"}
                                        fallback={
                                          <span
                                            style={{
                                              color: "var(--text-muted)"
                                            }}
                                          >
                                            Required for background reminders.
                                          </span>
                                        }
                                      >
                                        <span style={{ color: "#4ade80" }}>
                                          ✓ Enabled
                                        </span>
                                      </Show>
                                    </Show>
                                  </span>
                                </div>
                                <Show when={pushPermission() === "default"}>
                                  <button
                                    type="button"
                                    class="settings-link-btn focus-ring"
                                    onClick={requestPushPermission}
                                  >
                                    Enable
                                  </button>
                                </Show>
                                <Show when={pushPermission() === "denied"}>
                                  <span
                                    style={{
                                      color: "var(--text-muted)",
                                      "font-size": "0.75rem"
                                    }}
                                  >
                                    Blocked
                                  </span>
                                </Show>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Categories */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Categories</p>
                          <div class="setting-group">
                            <For each={NOTIF_CATEGORIES}>
                              {(cat) => (
                                <ToggleRow
                                  icon={cat.icon}
                                  label={cat.label}
                                  desc={cat.desc}
                                  current={() =>
                                    notifPrefs()[cat.key] as boolean
                                  }
                                  onChange={(v) =>
                                    handleCategoryToggle(cat.key, v)
                                  }
                                />
                              )}
                            </For>
                          </div>
                        </div>

                        {/* Quiet hours */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Quiet hours</p>
                          <div class="setting-group">
                            <ToggleRow
                              icon="do_not_disturb_on"
                              label="Enable quiet hours"
                              desc="Silence notifications during a time window."
                              current={() => notifPrefs().quietHoursEnabled}
                              onChange={(v) =>
                                updateNotifPref("quietHoursEnabled", v)
                              }
                            />
                            <Show when={notifPrefs().quietHoursEnabled}>
                              <TimeRow
                                icon="bedtime"
                                label="Start"
                                desc="When quiet hours begin."
                                value={() => notifPrefs().quietHoursStart}
                                onChange={(v) =>
                                  updateNotifPref("quietHoursStart", v)
                                }
                              />
                              <TimeRow
                                icon="wb_sunny"
                                label="End"
                                desc="When quiet hours end."
                                value={() => notifPrefs().quietHoursEnd}
                                onChange={(v) =>
                                  updateNotifPref("quietHoursEnd", v)
                                }
                              />
                            </Show>
                          </div>
                        </div>

                        {/* Reminder lead time */}
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">
                            Reminder lead time
                          </p>
                          <div class="setting-group">
                            <ControlRow
                              icon="alarm"
                              label="Episode reminders"
                              desc="How long before an episode airs."
                            >
                              <Segmented
                                options={LEAD_TIME_OPTIONS}
                                current={() => notifPrefs().episodeReminderLead}
                                onChange={(id) =>
                                  updateNotifPref("episodeReminderLead", id)
                                }
                                name="Reminder lead time"
                              />
                            </ControlRow>
                          </div>
                        </div>
                      </div>
                    </Show>
                  </section>
                </Show>

                {/* =========================================================== */}
                {/* 5. CALENDAR                                                  */}
                {/* =========================================================== */}
                <Show
                  when={filteredSections().some((s) => s.id === "calendar")}
                >
                  <section
                    id="section-calendar"
                    class="settings-accordion-section"
                  >
                    <button
                      type="button"
                      class="settings-accordion-header focus-ring"
                      onClick={() => toggleSection("calendar")}
                      aria-expanded={isExpanded("calendar")}
                      aria-controls="panel-calendar"
                    >
                      <span
                        class="material-symbols-outlined settings-accordion-icon"
                        aria-hidden="true"
                      >
                        calendar_month
                      </span>
                      <div class="settings-accordion-meta">
                        <span class="settings-accordion-title">
                          {highlightText("Calendar")}
                        </span>
                        <span class="settings-accordion-desc">
                          {highlightText("Week, time format, timezone")}
                        </span>
                      </div>
                      <span
                        class="material-symbols-outlined settings-accordion-chevron"
                        aria-hidden="true"
                        style={{
                          transform: isExpanded("calendar")
                            ? "rotate(180deg)"
                            : "none",
                          transition: "transform 200ms ease"
                        }}
                      >
                        expand_more
                      </span>
                    </button>

                    <Show when={isExpanded("calendar")}>
                      <div
                        id="panel-calendar"
                        class="settings-accordion-panel"
                      >
                        <div class="setting-subsection">
                          <p class="setting-subsection-label">
                            First day of week
                          </p>
                          <div class="setting-group">
                            <ControlRow
                              icon="view_week"
                              label="Week starts on"
                              desc="First day of the week row."
                            >
                              {renderSegmented(
                                FIRST_DAY_OPTIONS,
                                () => calPrefs().firstDayOfWeek,
                                (id) => updateCalPref("firstDayOfWeek", id),
                                "First day of week"
                              )}
                            </ControlRow>
                          </div>
                        </div>

                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Time format</p>
                          <div class="setting-group">
                            <ControlRow
                              icon="schedule"
                              label="12-hour or 24-hour"
                              desc="How air times are shown."
                            >
                              {renderSegmented(
                                TIME_FORMAT_OPTIONS,
                                () => calPrefs().timeFormat,
                                (id) => updateCalPref("timeFormat", id),
                                "Time format"
                              )}
                            </ControlRow>
                          </div>
                        </div>

                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Timezone</p>
                          <div class="setting-group">
                            <SelectRow
                              icon="public"
                              label="Air time timezone"
                              desc="Convert air times to your timezone."
                              value={() => calPrefs().releaseTimezone}
                              onChange={(v) =>
                                updateCalPref(
                                  "releaseTimezone",
                                  v as CalendarPrefs["releaseTimezone"]
                                )
                              }
                              options={TZ_OPTIONS}
                            />
                          </div>
                        </div>

                        <div class="setting-subsection">
                          <p class="setting-subsection-label">Default view</p>
                          <div class="setting-group">
                            <ControlRow
                              icon="calendar_view_week"
                              label="Calendar opens to"
                              desc="Which view the calendar starts on."
                            >
                              {renderSegmented(
                                DEFAULT_VIEW_OPTIONS,
                                () => calPrefs().defaultView,
                                (id) => updateCalPref("defaultView", id),
                                "Default calendar view"
                              )}
                            </ControlRow>
                          </div>
                        </div>
                      </div>
                    </Show>
                  </section>
                </Show>

                {/* =========================================================== */}
                {/* 6. DATA & SYNC                                               */}
                {/* =========================================================== */}
                <Show when={filteredSections().some((s) => s.id === "sync")}>
                  <section id="section-sync" class="settings-accordion-section">
                    <button
                      type="button"
                      class="settings-accordion-header focus-ring"
                      onClick={() => toggleSection("sync")}
                      aria-expanded={isExpanded("sync")}
                      aria-controls="panel-sync"
                    >
                      <span
                        class="material-symbols-outlined settings-accordion-icon"
                        aria-hidden="true"
                      >
                        sync
                      </span>
                      <div class="settings-accordion-meta">
                        <span class="settings-accordion-title">
                          {highlightText("Data & Sync")}
                        </span>
                        <span class="settings-accordion-desc">
                          {highlightText("Cloud, import, export, backup")}
                        </span>
                      </div>
                      <span
                        class="material-symbols-outlined settings-accordion-chevron"
                        aria-hidden="true"
                        style={{
                          transform: isExpanded("sync")
                            ? "rotate(180deg)"
                            : "none",
                          transition: "transform 200ms ease"
                        }}
                      >
                        expand_more
                      </span>
                    </button>

                    <Show when={isExpanded("sync")}>
                      <div id="panel-sync" class="settings-accordion-panel">
                        <Show
                          when={isSignedIn()}
                          fallback={
                            <div class="settings-empty-section" role="status">
                              <span
                                class="material-symbols-outlined"
                                aria-hidden="true"
                                style={{
                                  "font-size": "32px",
                                  color: "var(--p)"
                                }}
                              >
                                lock
                              </span>
                              <p>Sign in to access sync, import, and export.</p>
                            </div>
                          }
                        >
                          {/* Cloud status */}
                          <div class="setting-subsection">
                            <CloudStatusCard />
                          </div>

                          {/* Sync cadence */}
                          <div class="setting-subsection">
                            <p class="setting-subsection-label">
                              Sync cadence
                            </p>
                            <div class="setting-group">
                              <SyncCadenceCard />
                            </div>
                          </div>

                          {/* Import */}
                          <div class="setting-subsection">
                            <p class="setting-subsection-label">Import</p>
                            <div class="setting-group">
                              <ImportHub />
                              <CsvImportCard />
                            </div>
                          </div>

                          {/* Export */}
                          <div class="setting-subsection">
                            <p class="setting-subsection-label">Export</p>
                            <div class="setting-group">
                              <BackupCards />
                              <CsvExportCard />
                            </div>
                          </div>

                          {/* Screenshot privacy (lives here now, not in Privacy) */}
                          <div class="setting-subsection">
                            <p class="setting-subsection-label">
                              Screenshot privacy
                            </p>
                            <div class="setting-group">
                              <ToggleRow
                                icon="screenshot"
                                label="Hide ratings in screenshots"
                                desc="Blur ratings in app switcher."
                                current={hideRatingsInScreenshots}
                                onChange={(v) => {
                                  setHideRatingsInScreenshots(v);
                                  showToast(
                                    v
                                      ? "Ratings will blur in app switcher"
                                      : "Ratings visible normally",
                                    "info",
                                    1500
                                  );
                                }}
                              />
                            </div>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </section>
                </Show>

                {/* =========================================================== */}
                {/* 7. DANGER ZONE                                               */}
                {/* =========================================================== */}
                <Show when={filteredSections().some((s) => s.id === "danger")}>
                  <section
                    id="section-danger"
                    class="settings-accordion-section settings-accordion-section-danger"
                  >
                    <button
                      type="button"
                      class="settings-accordion-header focus-ring"
                      onClick={() => toggleSection("danger")}
                      aria-expanded={isExpanded("danger")}
                      aria-controls="panel-danger"
                    >
                      <span
                        class="material-symbols-outlined settings-accordion-icon"
                        aria-hidden="true"
                        style={{ color: "#f87171" }}
                      >
                        warning
                      </span>
                      <div class="settings-accordion-meta">
                        <span
                          class="settings-accordion-title"
                          style={{ color: "#f87171" }}
                        >
                          {highlightText("Danger Zone")}
                        </span>
                        <span class="settings-accordion-desc">
                          {highlightText("Reset library, delete account")}
                        </span>
                      </div>
                      <span
                        class="material-symbols-outlined settings-accordion-chevron"
                        aria-hidden="true"
                        style={{
                          transform: isExpanded("danger")
                            ? "rotate(180deg)"
                            : "none",
                          transition: "transform 200ms ease"
                        }}
                      >
                        expand_more
                      </span>
                    </button>

                    <Show when={isExpanded("danger")}>
                      <div
                        id="panel-danger"
                        class="settings-accordion-panel"
                      >
                        <Show
                          when={isSignedIn()}
                          fallback={
                            <div class="settings-empty-section" role="status">
                              <p>Sign in to manage danger zone actions.</p>
                            </div>
                          }
                        >
                          {/* Reset library — uses existing DangerZoneCard */}
                          <DangerZoneCard />

                          {/* Delete / Deactivate account */}
                          <div class="setting-subsection danger-subsection">
                            <p class="setting-subsection-label">
                              Account deletion
                            </p>
                            <div class="setting-group">
                              <button
                                type="button"
                                class="setting-row focus-ring setting-row-danger"
                                onClick={handleDeactivate}
                                aria-label="Deactivate account"
                              >
                                <div
                                  class="setting-row-icon"
                                  aria-hidden="true"
                                >
                                  <span
                                    class="material-symbols-outlined"
                                    style={{ "font-size": "18px" }}
                                    aria-hidden="true"
                                  >
                                    block
                                  </span>
                                </div>
                                <div class="setting-row-text">
                                  <span class="setting-row-label">
                                    Deactivate account
                                  </span>
                                  <span class="setting-row-desc">
                                    Temporarily disable. Recovers in 7 days.
                                  </span>
                                </div>
                                <span
                                  class="material-symbols-outlined setting-row-chevron"
                                  aria-hidden="true"
                                >
                                  chevron_right
                                </span>
                              </button>
                              <button
                                type="button"
                                class="setting-row focus-ring setting-row-danger"
                                onClick={handleDelete}
                                aria-label="Permanently delete account"
                              >
                                <div
                                  class="setting-row-icon"
                                  aria-hidden="true"
                                >
                                  <span
                                    class="material-symbols-outlined"
                                    style={{ "font-size": "18px" }}
                                    aria-hidden="true"
                                  >
                                    delete_forever
                                  </span>
                                </div>
                                <div class="setting-row-text">
                                  <span class="setting-row-label">
                                    Permanently delete account
                                  </span>
                                  <span class="setting-row-desc">
                                    Irreversible. Removes all your data.
                                  </span>
                                </div>
                                <span
                                  class="material-symbols-outlined setting-row-chevron"
                                  aria-hidden="true"
                                >
                                  chevron_right
                                </span>
                              </button>
                            </div>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </section>
                </Show>
              </Show>
            </div>
          </div>
        </div>
      </PageContainer>

      {/* Sheets — rendered at the page root so they overlay correctly */}
      <UpdateEmailSheet
        open={showEmailSheet()}
        onClose={() => setShowEmailSheet(false)}
      />
      <ChangePasswordSheet
        open={showPasswordSheet()}
        onClose={() => setShowPasswordSheet(false)}
      />
      <LinkEmailPasswordSheet
        open={showLinkEmailPasswordSheet()}
        onClose={() => {
          setShowLinkEmailPasswordSheet(false);
          void refreshHasPassword();
        }}
      />
      <DeactivateAccountSheet
        open={showDeactivateSheet()}
        mode={deactivateMode()}
        onClose={() => setShowDeactivateSheet(false)}
      />
      <ConfirmSignOutSheet
        open={showSignOutSheet()}
        mode="local"
        onConfirm={handleConfirmSignOut}
        onClose={() => setShowSignOutSheet(false)}
      />
    </>
  );
};

export default SettingsPage;
