import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";
import { DEFAULT_THEME, Theme } from "./themes";

// SSR-safe: localStorage and document don't exist on the server. The theme
// signal initializes to DEFAULT_THEME during SSR and re-hydrates from
// localStorage on the client (see onMount below). This prevents
// "localStorage is not defined" crashes if this module is ever imported
// during SSR.
const stored = isServer ? null : localStorage.getItem("cinelog_theme");

export const [theme, setTheme] = createSignal<Theme>(
  (stored as Theme) || DEFAULT_THEME
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
  document.body.classList.add(`theme-${theme()}`);
}

// The createEffect only touches document/localStorage on the client.
// On the server it's a no-op (isServer is stable, so the effect body
// never runs during SSR render).
createEffect(() => {
  if (isServer) return;
  const cls = `theme-${theme()}`;
  // Remove any previous theme-* class from <html> and <body>
  document.documentElement.className = document.documentElement.className
    .split(/\s+/).filter((c) => c && !c.startsWith("theme-")).join(" ") + " " + cls;
  document.body.className = cls;
  localStorage.setItem("cinelog_theme", theme());
});
