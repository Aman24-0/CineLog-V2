// src/core/preferences/posterQuality.ts
// Poster Quality — High / Medium / Low / Auto
// Applies a downgrade map at the tmdbImage() call site.
// Auto uses navigator.connection.effectiveType if available.

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";
import { readStored, writeStored } from "./_storage";

export type PosterQuality = "high" | "medium" | "low" | "auto";

const POSTER_QUALITY_KEY = "cinelog_poster_quality";

function isPosterQuality(v: string | null): v is PosterQuality {
  return v === "high" || v === "medium" || v === "low" || v === "auto";
}

const storedPQ = readStored<string>(POSTER_QUALITY_KEY, "high");

export const [posterQuality, setPosterQuality] = createSignal<PosterQuality>(
  isPosterQuality(storedPQ) ? storedPQ : "high"
);

createEffect(() => {
  writeStored(POSTER_QUALITY_KEY, posterQuality());
});

/**
 * TMDB image size tiers, smallest to largest.
 * Poster quality preference downgrades the requested size by N steps.
 */
const POSTER_TIERS = ["w92", "w154", "w185", "w342", "w500", "w780"] as const;
type PosterTier = (typeof POSTER_TIERS)[number];

const DOWNGRADE: Record<Exclude<PosterQuality, "auto">, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function effectivePosterQuality(): Exclude<PosterQuality, "auto"> {
  const q = posterQuality();
  if (q !== "auto") return q;
  // Auto: sniff connection
  if (isServer) return "medium";
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
  const et = nav.connection?.effectiveType;
  if (!et) return "high"; // desktop / unknown → high
  if (et === "slow-2g" || et === "2g") return "low";
  if (et === "3g") return "medium";
  return "high";
}

/**
 * Apply the user's poster-quality preference to a requested TMDB size.
 * Called by tmdbImage() so every call site benefits without code changes.
 */
export function applyPosterQuality(
  size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "w1280" | "original"
): "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "w1280" | "original" {
  // Never modify backdrops/large images ("w1280", "original") — those are
  // typically hero images where downgrading visibly hurts UX.
  if (size === "w1280" || size === "original") return size;
  const q = effectivePosterQuality();
  const steps = DOWNGRADE[q];
  if (steps === 0) return size;
  const idx = POSTER_TIERS.indexOf(size as PosterTier);
  if (idx < 0) return size;
  const newIdx = Math.max(0, idx - steps);
  return POSTER_TIERS[newIdx];
}
