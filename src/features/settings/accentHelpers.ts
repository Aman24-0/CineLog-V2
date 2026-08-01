// src/features/settings/accentHelpers.ts
//
// Accent application helpers — mirror the `applyAccentToDocument` /
// `clearAccentFromDocument` exports from `~/core/preferences/customAccent`,
// but kept here as a local "safety net" used by the dynamic-accent
// handlers in `useSettingsState`.
//
// Why keep a local copy instead of importing from `~/core/preferences`?
//   • The local version uses `typeof document === "undefined"` for the
//     SSR guard (slightly different from the `isServer` check in
//     customAccent.ts).
//   • The local `applyAccentToDocument` accepts 3-digit hex shorthand
//     (`#abc`) in its validation regex, while the preferences version
//     uses a stricter `isValidHex` helper that also accepts 3-digit
//     but routes through `hexToRgba` which only handles 6-digit.
//   • Behaviour is identical for the actual values the handlers pass
//     (always 6-digit hex), but the duplicate is preserved verbatim
//     to eliminate any risk of regression during the section-extraction
//     refactor.
//
// These helpers are NOT exported beyond the settings feature — they're
// an implementation detail of the dynamic-accent flow.

/**
 * Every CSS variable we set/clear when a custom accent is applied or
 * removed. Kept in sync with the ACCENT_VARS list in
 * `~/core/preferences/customAccent.ts`.
 */
export const ACCENT_CSS_VARS = [
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

/**
 * Convert a 6-digit hex color to an `rgba(r,g,b,alpha)` string.
 * Falls back to the signature green on parse failure so callers can
 * pass arbitrary hex without try/catch.
 */
export function hexToRgbaLocal(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(168,255,120,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * WCAG-aware contrast color (black or white) for the given hex accent,
 * used as `--active-text` so text on accent buttons stays readable.
 */
export function contrastOnLocal(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return "#08080D";
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#08080D" : "#ffffff";
}

/**
 * Imperatively apply a custom accent hex to <html> inline styles.
 *
 * This mirrors what the `customAccent` createEffect in
 * `~/core/preferences/customAccent` does, but is called directly from
 * event handlers (preset click, Dynamic swatch click, Re-extract) as
 * a belt-and-suspenders approach: the effect is the primary mechanism,
 * but calling this helper ensures the inline styles are applied
 * IMMEDIATELY when the user clicks, without waiting for SolidJS to
 * batch the signal update and re-run the effect.
 *
 * This fixes the bug where the dynamic accent was "partially applied" —
 * the signal was set but var(--p) on <html> wasn't updated in time, so
 * some elements still showed the old theme preset color.
 */
export function applyAccentToDocument(hex: string): void {
  if (typeof document === "undefined") return;
  if (!/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(hex)) return;
  const root = document.documentElement;
  root.style.setProperty("--p", hex);
  root.style.setProperty("--p2", hex);
  root.style.setProperty("--p-glow", hexToRgbaLocal(hex, 0.22));
  root.style.setProperty("--p-dim", hexToRgbaLocal(hex, 0.08));
  root.style.setProperty("--p-border", hexToRgbaLocal(hex, 0.4));
  root.style.setProperty("--p-hover", hexToRgbaLocal(hex, 0.12));
  root.style.setProperty("--active-bg", hex);
  root.style.setProperty("--active-text", contrastOnLocal(hex));
  root.style.setProperty("--active-border", hex);
  root.style.setProperty("--active-glow", `0 0 12px ${hexToRgbaLocal(hex, 0.22)}`);
}

/**
 * Imperatively clear ALL accent overrides from <html> inline styles,
 * so theme-* class definitions take over again.
 *
 * Safe to call on the server (no-op) and safe to call when no accent
 * was previously applied (removeProperty() no-ops on unset properties).
 */
export function clearAccentFromDocument(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const varName of ACCENT_CSS_VARS) {
    root.style.removeProperty(varName);
  }
}
