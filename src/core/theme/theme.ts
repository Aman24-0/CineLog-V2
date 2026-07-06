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

// The createEffect only touches document/localStorage on the client.
// On the server it's a no-op (isServer is stable, so the effect body
// never runs during SSR render).
createEffect(() => {
  if (isServer) return;
  document.body.className = `theme-${theme()}`;
  localStorage.setItem("cinelog_theme", theme());
});
