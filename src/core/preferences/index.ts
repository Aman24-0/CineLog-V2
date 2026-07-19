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
// Adding a new preference:
//   1. Define a typed signal + setter below
//   2. Add a createEffect that writes to <html> data-* attr + localStorage
//   3. Add the matching CSS rules (see preferences.css)
//
// All signals are lazy-imported where needed; importing this module is
// cheap (signals + effects, no React-style provider needed in SolidJS).

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";

// ────────────────────────────────────────────────────────────────────
// Storage helpers
// ────────────────────────────────────────────────────────────────────

function readStored<T extends string>(key: string, fallback: T): T {
  if (isServer) return fallback;
  const v = localStorage.getItem(key);
  return (v as T) ?? fallback;
}

function writeStored(key: string, value: string): void {
  if (isServer) return;
  localStorage.setItem(key, value);
}

/** Apply a data-attribute to <html> and <body> in sync. */
function applyDataAttr(attr: string, value: string): void {
  if (isServer) return;
  const kebab = attr.startsWith("data-") ? attr : `data-${attr}`;
  document.documentElement.setAttribute(kebab, value);
  if (document.body) document.body.setAttribute(kebab, value);
}

// ────────────────────────────────────────────────────────────────────
// 1. Theme mode — Dark / Light / System
//    Note: the accent (theme-matrix, theme-sage, …) is still owned by
//    src/core/theme — those classes set --p, --p-glow etc.
//    The mode here adds `data-theme-mode="dark|light"` to <html>, and
//    a CSS ruleset `:root[data-theme-mode="light"] { … }` swaps every
//    surface/text/border token for a light palette.
// ────────────────────────────────────────────────────────────────────

export type ThemeMode = "dark" | "light" | "system";

const THEME_MODE_KEY = "cinelog_theme_mode";

