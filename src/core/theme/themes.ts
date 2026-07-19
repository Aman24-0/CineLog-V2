export const DEFAULT_THEME = "cinematic";

export const THEMES = [
  "cinematic",
  "pearl",
  "sage",
  "matrix",
  "netflix",
  "interstellar",
  "neonhorizon",
  "vibranium"
] as const;

export type Theme = (typeof THEMES)[number];
