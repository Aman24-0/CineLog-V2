// src/core/preferences/density.ts
// Display Density — Compact / Comfortable / Spacious

import { createSignal, createEffect } from "solid-js";
import { readStored, writeStored, applyDataAttr } from "./_storage";

export type Density = "compact" | "comfortable" | "spacious";

const DENSITY_KEY = "cinelog_density";

function isDensity(v: string | null): v is Density {
  return v === "compact" || v === "comfortable" || v === "spacious";
}

const storedDensity = readStored<string>(DENSITY_KEY, "comfortable");

export const [density, setDensity] = createSignal<Density>(
  isDensity(storedDensity) ? storedDensity : "comfortable"
);

createEffect(() => {
  const d = density();
  writeStored(DENSITY_KEY, d);
  applyDataAttr("data-density", d);
});
