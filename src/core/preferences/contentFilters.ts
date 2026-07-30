// src/core/preferences/contentFilters.ts
// Adult Content Filter — toggle + certification cap
// When `adultContentFilter` is on, TMDB API calls use include_adult=false
// AND client-side filter removes titles with `adult: true`.
// `contentRatingCap` filters by certification (e.g., "R" max for US).

import { createSignal, createEffect } from "solid-js";
import { readStored, writeStored } from "./_storage";

const ADULT_FILTER_KEY = "cinelog_adult_filter";
const CONTENT_RATING_CAP_KEY = "cinelog_content_rating_cap";

const storedAF = readStored<string>(ADULT_FILTER_KEY, "true");
const storedCRC = readStored<string>(CONTENT_RATING_CAP_KEY, "");

export const [adultContentFilter, setAdultContentFilter] =
  createSignal<boolean>(storedAF === "true");
// "" means no cap. Values: "", "G", "PG", "PG-13", "R", "NC-17" (US) or
// "U", "UA", "UA 13+", "UA 16+", "A" (India) — applied based on country.
export const [contentRatingCap, setContentRatingCap] =
  createSignal<string>(storedCRC);

createEffect(() => {
  writeStored(ADULT_FILTER_KEY, String(adultContentFilter()));
});

createEffect(() => {
  writeStored(CONTENT_RATING_CAP_KEY, contentRatingCap());
});

/** Whether to pass include_adult=false to TMDB API. */
export function tmdbIncludeAdult(): boolean {
  return !adultContentFilter();
}

/**
 * Client-side filter: drop titles with adult=true if filter is on.
 * Use after TMDB API calls to be defensive.
 */
export function filterAdultTitles<T extends { adult?: boolean }>(
  titles: T[]
): T[] {
  if (!adultContentFilter()) return titles;
  return titles.filter((t) => !t.adult);
}