function resolveSystemMode(): "dark" | "light" {
  if (isServer || typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function effectiveThemeMode(mode: ThemeMode): "dark" | "light" {
  return mode === "system" ? resolveSystemMode() : mode;
}

const storedMode = readStored<ThemeMode>(THEME_MODE_KEY, "dark");

export const [themeMode, setThemeMode] = createSignal<ThemeMode>(
  isThemeMode(storedMode) ? storedMode : "dark"
);

function isThemeMode(v: string | null): v is ThemeMode {
  return v === "dark" || v === "light" || v === "system";
}

createEffect(() => {
  const mode = themeMode();
  writeStored(THEME_MODE_KEY, mode);
  applyDataAttr("data-theme-mode", mode);
  // Also expose the *resolved* mode (system → dark/light) so CSS can
  // use it for token swaps without re-resolving.
  applyDataAttr("data-theme-resolved", effectiveThemeMode(mode));
});

// Listen for system theme changes — if mode === "system", update the
// resolved attribute so the UI flips without a reload.
if (!isServer && typeof window !== "undefined" && window.matchMedia) {
  const mql = window.matchMedia("(prefers-color-scheme: light)");
  mql.addEventListener("change", () => {
    if (themeMode() === "system") {
      applyDataAttr("data-theme-resolved", resolveSystemMode());
    }
  });
}

// ────────────────────────────────────────────────────────────────────
// 2. Custom accent — when set, overrides the theme-* --p tokens.
//    Stored as a hex string ("#a8ff78"). Empty string means "use theme preset".
// ────────────────────────────────────────────────────────────────────

const CUSTOM_ACCENT_KEY = "cinelog_custom_accent";

function isValidHex(v: string | null): boolean {
  if (!v) return false;
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v);
}

const storedAccent = readStored<string>(CUSTOM_ACCENT_KEY, "");

export const [customAccent, setCustomAccent] = createSignal<string>(
  isValidHex(storedAccent) ? storedAccent! : ""
);

/**
 * Compute a luminance-aware contrast color (black or white) for a given
 * hex accent, so text on accent buttons stays readable.
 */
export function contrastOn(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return "#08080D";
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  // Relative luminance per WCAG
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#08080D" : "#ffffff";
}

createEffect(() => {
  const hex = customAccent();
  writeStored(CUSTOM_ACCENT_KEY, hex);
  if (isServer) return;
  if (hex && isValidHex(hex)) {
    // Override --p tokens with the custom accent
    const root = document.documentElement;
    root.style.setProperty("--p", hex);
    root.style.setProperty("--p2", hex);
    root.style.setProperty("--p-glow", hexToRgba(hex, 0.22));
    root.style.setProperty("--p-dim", hexToRgba(hex, 0.08));
    root.style.setProperty("--active-text", contrastOn(hex));
  } else {
    // Clear inline overrides so theme-* classes take over again
    const root = document.documentElement;
    root.style.removeProperty("--p");
    root.style.removeProperty("--p2");
    root.style.removeProperty("--p-glow");
    root.style.removeProperty("--p-dim");
    root.style.removeProperty("--active-text");
  }
});

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(168,255,120,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ────────────────────────────────────────────────────────────────────
// 3. Display Density — Compact / Comfortable / Spacious
// ────────────────────────────────────────────────────────────────────

export type Density = "compact" | "comfortable" | "spacious";

const DENSITY_KEY = "cinelog_density";

function isDensity(v: string | null): v is Density {
  return v === "compact" || v === "comfortable" || v === "spacious";
}

const storedDensity = readStored<string>(DENSITY_KEY, "comfortable");

export const [density, setDensity] = createSignal<Density>(
  isDensity(storedDensity) ? storedDensity : "comfortable"
);

createEffect(() => {
  const d = density();
  writeStored(DENSITY_KEY, d);
  applyDataAttr("data-density", d);
});

// ────────────────────────────────────────────────────────────────────
// 4. Font Size — Small / Medium / Large
//    Mapped to a --font-scale CSS var (0.92 / 1.0 / 1.14) that the
//    body font-size multiplier uses.
// ────────────────────────────────────────────────────────────────────

export type FontSize = "small" | "medium" | "large";

const FONT_SIZE_KEY = "cinelog_font_size";

function isFontSize(v: string | null): v is FontSize {
  return v === "small" || v === "medium" || v === "large";
}

const storedFont = readStored<string>(FONT_SIZE_KEY, "medium");

export const [fontSize, setFontSize] = createSignal<FontSize>(
  isFontSize(storedFont) ? storedFont : "medium"
);

const FONT_SCALE: Record<FontSize, number> = {
  small: 0.92,
  medium: 1.0,
  large: 1.14,
};

createEffect(() => {
  const f = fontSize();
  writeStored(FONT_SIZE_KEY, f);
  if (isServer) return;
  document.documentElement.style.setProperty("--font-scale", String(FONT_SCALE[f]));
});

// ────────────────────────────────────────────────────────────────────
// 5. Poster Quality — High / Medium / Low / Auto
//    Applies a downgrade map at the tmdbImage() call site.
//    Auto uses navigator.connection.effectiveType if available.
// ────────────────────────────────────────────────────────────────────

export type PosterQuality = "high" | "medium" | "low" | "auto";

const POSTER_QUALITY_KEY = "cinelog_poster_quality";

function isPosterQuality(v: string | null): v is PosterQuality {
  return v === "high" || v === "medium" || v === "low" || v === "auto";
}

const storedPQ = readStored<string>(POSTER_QUALITY_KEY, "high");

export const [posterQuality, setPosterQuality] = createSignal<PosterQuality>(
  isPosterQuality(storedPQ) ? storedPQ : "high"
);

createEffect(() => {
  writeStored(POSTER_QUALITY_KEY, posterQuality());
});

/**
 * TMDB image size tiers, smallest to largest.
 * Poster quality preference downgrades the requested size by N steps.
 */
const POSTER_TIERS = ["w92", "w154", "w185", "w342", "w500", "w780"] as const;
type PosterTier = (typeof POSTER_TIERS)[number];

const DOWNGRADE: Record<Exclude<PosterQuality, "auto">, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function effectivePosterQuality(): Exclude<PosterQuality, "auto"> {
  const q = posterQuality();
  if (q !== "auto") return q;
  // Auto: sniff connection
  if (isServer) return "medium";
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
  const et = nav.connection?.effectiveType;
  if (!et) return "high"; // desktop / unknown → high
  if (et === "slow-2g" || et === "2g") return "low";
  if (et === "3g") return "medium";
  return "high";
}

/**
 * Apply the user's poster-quality preference to a requested TMDB size.
 * Called by tmdbImage() so every call site benefits without code changes.
 */
export function applyPosterQuality(
  size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "w1280" | "original"
): "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "w1280" | "original" {
  // Never modify backdrops/large images ("w1280", "original") — those are
  // typically hero images where downgrading visibly hurts UX.
  if (size === "w1280" || size === "original") return size;
  const q = effectivePosterQuality();
  const steps = DOWNGRADE[q];
  if (steps === 0) return size;
  const idx = POSTER_TIERS.indexOf(size as PosterTier);
  if (idx < 0) return size;
  const newIdx = Math.max(0, idx - steps);
  return POSTER_TIERS[newIdx];
}

// ────────────────────────────────────────────────────────────────────
// 6. Hide Spoilers — boolean toggle
//    When on, elements with [data-spoiler] blur until tapped.
// ────────────────────────────────────────────────────────────────────

const HIDE_SPOILERS_KEY = "cinelog_hide_spoilers";

const storedHide = readStored<string>(HIDE_SPOILERS_KEY, "false");

export const [hideSpoilers, setHideSpoilers] = createSignal<boolean>(
  storedHide === "true"
);

createEffect(() => {
  const v = hideSpoilers();
  writeStored(HIDE_SPOILERS_KEY, String(v));
  applyDataAttr("data-hide-spoilers", String(v));
});

// ────────────────────────────────────────────────────────────────────
// 7. Date Format — DD/MM/YYYY / MM/DD/YYYY / YYYY-MM-DD
// ────────────────────────────────────────────────────────────────────

export type DateFormat = "dmy" | "mdy" | "ymd";

const DATE_FORMAT_KEY = "cinelog_date_format";

function isDateFormat(v: string | null): v is DateFormat {
  return v === "dmy" || v === "mdy" || v === "ymd";
}

const storedDF = readStored<string>(DATE_FORMAT_KEY, "dmy");

export const [dateFormat, setDateFormat] = createSignal<DateFormat>(
  isDateFormat(storedDF) ? storedDF : "dmy"
);

createEffect(() => {
  writeStored(DATE_FORMAT_KEY, dateFormat());
});

const DATE_SEPARATORS: Record<DateFormat, string> = {
  dmy: "/",
  mdy: "/",
  ymd: "-",
};
const DATE_ORDER: Record<DateFormat, ("y" | "m" | "d")[]> = {
  dmy: ["d", "m", "y"],
  mdy: ["m", "d", "y"],
  ymd: ["y", "m", "d"],
};

/**
 * Format a date string (YYYY-MM-DD or ISO) per the user's chosen format.
 * Used wherever a short date is shown (cards, lists, detail modal).
 */
export function formatDateUser(dateStr: string): string {
  if (!dateStr) return "";
  const d = dateStr.length <= 10 ? new Date(dateStr + "T00:00:00") : new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const parts: Record<"y" | "m" | "d", string> = { y: String(yyyy), m: mm, d: dd };
  const fmt = dateFormat();
  return DATE_ORDER[fmt].map((k) => parts[k]).join(DATE_SEPARATORS[fmt]);
}

// ────────────────────────────────────────────────────────────────────
// 8. Reduced Motion — on / off / system
// ────────────────────────────────────────────────────────────────────

export type ReducedMotionPref = "on" | "off" | "system";

const REDUCED_MOTION_KEY = "cinelog_reduced_motion";

function isReducedMotion(v: string | null): v is ReducedMotionPref {
  return v === "on" || v === "off" || v === "system";
}

const storedRM = readStored<string>(REDUCED_MOTION_KEY, "system");

export const [reducedMotion, setReducedMotion] = createSignal<ReducedMotionPref>(
  isReducedMotion(storedRM) ? storedRM : "system"
);

function systemWantsReducedMotion(): boolean {
  if (isServer || typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function effectiveReducedMotion(): boolean {
  const v = reducedMotion();
  if (v === "on") return true;
  if (v === "off") return false;
  return systemWantsReducedMotion();
}

createEffect(() => {
  const v = reducedMotion();
  writeStored(REDUCED_MOTION_KEY, v);
  applyDataAttr("data-reduced-motion", v);
  // Resolve and apply
  if (isServer) return;
  applyDataAttr("data-reduced-motion-active", String(effectiveReducedMotion()));
});

if (!isServer && typeof window !== "undefined" && window.matchMedia) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", () => {
    if (reducedMotion() === "system") {
      applyDataAttr("data-reduced-motion-active", String(systemWantsReducedMotion()));
    }
  });
}

