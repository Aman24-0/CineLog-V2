// src/core/preferences/customAccent.ts
// Custom accent — when set, overrides the theme-* --p tokens.
// Stored as a hex string ("#a8ff78"). Empty string means "use theme preset".
//
// GLOBAL ACCENT APPLICATION
// -------------------------
// When a custom accent (preset click OR Dynamic extraction) is applied,
// we set EVERY accent-sensitive CSS variable on <html> via inline style.
// Inline styles win over class-based rules (`.theme-pearl`, `.theme-cinematic`,
// etc.), so the custom accent reliably overrides the theme preset — even
// on elements that previously fell back to a hardcoded gold rgba because
// they consumed a token we hadn't overridden.
//
// Variables we set:
//   --p            primary accent (hex)
//   --p2           secondary accent — set to SAME hex so all "secondary"
//                  accent treatments (badges, hovers, gradients) match
//   --p-glow       glow rgba (alpha 0.22)
//   --p-dim        dim rgba (alpha 0.08) — used for chip / subtle backgrounds
//   --p-border     border rgba (alpha 0.40) — used for accent borders
//   --p-hover      hover rgba (alpha 0.12) — used for accent hover bg
//   --active-bg    = var(--p)   (active button background)
//   --active-text  contrast color (black or white, WCAG-aware)
//   --active-border = var(--p)  (active button border)
//   --active-glow  shadow using --p-glow
//
// When the custom accent is cleared (""), we removeProperty() each
// variable so the theme-* class definitions take over again.

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";
import { readStored, writeStored } from "./_storage";

const CUSTOM_ACCENT_KEY = "cinelog_custom_accent";

function isValidHex(v: string | null): boolean {
  if (!v) return false;
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v);
}

/**
 * Normalize a hex color to 6-digit form (#abc → #aabbcc).
 * Returns the original input (trimmed) if it's already 6-digit,
 * or null if it's not a valid 3- or 6-digit hex.
 */
function normalizeHex(hex: string): string | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const digits = m[1];
  if (digits.length === 3) {
    // Expand shorthand: each digit becomes two of the same.
    // "#abc" → "#aabbcc"
    return `#${digits.split("").map((c) => c + c).join("")}`;
  }
  return `#${digits}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHex(hex);
  if (!normalized) return `rgba(168,255,120,${alpha})`;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const storedAccent = readStored<string>(CUSTOM_ACCENT_KEY, "");

export const [customAccent, setCustomAccent] = createSignal<string>(
  isValidHex(storedAccent) ? storedAccent! : ""
);

/**
 * Compute a luminance-aware contrast color (black or white) for a given
 * hex accent, so text on accent buttons stays readable.
 *
 * Accepts both 3-digit (#abc) and 6-digit (#aabbcc) hex shorthand.
 */
export function contrastOn(hex: string): string {
  const normalized = normalizeHex(hex);
  if (!normalized) return "#08080D";
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  // Relative luminance per WCAG
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#08080D" : "#ffffff";
}

/**
 * List of every CSS variable we set/clear when the custom accent changes.
 * Kept in one place so the apply/clear paths can never drift out of sync
 * (which was the root cause of the "Pearl accent stays white" bug —
 * some elements consumed --p-border / --p-hover but we never set them,
 * so they fell back to the theme-* class definition).
 */
const ACCENT_VARS: readonly string[] = [
  "--p",
  "--p2",
  "--p-glow",
  "--p-dim",
  "--p-border",
  "--p-hover",
  "--active-bg",
  "--active-text",
  "--active-border",
  "--active-glow"
] as const;

createEffect(() => {
  const hex = customAccent();
  writeStored(CUSTOM_ACCENT_KEY, hex);
  if (isServer) return;
  if (hex && isValidHex(hex)) {
    applyAccentToDocument(hex);
  } else {
    clearAccentFromDocument();
  }
});

/**
 * Imperatively apply a custom accent hex to <html> inline styles.
 *
 * This mirrors what the `createEffect` above does, but can be called
 * directly from event handlers (e.g. clicking a preset swatch or the
 * "Re-extract" button) as a belt-and-suspenders approach: the effect
 * is the primary mechanism, but calling this helper ensures the inline
 * styles are applied IMMEDIATELY when the user clicks, without waiting
 * for SolidJS to batch the signal update and re-run the effect.
 *
 * This fixes the bug where the dynamic accent was "partially applied" —
 * the signal was set but var(--p) on <html> wasn't updated in time, so
 * some elements still showed the old theme preset color.
 */
export function applyAccentToDocument(hex: string): void {
  if (isServer) return;
  if (!isValidHex(hex)) return;
  const root = document.documentElement;
  // Override ALL accent-sensitive tokens with the custom accent.
  // Setting --p2 to the same hex as --p is intentional — it makes
  // every "secondary accent" treatment (badges, hovers, gradients)
  // match the chosen accent, instead of clashing with the theme
  // preset's secondary color.
  root.style.setProperty("--p", hex);
  root.style.setProperty("--p2", hex);
  root.style.setProperty("--p-glow", hexToRgba(hex, 0.22));
  root.style.setProperty("--p-dim", hexToRgba(hex, 0.08));
  root.style.setProperty("--p-border", hexToRgba(hex, 0.4));
  root.style.setProperty("--p-hover", hexToRgba(hex, 0.12));
  root.style.setProperty("--active-bg", hex);
  root.style.setProperty("--active-text", contrastOn(hex));
  root.style.setProperty("--active-border", hex);
  root.style.setProperty("--active-glow", `0 0 12px ${hexToRgba(hex, 0.22)}`);
}

/**
 * Imperatively clear ALL accent overrides from <html> inline styles,
 * so theme-* class definitions take over again.
 *
 * Safe to call on the server (no-op) and safe to call when no accent
 * was previously applied (removeProperty() no-ops on unset properties).
 */
export function clearAccentFromDocument(): void {
  if (isServer) return;
  const root = document.documentElement;
  for (const varName of ACCENT_VARS) {
    root.style.removeProperty(varName);
  }
}
