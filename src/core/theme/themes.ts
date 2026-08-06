// src/core/theme/themes.ts
//
// Phase 14 Chunk 4 — 5 curated Colour Schemes.
//
// Each scheme sets BOTH the accent (`--p`) AND the three ambient blob
// colors (`--ambient-color-1/2/3`). Picking a scheme therefore repaints
// the whole UI — accent buttons, glow, ambient wash, and the frosted
// glass tint all change in lockstep. This replaces the old 12 accent
// presets which only swapped the accent and left the ambient on the
// default cinema gold palette.
//
// The 5 schemes:
//   1. cinematic    — Cinematic Gold (default identity)
//   2. cyberpunk    — Cyberpunk Neon (purple / pink)
//   3. interstellar — Interstellar Cyan (cool blue)
//   4. emerald      — Emerald Matrix (green)
//   5. crimson      — Crimson Dusk (red / orange)
//
// MIGRATION NOTE: previously this file listed 12 accents
// (pearl, sage, matrix, netflix, interstellar, neonhorizon, vibranium,
// neoncyan, vibrupurple, hotpink, emerald, cinematic). Chunk 4
// collapsed those into the 5 curated schemes above. Existing users
// whose localStorage holds an old id will fall through to the
// `cinematic` default via the `isTheme()` type guard (the old id no
// longer matches the union, so `setTheme` rejects it and the signal
// keeps its initial value — `DEFAULT_THEME`).

export const DEFAULT_THEME = "cinematic";

export const THEMES = [
  "cinematic",
  "cyberpunk",
  "interstellar",
  "emerald",
  "crimson"
] as const;

export type Theme = (typeof THEMES)[number];
