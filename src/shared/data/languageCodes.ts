// src/shared/data/languageCodes.ts
//
// languageCodes — the canonical ISO 639-1 code → display name map used
// by the Library Language filter (Part 3 redesign).
//
// CONTRACT:
//   - Keys are ISO 639-1 codes (lowercase, e.g. "hi", "ta", "en").
//   - Values are human-readable display names in English (e.g.
//     "Hindi", "Tamil", "English"). These are what the Library filter
//     dropdown renders.
//
// WHY A STANDALONE MAP (NOT DERIVED FROM COUNTRIES):
//   The Library Language filter shows languages that appear in the
//   user's vault — these can come from any country. The existing
//   `countryLanguages.ts` is country→languages, which is the wrong
//   shape (a language may be spoken in multiple countries, and a
//   vault can contain titles from many countries). A flat
//   language-code → display-name map is the right shape for the
//   filter dropdown.
//
// COVERAGE:
//   Includes all TMDB-original-language codes that appear in the
//   curated `COUNTRIES` list in `countryLanguages.ts` (so Indian
//   regional languages + the major international languages CineLog
//   supports), PLUS the long tail of common TMDB language codes that
//   are not represented in the country list but routinely appear on
//   international titles (e.g. Polish, Swedish, Danish, Norwegian,
//   Finnish, Czech, Hungarian, Greek, Hebrew, Romanian, Bulgarian,
//   Ukrainian, Thai, Indonesian, Vietnamese, Malaysian, Filipino,
//   Mandarin/Cantonese variants, Arabic, Persian, Turkish, Portuguese,
//   Italian, German, French, Spanish, Russian, Korean, Japanese,
//   Chinese, English).
//
//   Unknown codes (anything not in this map) fall back to the
//   uppercased code itself as the display label (see
//   `languageDisplayName` below) — so a vault with an exotic language
//   not in the map still renders something readable. Adding a new
//   language is a single-line change here.

/**
 * ISO 639-1 code → display name. Keys MUST be lowercase.
 */
export const LANGUAGE_CODE_TO_NAME: Record<string, string> = {
  // Indian regional languages (from countryLanguages.ts → IN)
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  pa: "Punjabi",
  bn: "Bengali",
  mr: "Marathi",
  gu: "Gujarati",
  ur: "Urdu",
  or: "Odia",
  as: "Assamesse",
  sa: "Sanskrit",
  // Major international languages
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  cn: "Chinese (Cantonese)",
  cmn: "Mandarin",
  yue: "Cantonese",
  ar: "Arabic",
  fa: "Persian",
  he: "Hebrew",
  tr: "Turkish",
  nl: "Dutch",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  nb: "Norwegian (Bokmål)",
  fi: "Finnish",
  pl: "Polish",
  cs: "Czech",
  sk: "Slovak",
  hu: "Hungarian",
  ro: "Romanian",
  bg: "Bulgarian",
  el: "Greek",
  uk: "Ukrainian",
  hr: "Croatian",
  sr: "Serbian",
  sl: "Slovenian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
  th: "Thai",
  id: "Indonesian",
  vi: "Vietnamese",
  ms: "Malay",
  tl: "Filipino",
  // Common extras
  la: "Latin",
  eo: "Esperanto",
  ca: "Catalan",
  eu: "Basque",
  gl: "Galician",
  cy: "Welsh",
  ga: "Irish",
  gd: "Scottish Gaelic",
  is: "Icelandic",
  mt: "Maltese",
  mk: "Macedonian",
  sq: "Albanian",
  bs: "Bosnian",
  be: "Belarusian",
  kk: "Kazakh",
  ky: "Kyrgyz",
  uz: "Uzbek",
  az: "Azerbaijani",
  ka: "Georgian",
  hy: "Armenian",
  ps: "Pashto",
  ku: "Kurdish",
  sw: "Swahili",
  am: "Amharic",
  ha: "Hausa",
  yo: "Yoruba",
  ig: "Igbo",
  zu: "Zulu",
  xh: "Xhosa",
  af: "Afrikaans",
  so: "Somali",
  mn: "Mongolian",
  my: "Burmese",
  km: "Khmer",
  lo: "Lao",
  si: "Sinhala",
  ne: "Nepali",
  dv: "Dhivehi"
};

/**
 * Resolve a TMDB original_language code (or any 2- or 3-letter code)
 * to a human-readable display name. Falls back to the uppercased
 * code itself for unknown codes so the UI never renders an empty
 * label.
 *
 * @param code  ISO 639-1 code (lowercase or uppercase — the helper
 *                lowercases internally).
 */
export function languageDisplayName(code: string | undefined | null): string {
  if (!code || typeof code !== "string") return "";
  const lower = code.toLowerCase();
  return LANGUAGE_CODE_TO_NAME[lower] ?? code.toUpperCase();
}