// ────────────────────────────────────────────────────────────────────
// 9. High Contrast — on / off
//    Boosts --text-strong and increases border opacity.
// ────────────────────────────────────────────────────────────────────

const HIGH_CONTRAST_KEY = "cinelog_high_contrast";

const storedHC = readStored<string>(HIGH_CONTRAST_KEY, "false");

export const [highContrast, setHighContrast] = createSignal<boolean>(
  storedHC === "true"
);

createEffect(() => {
  const v = highContrast();
  writeStored(HIGH_CONTRAST_KEY, String(v));
  applyDataAttr("data-high-contrast", String(v));
});

// ────────────────────────────────────────────────────────────────────
// 10. UI Language + TMDB Fallback Language
//     `language` is the user's preferred UI + content language (BCP-47).
//     `fallbackLanguage` is used when TMDB has no overview in the primary.
//     Both are sent to TMDB API via the `language` query param.
// ────────────────────────────────────────────────────────────────────

export type LanguageCode = string; // BCP-47 like "en", "hi", "es"

const LANGUAGE_KEY = "cinelog_language";
const FALLBACK_LANGUAGE_KEY = "cinelog_fallback_language";

const storedLang = readStored<string>(LANGUAGE_KEY, "en");
const storedFallback = readStored<string>(FALLBACK_LANGUAGE_KEY, "en");

