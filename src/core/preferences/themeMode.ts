// src/core/preferences/themeMode.ts
// Theme mode — Dark / Light / System
// The accent (theme-matrix, theme-sage, …) is owned by src/core/theme.

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";
import { readStored, writeStored, applyDataAttr } from "./_storage";

export type ThemeMode = "dark" | "light" | "system";

const THEME_MODE_KEY = "cinelog_theme_mode";

function resolveSystemMode(): "dark" | "light" {
  if (isServer || typeof window === "undefined" || !window.matchMedia)
    return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function effectiveThemeMode(mode: ThemeMode): "dark" | "light" {
  return mode === "system" ? resolveSystemMode() : mode;
}

function isThemeMode(v: string | null): v is ThemeMode {
  return v === "dark" || v === "light" || v === "system";
}

const storedMode = readStored<ThemeMode>(THEME_MODE_KEY, "dark");

export const [themeMode, setThemeMode] = createSignal<ThemeMode>(
  isThemeMode(storedMode) ? storedMode : "dark"
);

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
