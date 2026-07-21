// src/core/preferences/highContrast.ts
// High Contrast — on / off
// Boosts --text-strong and increases border opacity.

import { createSignal, createEffect } from "solid-js";
import { readStored, writeStored, applyDataAttr } from "./_storage";

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
