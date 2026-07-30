// src/core/preferences/fontSize.ts
// Font Size — Small / Medium / Large
// Mapped to a --font-scale CSS var (0.92 / 1.0 / 1.14) that the
// body font-size multiplier uses.

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";
import { readStored, writeStored } from "./_storage";

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
  large: 1.14
};

createEffect(() => {
  const f = fontSize();
  writeStored(FONT_SIZE_KEY, f);
  if (isServer) return;
  document.documentElement.style.setProperty(
    "--font-scale",
    String(FONT_SCALE[f])
  );
});
