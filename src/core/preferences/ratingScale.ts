// src/core/preferences/ratingScale.ts
// Rating Scale — 5-star / 10-star / thumbs
// How ratings are DISPLAYED in the UI. TMDB returns 0-10; we convert.

import { createSignal, createEffect } from "solid-js";
import { readStored, writeStored } from "./_storage";

export type RatingScale = "5star" | "10star" | "thumbs";

const RATING_SCALE_KEY = "cinelog_rating_scale";

function isRatingScale(v: string | null): v is RatingScale {
  return v === "5star" || v === "10star" || v === "thumbs";
}

const storedRS = readStored<string>(RATING_SCALE_KEY, "10star");

export const [ratingScale, setRatingScale] = createSignal<RatingScale>(
  isRatingScale(storedRS) ? storedRS : "10star"
);

createEffect(() => {
  writeStored(RATING_SCALE_KEY, ratingScale());
});

/** Convert a TMDB 0-10 rating to the user's preferred display format. */
export function formatRating(tmdbRating: number | null | undefined): string {
  if (tmdbRating == null || isNaN(tmdbRating)) return "—";
  const scale = ratingScale();
  if (scale === "5star") {
    return `${(tmdbRating / 2).toFixed(1)}★`;
  }
  if (scale === "thumbs") {
    return tmdbRating >= 7 ? "👍" : tmdbRating >= 5 ? "👌" : "👎";
  }
  return `${tmdbRating.toFixed(1)}/10`;
}
