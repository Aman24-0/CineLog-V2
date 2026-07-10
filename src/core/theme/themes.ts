export const DEFAULT_THEME = "sage";

export const THEMES = [
  "pearl",
  "sage",
  "matrix",
  "netflix",
  "cinematic",
  "interstellar",
  "neonhorizon",
  "vibranium"
] as const;

export type Theme = (typeof THEMES)[number];
