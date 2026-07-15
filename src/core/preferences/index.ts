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
  if (!m) return "#05060a";
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  // Relative luminance per WCAG
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#05060a" : "#ffffff";
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
