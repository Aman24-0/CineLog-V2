// src/core/preferences/ambientIntensity.ts
// Ambient Intensity — Subtle / Normal / Vibrant
//
// PHASE 14 CHUNK 2 — True Frosted Glass & Appearance Settings.
//
// What this preference controls
// ─────────────────────────────
// The AmbientBackground component (src/shared/ui/AmbientBackground.tsx)
// renders three large blurred radial-gradient blobs that drift behind
// all app content. Their visibility ("how loud is the ambient wash?")
// is subjective — some users want a near-flat background, others want
// the full DULO.TV-style color bleed. This preference exposes three
// curated levels and wires them to the --ambient-intensity CSS var
// via a data-attribute on <html>+<body>.
//
// The CSS side (see colors.css + ambient-background.css):
//   [data-ambient-intensity="subtle"]  { --ambient-intensity: 0.35; }
//   [data-ambient-intensity="normal"]  { --ambient-intensity: 0.70; }
//   [data-ambient-intensity="vibrant"] { --ambient-intensity: 1.00; }
//   .ambient-blob { opacity: calc(0.7 * var(--ambient-intensity)); }
//
// SSR safety
// ──────────
// Like the other preference signals, this one is SSR-safe: readStored
// returns the fallback on the server, and applyDataAttr no-ops. The
// createEffect's body early-returns on isServer so the data attribute
// is only written on the client after hydration.
//
// Cross-device sync
// ─────────────────
// This preference is NOT currently synced to the Supabase
// user_preferences table — it's a per-device cosmetic tweak (like
// density / font size in their current form). If we later want to
// sync it, add `ambientIntensity?: AmbientIntensity` to
// PreferencesSnapshot in preferencesSync.ts and wire the read/write
// paths the same way `theme` is wired.

import { createSignal, createEffect } from "solid-js";
import { readStored, writeStored, applyDataAttr } from "./_storage";

export type AmbientIntensity = "subtle" | "normal" | "vibrant";

const AMBIENT_INTENSITY_KEY = "cinelog_ambient_intensity";

function isAmbientIntensity(v: string | null): v is AmbientIntensity {
  return v === "subtle" || v === "normal" || v === "vibrant";
}

const stored = readStored<string>(AMBIENT_INTENSITY_KEY, "normal");

export const [ambientIntensity, setAmbientIntensity] =
  createSignal<AmbientIntensity>(
    isAmbientIntensity(stored) ? stored : "normal"
  );

createEffect(() => {
  const v = ambientIntensity();
  writeStored(AMBIENT_INTENSITY_KEY, v);
  // The data attribute is read by the [data-ambient-intensity="..."]
  // rules in colors.css, which set --ambient-intensity to the matching
  // multiplier. We set it on BOTH <html> and <body> (applyDataAttr
  // does both) so any future [data-ambient-intensity] selector works
  // regardless of which element it targets.
  applyDataAttr("data-ambient-intensity", v);
});