export const [language, setLanguage] = createSignal<LanguageCode>(storedLang || "en");
export const [fallbackLanguage, setFallbackLanguage] = createSignal<LanguageCode>(storedFallback || "en");

createEffect(() => {
  writeStored(LANGUAGE_KEY, language());
  applyDataAttr("data-lang", language());
});

createEffect(() => {
  writeStored(FALLBACK_LANGUAGE_KEY, fallbackLanguage());
});

/** Get the effective TMDB API language parameter. */
export function effectiveTMDBLanguage(): string {
  return language() || "en";
}

/**
 * Given two overviews (primary language, fallback language), pick the right one.
 * Used after fetching title details with both language params.
 */
export function pickOverview(primary: string | null | undefined, fallback: string | null | undefined): string {
  if (primary && primary.trim().length > 0) return primary;
  if (fallback && fallback.trim().length > 0) return fallback;
  return "";
}

// ────────────────────────────────────────────────────────────────────
// 11. Default Vault Status — what status to assign when adding to vault
// ────────────────────────────────────────────────────────────────────

export type VaultStatus = "Planned" | "Watching" | "Completed" | "Plan to Watch" | "Dropped";

const DEFAULT_VAULT_STATUS_KEY = "cinelog_default_vault_status";

function isVaultStatus(v: string | null): v is VaultStatus {
  return v === "Planned" || v === "Watching" || v === "Completed" || v === "Plan to Watch" || v === "Dropped";
}

const storedDVS = readStored<string>(DEFAULT_VAULT_STATUS_KEY, "Planned");

export const [defaultVaultStatus, setDefaultVaultStatus] = createSignal<VaultStatus>(
  isVaultStatus(storedDVS) ? storedDVS : "Planned"
);

createEffect(() => {
  writeStored(DEFAULT_VAULT_STATUS_KEY, defaultVaultStatus());
});

