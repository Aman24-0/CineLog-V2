export const DEFAULT_THEME = "cinematic";

export const THEMES = [
  "cinematic",
  "pearl",
  "sage",
  "matrix",
  "netflix",
  "interstellar",
  "neonhorizon",
  "vibranium",
  // Phase 14 Chunk 2 — Frosted Glass accent presets.
  // Four new jewel-tone accents curated to pop on the new translucent
  // frosted glass cards (see .theme-* classes in colors.css).
  "neoncyan",
  "vibrupurple",
  "hotpink",
  "emerald"
] as const;

export type Theme = (typeof THEMES)[number];
