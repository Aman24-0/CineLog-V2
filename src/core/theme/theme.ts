import { createSignal, createEffect } from "solid-js";
import { DEFAULT_THEME, Theme } from "./themes";

const stored = localStorage.getItem("cinelog_theme");

export const [theme, setTheme] = createSignal<Theme>(
  (stored as Theme) || DEFAULT_THEME
);

createEffect(() => {
  document.body.className = `theme-${theme()}`;
  localStorage.setItem("cinelog_theme", theme());
});
