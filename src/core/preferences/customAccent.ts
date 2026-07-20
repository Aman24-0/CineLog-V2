// src/core/preferences/customAccent.ts
// Custom accent — when set, overrides the theme-* --p tokens.
// Stored as a hex string ("#a8ff78"). Empty string means "use theme preset".

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";
import { readStored, writeStored } from "./_storage";

const CUSTOM_ACCENT_KEY = "cinelog_custom_accent";

function isValidHex(v: string | null): boolean {
  if (!v) return false;
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v);
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(168,255,120,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
