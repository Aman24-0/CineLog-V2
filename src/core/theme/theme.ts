import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";
import { DEFAULT_THEME, THEMES, Theme } from "./themes";

// SSR-safe: localStorage and document don't exist on the server. The theme
// signal initializes to DEFAULT_THEME during SSR and re-hydrates from
// localStorage on the client (see onMount below). This prevents
// "localStorage is not defined" crashes if this module is ever imported
// during SSR.
const stored = isServer ? null : localStorage.getItem("cinelog_theme");

// Runtime-validated theme set — used by the type guard below to narrow
// the untyped localStorage string into a Theme without an `as` cast
// (which previously triggered an eslint-plugin-solid reactivity crash
// on TSAsExpression).
const VALID_THEMES: ReadonlySet<string> = new Set(THEMES);

function isTheme(value: string | null): value is Theme {
  return value !== null && VALID_THEMES.has(value);
}

export const [theme, setTheme] = createSignal<Theme>(
  isTheme(stored) ? stored : DEFAULT_THEME
);

// Apply the theme class to <html> (documentElement) — NOT <body>.
//
// WHY: the `:root` block in globals.css defines
//   --active-bg: var(--p);
// and `:root` matches <html>. CSS resolves `var(--p)` at the SAME element
// where the variable is consumed. Since `--p` is only set by
// `body.theme-*` rules, the `:root`-level `--active-bg` resolves `--p` at
// the <html> level, where `--p` is empty — so `--active-bg` becomes empty,
// and every active-state control renders with a transparent background.
//
// Setting the theme class on <html> (not <body>) makes the body.theme-*
// rules' --p definition cascade into :root's `var(--p)` lookup correctly.
//
// We also keep the class on <body> for backwards-compat with any rules
// that specifically select `body.theme-*`.
if (!isServer) {
  document.documentElement.classList.add(`theme-${theme()}`);
  // Guard body access — during early hydration document.body may not
  // be available yet if this module is imported before the body element
  // is fully parsed.
  if (document.body) {
    document.body.classList.add(`theme-${theme()}`);
  }
}

// The createEffect only touches document/localStorage on the client.
// On the server it's a no-op (isServer is stable, so the effect body
// never runs during SSR render).
createEffect(() => {
  if (isServer) return;
  const cls = `theme-${theme()}`;
  // Remove any previous theme-* class from <html> and <body>
  document.documentElement.className =
    document.documentElement.className
      .split(/\s+/)
      .filter((c) => c && !c.startsWith("theme-"))
      .join(" ") +
    " " +
    cls;
  // Use classList manipulation on <body> instead of replacing className entirely.
  // Replacing className wipes ALL body classes (scroll-lock, modal-open, etc.)
  // that other systems may have added concurrently.
  const prevThemeClasses = [...document.body.classList].filter((c) =>
    c.startsWith("theme-")
  );
  prevThemeClasses.forEach((c) => document.body.classList.remove(c));
  document.body.classList.add(cls);
  localStorage.setItem("cinelog_theme", theme());
});