// ────────────────────────────────────────────────────────────────────
// 12. Adult Content Filter — toggle + certification cap
//     When `adultContentFilter` is on, TMDB API calls use include_adult=false
//     AND client-side filter removes titles with `adult: true`.
//     `contentRatingCap` filters by certification (e.g., "R" max for US).
// ────────────────────────────────────────────────────────────────────

const ADULT_FILTER_KEY = "cinelog_adult_filter";
const CONTENT_RATING_CAP_KEY = "cinelog_content_rating_cap";

const storedAF = readStored<string>(ADULT_FILTER_KEY, "true");
const storedCRC = readStored<string>(CONTENT_RATING_CAP_KEY, "");

export const [adultContentFilter, setAdultContentFilter] = createSignal<boolean>(storedAF === "true");
// "" means no cap. Values: "", "G", "PG", "PG-13", "R", "NC-17" (US) or
// "U", "UA", "UA 13+", "UA 16+", "A" (India) — applied based on country.
export const [contentRatingCap, setContentRatingCap] = createSignal<string>(storedCRC);

createEffect(() => {
  writeStored(ADULT_FILTER_KEY, String(adultContentFilter()));
});

createEffect(() => {
  writeStored(CONTENT_RATING_CAP_KEY, contentRatingCap());
});

/** Whether to pass include_adult=false to TMDB API. */
export function tmdbIncludeAdult(): boolean {
  return !adultContentFilter();
}

/**
 * Client-side filter: drop titles with adult=true if filter is on.
 * Use after TMDB API calls to be defensive.
 */
export function filterAdultTitles<T extends { adult?: boolean }>(titles: T[]): T[] {
  if (!adultContentFilter()) return titles;
  return titles.filter((t) => !t.adult);
}

// ────────────────────────────────────────────────────────────────────
// 13. Streaming Provider Subscriptions
//     A set of TMDB watch_provider IDs the user is subscribed to.
//     Used by Discover OTT section + Where-to-watch on detail pages.
// ────────────────────────────────────────────────────────────────────

const STREAMING_PROVIDERS_KEY = "cinelog_streaming_providers";

