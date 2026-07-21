// src/core/preferences/reducedMotion.ts
// Reduced Motion — on / off / system

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";
import { readStored, writeStored, applyDataAttr } from "./_storage";

export type ReducedMotionPref = "on" | "off" | "system";

const REDUCED_MOTION_KEY = "cinelog_reduced_motion";

function isReducedMotion(v: string | null): v is ReducedMotionPref {
  return v === "on" || v === "off" || v === "system";
}

const storedRM = readStored<string>(REDUCED_MOTION_KEY, "system");

export const [reducedMotion, setReducedMotion] = createSignal<ReducedMotionPref>(
  isReducedMotion(storedRM) ? storedRM : "system"
);

function systemWantsReducedMotion(): boolean {
  if (isServer || typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function effectiveReducedMotion(): boolean {
  const v = reducedMotion();
  if (v === "on") return true;
  if (v === "off") return false;
  return systemWantsReducedMotion();
}

createEffect(() => {
  const v = reducedMotion();
  writeStored(REDUCED_MOTION_KEY, v);
  applyDataAttr("data-reduced-motion", v);
  // Resolve and apply
  if (isServer) return;
  applyDataAttr("data-reduced-motion-active", String(effectiveReducedMotion()));
});

if (!isServer && typeof window !== "undefined" && window.matchMedia) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", () => {
    if (reducedMotion() === "system") {
      applyDataAttr("data-reduced-motion-active", String(systemWantsReducedMotion()));
    }
  });
}
