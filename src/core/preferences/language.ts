// src/core/preferences/language.ts
// UI Language + TMDB Fallback Language
// `language` is the user's preferred UI + content language (BCP-47).
// `fallbackLanguage` is used when TMDB has no overview in the primary.
// Both are sent to TMDB API via the `language` query param.

import { createSignal, createEffect } from "solid-js";
import { readStored, writeStored, applyDataAttr } from "./_storage";

export type LanguageCode = string; // BCP-47 like "en", "hi", "es"

const LANGUAGE_KEY = "cinelog_language";
const FALLBACK_LANGUAGE_KEY = "cinelog_fallback_language";

const storedLang = readStored<string>(LANGUAGE_KEY, "en");
const storedFallback = readStored<string>(FALLBACK_LANGUAGE_KEY, "en");

export const [language, setLanguage] = createSignal<LanguageCode>(
  storedLang || "en"
);
export const [fallbackLanguage, setFallbackLanguage] =
  createSignal<LanguageCode>(storedFallback || "en");

createEffect(() => {
  writeStored(LANGUAGE_KEY, language());
  applyDataAttr("data-lang", language());
});

createEffect(() => {
  writeStored(FALLBACK_LANGUAGE_KEY, fallbackLanguage());
});

/** Get the effective TMDB API language parameter. */
export function effectiveTMDBLanguage(): string {
  return language() || "en";
}

/**
 * Given two overviews (primary language, fallback language), pick the right one.
 * Used after fetching title details with both language params.
 */
export function pickOverview(
  primary: string | null | undefined,
  fallback: string | null | undefined
): string {
  if (primary && primary.trim().length > 0) return primary;
  if (fallback && fallback.trim().length > 0) return fallback;
  return "";
}