function readProviderSet(): string[] {
  if (isServer) return [];
  try {
    const raw = localStorage.getItem(STREAMING_PROVIDERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const [streamingProviders, setStreamingProviders] = createSignal<string[]>(readProviderSet());

createEffect(() => {
  if (isServer) return;
  try {
    localStorage.setItem(STREAMING_PROVIDERS_KEY, JSON.stringify(streamingProviders()));
  } catch {
    // ignore quota errors
  }
});

export function toggleStreamingProvider(id: string): void {
  setStreamingProviders((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );
}

export function hasStreamingProvider(id: string): boolean {
  return streamingProviders().includes(id);
}

// ────────────────────────────────────────────────────────────────────
// 14. Default Discover Tab — Movies / Series / All
// ────────────────────────────────────────────────────────────────────

export type DiscoverTab = "all" | "movie" | "tv";

const DEFAULT_DISCOVER_TAB_KEY = "cinelog_default_discover_tab";

function isDiscoverTab(v: string | null): v is DiscoverTab {
  return v === "all" || v === "movie" || v === "tv";
}

const storedDT = readStored<string>(DEFAULT_DISCOVER_TAB_KEY, "all");

export const [defaultDiscoverTab, setDefaultDiscoverTab] = createSignal<DiscoverTab>(
  isDiscoverTab(storedDT) ? storedDT : "all"
);

createEffect(() => {
  writeStored(DEFAULT_DISCOVER_TAB_KEY, defaultDiscoverTab());
});

// ────────────────────────────────────────────────────────────────────
// 15. Rating Scale — 5-star / 10-star / thumbs
//     How ratings are DISPLAYED in the UI. TMDB returns 0-10; we convert.
// ────────────────────────────────────────────────────────────────────

export type RatingScale = "5star" | "10star" | "thumbs";

const RATING_SCALE_KEY = "cinelog_rating_scale";

function isRatingScale(v: string | null): v is RatingScale {
  return v === "5star" || v === "10star" || v === "thumbs";
}

const storedRS = readStored<string>(RATING_SCALE_KEY, "10star");

export const [ratingScale, setRatingScale] = createSignal<RatingScale>(
  isRatingScale(storedRS) ? storedRS : "10star"
);

createEffect(() => {
  writeStored(RATING_SCALE_KEY, ratingScale());
});

/** Convert a TMDB 0-10 rating to the user's preferred display format. */
export function formatRating(tmdbRating: number | null | undefined): string {
  if (tmdbRating == null || isNaN(tmdbRating)) return "—";
  const scale = ratingScale();
  if (scale === "5star") {
    return `${(tmdbRating / 2).toFixed(1)}★`;
  }
  if (scale === "thumbs") {
    return tmdbRating >= 7 ? "👍" : tmdbRating >= 5 ? "👌" : "👎";
  }
  return `${tmdbRating.toFixed(1)}/10`;
}

// ────────────────────────────────────────────────────────────────────
// 16. Notification Preferences (persisted)
//     Per-category toggles + quiet hours + digest time + lead time
// ────────────────────────────────────────────────────────────────────

export interface NotificationPrefs {
  newSeason: boolean;
  continueWatching: boolean;
  weeklyRecap: boolean;
  recommendations: boolean;
  syncStatus: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "22:00" HH:MM
  quietHoursEnd: string; // "07:00" HH:MM
  weeklyDigestTime: string; // "09:00" HH:MM — when the weekly digest fires
  weeklyDigestDay: number; // 0=Sun, 1=Mon, ..., 6=Sat
  episodeReminderLead: number; // minutes before air time (0, 5, 15, 30, 60, 1440=day before)
}

const NOTIF_PREFS_KEY = "cinelog_notification_prefs";

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  newSeason: true,
  continueWatching: false,
  weeklyRecap: true,
  recommendations: false,
  syncStatus: true,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  weeklyDigestTime: "09:00",
  weeklyDigestDay: 1, // Monday
  episodeReminderLead: 60, // 1 hour before
};

function readNotifPrefs(): NotificationPrefs {
  if (isServer) return DEFAULT_NOTIF_PREFS;
  try {
    const raw = localStorage.getItem(NOTIF_PREFS_KEY);
    if (!raw) return DEFAULT_NOTIF_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_NOTIF_PREFS, ...parsed };
  } catch {
    return DEFAULT_NOTIF_PREFS;
  }
}

export const [notifPrefs, setNotifPrefs] = createSignal<NotificationPrefs>(readNotifPrefs());

createEffect(() => {
  if (isServer) return;
  try {
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(notifPrefs()));
  } catch {
    // ignore
  }
});

export function updateNotifPref<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]): void {
  setNotifPrefs((prev) => ({ ...prev, [key]: value }));
}

/** Check if a given Date is inside the user's quiet hours window. */
export function isInQuietHours(date: Date = new Date()): boolean {
  const p = notifPrefs();
  if (!p.quietHoursEnabled) return false;
  const cur = date.getHours() * 60 + date.getMinutes();
  const [sh, sm] = p.quietHoursStart.split(":").map(Number);
  const [eh, em] = p.quietHoursEnd.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  if (start < end) {
    return cur >= start && cur < end;
  }
  // wraps midnight
  return cur >= start || cur < end;
}

// ────────────────────────────────────────────────────────────────────
// 17. Calendar Preferences
// ────────────────────────────────────────────────────────────────────

export type FirstDayOfWeek = 0 | 1 | 6; // 0=Sun, 1=Mon, 6=Sat
export type TimeFormat = "12h" | "24h";
export type CalendarView = "week" | "month" | "agenda";

export interface CalendarPrefs {
  firstDayOfWeek: FirstDayOfWeek;
  timeFormat: TimeFormat;
  releaseTimezone: "local" | "us-east" | "us-pacific" | "utc";
  defaultView: CalendarView;
}

const CAL_PREFS_KEY = "cinelog_calendar_prefs";

const DEFAULT_CAL_PREFS: CalendarPrefs = {
  firstDayOfWeek: 1, // Monday (matches most of the world outside US)
  timeFormat: "24h",
  releaseTimezone: "local",
  defaultView: "week",
};

