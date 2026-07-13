// src/shared/data/countryLanguages.ts
//
// countryLanguages — the canonical country → languages map used by the
// Upcoming page's Nationality + Language filters, and by the Account
// settings page's country selector.
//
// CONTRACT:
//   - Keys are ISO 3166-1 alpha-2 codes (TMDB watch_region format).
//   - Values are arrays of TMDB language codes (ISO 639-1) with a
//     display name. The first language is the "primary" language of
//     the country; the rest are widely-spoken regional/minority
//     languages that TMDB is likely to have upcoming releases for.
//   - The "International" language list (used when the user picks
//     International nationality) is a curated set of the most common
//     theatrical/streaming release languages worldwide.
//
// This file is the SINGLE source of truth for these mappings. Do not
// hardcode country→language lists elsewhere.

export interface LanguageOption {
  /** TMDB language code (ISO 639-1, e.g. "hi", "ta", "en"). */
  code: string;
  /** Human-readable display name (e.g. "Hindi", "Tamil"). */
  label: string;
}

export interface CountryOption {
  /** ISO 3166-1 alpha-2 code (e.g. "IN", "US"). */
  code: string;
  /** Human-readable country name. */
  label: string;
  /** Languages spoken in this country, primary first. */
  languages: LanguageOption[];
}

/**
 * The curated list of countries CineLog supports for the Account → Country
 * setting. Each country carries its own language list so the Upcoming page
 * can show the right language filter when the user picks "National"
 * nationality.
 *
 * Add new countries here — the Upcoming page and Account settings page
 * both read from this list.
 */
export const COUNTRIES: CountryOption[] = [
  {
    code: "IN",
    label: "India",
    languages: [
      { code: "hi", label: "Hindi" },
      { code: "ta", label: "Tamil" },
      { code: "te", label: "Telugu" },
      { code: "kn", label: "Kannada" },
      { code: "ml", label: "Malayalam" },
      { code: "pa", label: "Punjabi" },
      { code: "bn", label: "Bengali" },
      { code: "mr", label: "Marathi" },
      { code: "gu", label: "Gujarati" },
      { code: "en", label: "English" },
    ],
  },
  {
    code: "US",
    label: "United States",
    languages: [
      { code: "en", label: "English" },
      { code: "es", label: "Spanish" },
    ],
  },
  {
    code: "GB",
    label: "United Kingdom",
    languages: [
      { code: "en", label: "English" },
    ],
  },
  {
    code: "CA",
    label: "Canada",
    languages: [
      { code: "en", label: "English" },
      { code: "fr", label: "French" },
    ],
  },
  {
    code: "AU",
    label: "Australia",
    languages: [
      { code: "en", label: "English" },
    ],
  },
  {
    code: "DE",
    label: "Germany",
    languages: [
      { code: "de", label: "German" },
      { code: "en", label: "English" },
      { code: "tr", label: "Turkish" },
    ],
  },
  {
    code: "FR",
    label: "France",
    languages: [
      { code: "fr", label: "French" },
      { code: "en", label: "English" },
    ],
  },
  {
    code: "JP",
    label: "Japan",
    languages: [
      { code: "ja", label: "Japanese" },
    ],
  },
  {
    code: "KR",
    label: "South Korea",
    languages: [
      { code: "ko", label: "Korean" },
    ],
  },
  {
    code: "CN",
    label: "China",
    languages: [
      { code: "zh", label: "Mandarin" },
      { code: "cn", label: "Cantonese" },
    ],
  },
  {
    code: "ES",
    label: "Spain",
    languages: [
      { code: "es", label: "Spanish" },
      { code: "ca", label: "Catalan" },
      { code: "eu", label: "Basque" },
    ],
  },
  {
    code: "IT",
    label: "Italy",
    languages: [
      { code: "it", label: "Italian" },
    ],
  },
  {
    code: "BR",
    label: "Brazil",
    languages: [
      { code: "pt", label: "Portuguese" },
      { code: "es", label: "Spanish" },
    ],
  },
  {
    code: "MX",
    label: "Mexico",
    languages: [
      { code: "es", label: "Spanish" },
    ],
  },
  {
    code: "RU",
    label: "Russia",
    languages: [
      { code: "ru", label: "Russian" },
    ],
  },
  {
    code: "AE",
    label: "United Arab Emirates",
    languages: [
      { code: "ar", label: "Arabic" },
      { code: "en", label: "English" },
      { code: "hi", label: "Hindi" },
    ],
  },
  {
    code: "SA",
    label: "Saudi Arabia",
    languages: [
      { code: "ar", label: "Arabic" },
    ],
  },
  {
    code: "TR",
    label: "Turkey",
    languages: [
      { code: "tr", label: "Turkish" },
    ],
  },
  {
    code: "NL",
    label: "Netherlands",
    languages: [
      { code: "nl", label: "Dutch" },
      { code: "en", label: "English" },
    ],
  },
  {
    code: "SE",
    label: "Sweden",
    languages: [
      { code: "sv", label: "Swedish" },
      { code: "en", label: "English" },
    ],
  },
];

/**
 * The "International" language list — used when the user picks
 * International nationality in the Upcoming page filter. This is a
 * curated set of the most common theatrical/streaming release
 * languages worldwide, so the user can filter upcoming international
 * releases by language.
 */
export const INTERNATIONAL_LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Mandarin" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ar", label: "Arabic" },
  { code: "tr", label: "Turkish" },
  { code: "th", label: "Thai" },
  { code: "id", label: "Indonesian" },
  { code: "sv", label: "Swedish" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
];

/** Default country if the user has never set one. */
export const DEFAULT_COUNTRY_CODE = "IN" as const;

/** Lookup helper: find a country option by code. */
export function findCountry(code: string | null | undefined): CountryOption | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return COUNTRIES.find((c) => c.code === upper) ?? null;
}

/** Lookup helper: get the language list for a country code. */
export function languagesForCountry(code: string | null | undefined): LanguageOption[] {
  return findCountry(code)?.languages ?? [];
}

/** Lookup helper: get the display label for a country code. */
export function countryLabel(code: string | null | undefined): string {
  return findCountry(code)?.label ?? code ?? "Unknown";
}