function readCalPrefs(): CalendarPrefs {
  if (isServer) return DEFAULT_CAL_PREFS;
  try {
    const raw = localStorage.getItem(CAL_PREFS_KEY);
    if (!raw) return DEFAULT_CAL_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CAL_PREFS, ...parsed };
  } catch {
    return DEFAULT_CAL_PREFS;
  }
}

export const [calPrefs, setCalPrefs] = createSignal<CalendarPrefs>(readCalPrefs());

createEffect(() => {
  if (isServer) return;
  try {
    localStorage.setItem(CAL_PREFS_KEY, JSON.stringify(calPrefs()));
  } catch {
    // ignore
  }
});

export function updateCalPref<K extends keyof CalendarPrefs>(key: K, value: CalendarPrefs[K]): void {
  setCalPrefs((prev) => ({ ...prev, [key]: value }));
}

/** Format a time string ("HH:MM" or ISO) per user's 12/24h preference. */
export function formatTimeUser(timeStr: string): string {
  if (!timeStr) return "";
  const tf = calPrefs().timeFormat;
  // Parse "HH:MM"
  const m = /^(\d{2}):(\d{2})/.exec(timeStr);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = m[2];
    if (tf === "12h") {
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${min} ${period}`;
    }
    return `${h.toString().padStart(2, "0")}:${min}`;
  }
  // ISO date string — extract time
  const d = new Date(timeStr);
  if (!isNaN(d.getTime())) {
    if (tf === "12h") {
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
    }
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return timeStr;
}

// ────────────────────────────────────────────────────────────────────
// 18. Sync Cadence — real-time / wifi-only / manual
// ────────────────────────────────────────────────────────────────────

export type SyncCadence = "realtime" | "wifi-only" | "manual";

const SYNC_CADENCE_KEY = "cinelog_sync_cadence";

function isSyncCadence(v: string | null): v is SyncCadence {
  return v === "realtime" || v === "wifi-only" || v === "manual";
}

const storedSC = readStored<string>(SYNC_CADENCE_KEY, "realtime");

export const [syncCadence, setSyncCadence] = createSignal<SyncCadence>(
  isSyncCadence(storedSC) ? storedSC : "realtime"
);

createEffect(() => {
  writeStored(SYNC_CADENCE_KEY, syncCadence());
});

/** Should we sync now? Considers cadence + network state. */
export function shouldSyncNow(): boolean {
  const c = syncCadence();
  if (c === "realtime") return true;
  if (c === "manual") return false;
  // wifi-only
  if (isServer) return false;
  const nav = navigator as Navigator & { connection?: { effectiveType?: string; type?: string } };
  const conn = nav.connection;
  if (!conn) return true; // can't tell — allow
  if (conn.type) return conn.type === "wifi";
  // Fallback to effectiveType — assume 4g+ is wifi-ish
  const et = conn.effectiveType;
  return et === "4g" || !et;
}

// ────────────────────────────────────────────────────────────────────
// 19. Hide Ratings in Screenshots
//     When on, listen for `visibilitychange` to a hidden state (likely
//     screenshot / app switcher) and add a CSS class that blurs ratings.
// ────────────────────────────────────────────────────────────────────

const HIDE_RATINGS_KEY = "cinelog_hide_ratings_screenshots";

const storedHR = readStored<string>(HIDE_RATINGS_KEY, "false");

export const [hideRatingsInScreenshots, setHideRatingsInScreenshots] = createSignal<boolean>(
  storedHR === "true"
);

createEffect(() => {
  const v = hideRatingsInScreenshots();
  writeStored(HIDE_RATINGS_KEY, String(v));
  applyDataAttr("data-hide-ratings-ss", String(v));
});

// Install the visibility listener once on the client.
if (!isServer && typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && hideRatingsInScreenshots()) {
      document.documentElement.setAttribute("data-ss-hidden", "true");
    } else {
      document.documentElement.removeAttribute("data-ss-hidden");
    }
  });
}
