// src/server/audio-language/normalizer.ts
//
// CineLog V2 — Audio Language Normalizer
// ---------------------------------------------------------------------
// Converts the wide variety of language strings returned by sources
// into a canonical { code, name } pair.
//
// Sources return things like:
//   "Hindi", "hin", "hi", "hi-IN", "Hindi Dubbed", "Hindi Audio",
//   "Hindi 5.1", "English", "eng", "en", "en-US", "en-GB", ...
//
// All of these must normalize to the SAME entry so the resolver can
// dedup them across sources.
//
// Strategy:
//   1. Lowercase + trim the raw string.
//   2. Strip common suffixes: "-IN", "-US", " dubbed", " audio",
//      " 5.1", " 2.0", " stereo", " surround", " (original)", etc.
//   3. Try to interpret the result as:
//        a. ISO 639-1 (2-letter)   → "hi", "en", "fr"
//        b. ISO 639-3 (3-letter)   → "hin", "eng", "fra"
//        c. English display name   → "hindi", "english", "french"
//        d. Native display name    → "हिन्दी", "Français", "日本語"
//   4. Map to { code, name } via the LANGUAGES table below.
//
// `code` is always the ISO 639-1 (2-letter) code where one exists.
// For languages without a 2-letter code, we fall back to ISO 639-3.
//
// Coverage (per spec STEP 8): Hindi, Tamil, Telugu, Malayalam, Kannada,
// Bengali, Marathi, Punjabi, French, German, Spanish, Italian,
// Portuguese, Japanese, Korean, Arabic, Turkish, Russian, Polish,
// Dutch, Swedish, Norwegian, Danish, Finnish, and many more.
//
// If a language cannot be identified, we return `null` so the resolver
// can drop it (better to omit than to silently miscategorize).

import type { NormalizedLanguage, RawLanguageEntry } from "./types";

/**
 * The canonical language table. Keys are every form we recognize
 * (2-letter, 3-letter, English name lowercased, native name lowercased).
 * Values are the canonical { code, name } pair.
 *
 * `code` is always ISO 639-1 where one exists. This matches TMDB's
 * `spoken_languages[].iso_639_1` convention.
 */
interface CanonicalEntry {
  code: string;
  name: string;
}

const LANGUAGES: ReadonlyArray<CanonicalEntry & { aliases: string[] }> = [
  // ── Major Indian languages ──────────────────────────────────────────
  { code: "hi", name: "Hindi", aliases: ["hin", "हिन्दी", "hindi"] },
  { code: "ta", name: "Tamil", aliases: ["tam", "தமிழ்", "tamil"] },
  { code: "te", name: "Telugu", aliases: ["tel", "తెలుగు", "telugu"] },
  { code: "ml", name: "Malayalam", aliases: ["mal", "മലയാളം", "malayalam"] },
  { code: "kn", name: "Kannada", aliases: ["kan", "ಕನ್ನಡ", "kannada"] },
  { code: "bn", name: "Bengali", aliases: ["ben", "বাংলা", "bengali", "bangla"] },
  { code: "mr", name: "Marathi", aliases: ["mar", "मराठी", "marathi"] },
  { code: "pa", name: "Punjabi", aliases: ["pan", "ਪੰਜਾਬੀ", "punjabi", "panjabi"] },
  { code: "gu", name: "Gujarati", aliases: ["guj", "ગુજરાતી", "gujarati"] },
  { code: "ur", name: "Urdu", aliases: ["urd", "اردو", "urdu"] },
  { code: "or", name: "Odia", aliases: ["ori", "ଓଡ଼ିଆ", "odia", "oriya"] },
  { code: "as", name: "Assamese", aliases: ["asm", "অসমীয়া", "assamese"] },
  { code: "sa", name: "Sanskrit", aliases: ["san", "संस्कृतम्", "sanskrit"] },
  { code: "si", name: "Sinhala", aliases: ["sin", "සිංහල", "sinhala", "sinhalese"] },
  { code: "ne", name: "Nepali", aliases: ["nep", "नेपाली", "nepali"] },
  { code: "bo", name: "Tibetan", aliases: ["bod", "tib", "བོད་སྐད་", "tibetan"] },

  // ── Major European languages ───────────────────────────────────────
  { code: "en", name: "English", aliases: ["eng", "english"] },
  { code: "fr", name: "French", aliases: ["fra", "fre", "français", "francais", "french"] },
  { code: "de", name: "German", aliases: ["deu", "ger", "deutsch", "german"] },
  { code: "es", name: "Spanish", aliases: ["spa", "español", "espanol", "spanish", "castellano"] },
  { code: "it", name: "Italian", aliases: ["ita", "italiano", "italian"] },
  { code: "pt", name: "Portuguese", aliases: ["por", "português", "portugues", "portuguese"] },
  { code: "nl", name: "Dutch", aliases: ["nld", "dut", "nederlands", "dutch"] },
  { code: "sv", name: "Swedish", aliases: ["swe", "svenska", "swedish"] },
  { code: "no", name: "Norwegian", aliases: ["nor", "norsk", "norwegian"] },
  { code: "da", name: "Danish", aliases: ["dan", "dansk", "danish"] },
  { code: "fi", name: "Finnish", aliases: ["fin", "suomi", "finnish"] },
  { code: "is", name: "Icelandic", aliases: ["isl", "ice", "íslenska", "islenska", "icelandic"] },
  { code: "pl", name: "Polish", aliases: ["pol", "polski", "polish"] },
  { code: "cs", name: "Czech", aliases: ["ces", "cze", "česky", "cesky", "czech"] },
  { code: "sk", name: "Slovak", aliases: ["slk", "slo", "slovenčina", "slovencina", "slovak"] },
  { code: "hu", name: "Hungarian", aliases: ["hun", "magyar", "hungarian"] },
  { code: "ro", name: "Romanian", aliases: ["ron", "rum", "română", "romana", "romanian"] },
  { code: "bg", name: "Bulgarian", aliases: ["bul", "български", "bulgarski", "bulgarian"] },
  { code: "hr", name: "Croatian", aliases: ["hrv", "hrvatski", "croatian"] },
  { code: "sr", name: "Serbian", aliases: ["srp", "српски", "srpski", "serbian"] },
  { code: "sl", name: "Slovenian", aliases: ["slv", "slovenščina", "slovenscina", "slovenian"] },
  { code: "el", name: "Greek", aliases: ["ell", "gre", "ελληνικά", "ellinika", "greek"] },
  { code: "ga", name: "Irish", aliases: ["gle", "gaeilge", "irish"] },
  { code: "cy", name: "Welsh", aliases: ["cym", "wel", "cymraeg", "welsh"] },
  { code: "eu", name: "Basque", aliases: ["eus", "baq", "euskara", "basque"] },
  { code: "ca", name: "Catalan", aliases: ["cat", "català", "catala", "catalan"] },
  { code: "gl", name: "Galician", aliases: ["glg", "galego", "galician"] },
  { code: "mt", name: "Maltese", aliases: ["mlt", "malti", "maltese"] },
  { code: "sq", name: "Albanian", aliases: ["sqi", "alb", "shqip", "albanian"] },
  { code: "mk", name: "Macedonian", aliases: ["mkd", "mac", "македонски", "makedonski", "macedonian"] },
  { code: "bs", name: "Bosnian", aliases: ["bos", "bosanski", "bosnian"] },
  { code: "et", name: "Estonian", aliases: ["est", "eesti", "estonian"] },
  { code: "lv", name: "Latvian", aliases: ["lav", "latviešu", "latviesu", "latvian"] },
  { code: "lt", name: "Lithuanian", aliases: ["lit", "lietuvių", "lietuviu", "lithuanian"] },
  { code: "uk", name: "Ukrainian", aliases: ["ukr", "українська", "ukrainska", "ukrainian"] },
  { code: "be", name: "Belarusian", aliases: ["bel", "беларуская", "belarusian"] },
  { code: "ru", name: "Russian", aliases: ["rus", "русский", "russkij", "russian"] },
  { code: "tr", name: "Turkish", aliases: ["tur", "türkçe", "turkce", "turkish"] },
  { code: "az", name: "Azerbaijani", aliases: ["aze", "azərbaycan", "azerbaycan", "azerbaijani"] },
  { code: "kk", name: "Kazakh", aliases: ["kaz", "қазақ", "kazakh"] },
  { code: "uz", name: "Uzbek", aliases: ["uzb", "oʻzbek", "ozbek", "uzbek"] },
  { code: "ky", name: "Kyrgyz", aliases: ["kir", "кыргызча", "kyrgyz"] },
  { code: "tg", name: "Tajik", aliases: ["tgk", "тоҷикӣ", "tajik"] },
  { code: "tk", name: "Turkmen", aliases: ["tuk", "türkmen", "turkmen", "turkmen"] },
  { code: "ka", name: "Georgian", aliases: ["kat", "geo", "ქართული", "kartuli", "georgian"] },
  { code: "hy", name: "Armenian", aliases: ["hye", "arm", "հայերեն", "hayeren", "armenian"] },
  { code: "fo", name: "Faroese", aliases: ["fao", "føroyskt", "faroese"] },

  // ── East Asian languages ───────────────────────────────────────────
  { code: "ja", name: "Japanese", aliases: ["jpn", "日本語", "nihongo", "japanese"] },
  { code: "ko", name: "Korean", aliases: ["kor", "한국어", "hangugeo", "korean"] },
  { code: "zh", name: "Chinese", aliases: ["zho", "chi", "中文", "zhōngwén", "zhongwen", "chinese", "mandarin", "cantonese"] },
  { code: "yue", name: "Cantonese", aliases: ["yue", "粵語", "粤语", "cantonese"] },
  { code: "wuu", name: "Wu Chinese", aliases: ["wuu", "吴语", "wu chinese"] },
  { code: "hak", name: "Hakka", aliases: ["hak", "客家话", "hakka"] },
  { code: "mn", name: "Mongolian", aliases: ["mon", "монгол", "mongol", "mongolian"] },
  { code: "my", name: "Burmese", aliases: ["mya", "bur", "မြန်မာ", "myanma", "burmese"] },
  { code: "km", name: "Khmer", aliases: ["khm", "ខ្មែរ", "khmer"] },
  { code: "lo", name: "Lao", aliases: ["lao", "ລາວ", "lao"] },
  { code: "th", name: "Thai", aliases: ["tha", "ไทย", "thai"] },
  { code: "vi", name: "Vietnamese", aliases: ["vie", "Tiếng Việt", "tieng viet", "vietnamese"] },
  { code: "id", name: "Indonesian", aliases: ["ind", "Bahasa Indonesia", "bahasa indonesia", "indonesian"] },
  { code: "ms", name: "Malay", aliases: ["msa", "may", "Bahasa Melayu", "bahasa melayu", "malay"] },
  { code: "tl", name: "Filipino", aliases: ["tgl", "fil", "Filipino", "filipino", "tagalog"] },
  { code: "ceb", name: "Cebuano", aliases: ["ceb", "Sugbuanon", "cebuano"] },
  { code: "jv", name: "Javanese", aliases: ["jav", "Basa Jawa", "basa jawa", "javanese"] },
  { code: "su", name: "Sundanese", aliases: ["sun", "Basa Sunda", "basa sunda", "sundanese"] },

  // ── Middle Eastern / North African ─────────────────────────────────
  { code: "ar", name: "Arabic", aliases: ["ara", "العربية", "al-arabiyya", "arabic"] },
  { code: "he", name: "Hebrew", aliases: ["heb", "עברית", "ivrit", "hebrew"] },
  { code: "fa", name: "Persian", aliases: ["fas", "per", "فارسی", "farsi", "persian"] },
  { code: "ps", name: "Pashto", aliases: ["pus", "پښتو", "pashto", "pashtu"] },
  { code: "ku", name: "Kurdish", aliases: ["kur", "Kurdî", "kurdish"] },
  { code: "sd", name: "Sindhi", aliases: ["snd", "سنڌي", "sindhi"] },
  { code: "af", name: "Afrikaans", aliases: ["afr", "afrikaans"] },
  { code: "sw", name: "Swahili", aliases: ["swa", "Kiswahili", "kiswahili", "swahili"] },
  { code: "am", name: "Amharic", aliases: ["amh", "አማርኛ", "amharic"] },
  { code: "om", name: "Oromo", aliases: ["orm", "afaan oromoo", "oromo"] },
  { code: "so", name: "Somali", aliases: ["som", "Soomaali", "somali"] },
  { code: "ha", name: "Hausa", aliases: ["hau", "Harshen Hausa", "hausa"] },
  { code: "ig", name: "Igbo", aliases: ["ibo", "Asụsụ Igbo", "igbo"] },
  { code: "yo", name: "Yoruba", aliases: ["yor", "Èdè Yorùbá", "yoruba"] },
  { code: "zu", name: "Zulu", aliases: ["zul", "isiZulu", "zulu"] },
  { code: "xh", name: "Xhosa", aliases: ["xho", "isiXhosa", "xhosa"] },

  // ── Other / fallbacks ──────────────────────────────────────────────
  { code: "eo", name: "Esperanto", aliases: ["epo", "esperanto"] },
  { code: "la", name: "Latin", aliases: ["lat", "latina", "latin"] },
  { code: "yi", name: "Yiddish", aliases: ["yid", "ייִדיש", "yiddish"] },
  { code: "rm", name: "Romansh", aliases: ["roh", "rumantsch", "romansh"] },
];

/**
 * Build a lookup map from every alias (lowercased) → canonical entry.
 * Done once at module load for O(1) normalization.
 */
const LOOKUP: Map<string, CanonicalEntry> = (() => {
  const map = new Map<string, CanonicalEntry>();
  for (const entry of LANGUAGES) {
    // Map the canonical code itself
    map.set(entry.code.toLowerCase(), { code: entry.code, name: entry.name });
    for (const alias of entry.aliases) {
      map.set(alias.toLowerCase(), { code: entry.code, name: entry.name });
    }
  }
  return map;
})();

/**
 * Suffixes / qualifiers that sources append to language names.
 * Stripped before lookup. Always lowercase, with leading space OK.
 *
 * Examples that get stripped:
 *   "Hindi Dubbed"     → "Hindi"
 *   "Hindi Audio"      → "Hindi"
 *   "Hindi 5.1"        → "Hindi"
 *   "Hindi (Original)" → "Hindi"
 *   "English (US)"     → "English"
 */
const SUFFIX_PATTERNS: RegExp[] = [
  /\s+dubbed\b/i,
  /\s+dub\b/i,
  /\s+audio\b/i,
  /\s+language\b/i,
  /\s+track\b/i,
  /\s+\d+\.\d+\b/i,        // "5.1", "2.0", "7.1"
  /\s+(?:stereo|mono|surround|dolby)\b/i,
  /\s+\((?:original|dubbed|dub|audio|us|uk|in|gb|in-ind)\)/i,
  /\s+\[[a-z]{2}(?:-[a-z]{2})?\]/i, // "[hi]", "[hi-IN]"
];

/**
 * Normalize a single raw language string to { code, name }.
 *
 * Returns `null` when the string cannot be confidently identified.
 * The resolver drops `null` entries (better to omit than miscategorize).
 *
 * Strategy:
 *   1. Trim + lowercase.
 *   2. Try the raw string as-is (handles "hi", "hin", "hindi").
 *   3. Strip known suffixes ("dubbed", "audio", "5.1", "(original)", ...)
 *      and retry.
 *   4. Try just the primary subtag of a BCP-47 tag ("hi-IN" → "hi").
 *   5. Give up — return null.
 */
export function normalizeLanguage(raw: string): CanonicalEntry | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try the raw lowercased string first.
  let key = trimmed.toLowerCase();
  let hit = LOOKUP.get(key);
  if (hit) return hit;

  // Strip suffix patterns one at a time, retrying after each strip.
  let working = trimmed;
  for (const pattern of SUFFIX_PATTERNS) {
    working = working.replace(pattern, "").trim();
    if (!working) break;
    key = working.toLowerCase();
    hit = LOOKUP.get(key);
    if (hit) return hit;
  }

  // Try the primary subtag of a BCP-47 / locale tag: "hi-IN" → "hi"
  if (trimmed.includes("-") || trimmed.includes("_")) {
    const primary = trimmed.split(/[-_]/)[0]?.toLowerCase();
    if (primary) {
      hit = LOOKUP.get(primary);
      if (hit) return hit;
    }
  }

  // Try the last 2-3 chars if they look like a code (handles "audio:hi").
  const codeMatch = trimmed.match(/\b([a-z]{2,3})\b/i);
  if (codeMatch) {
    const maybeCode = codeMatch[1]!.toLowerCase();
    hit = LOOKUP.get(maybeCode);
    if (hit) return hit;
  }

  return null;
}

/**
 * Normalize a RawLanguageEntry from a source. Prefers the source's own
 * `code` if it's a valid lookup key; otherwise parses `raw`.
 *
 * Returns `null` when neither `code` nor `raw` can be identified.
 */
export function normalizeRawEntry(entry: RawLanguageEntry): CanonicalEntry | null {
  // Try the source-provided code first (it's usually already canonical).
  if (entry.code) {
    const hit = LOOKUP.get(entry.code.toLowerCase());
    if (hit) return hit;
  }
  // Try the source-provided name (if it's a clean display name).
  if (entry.name) {
    const hit = normalizeLanguage(entry.name);
    if (hit) return hit;
  }
  // Fall back to the raw string.
  return normalizeLanguage(entry.raw);
}

/**
 * Build a NormalizedLanguage from a TMDB `spoken_languages` entry.
 * TMDB already gives us `iso_639_1` (the canonical code) and
 * `english_name`, so we trust them.
 */
export function fromTmdbSpokenLanguage(input: {
  iso_639_1?: string;
  english_name?: string;
  name?: string;
}): NormalizedLanguage | null {
  const code = (input.iso_639_1 ?? "").trim().toLowerCase();
  if (!code) return null;
  // Verify the code is one we know. If not, but we have an english_name,
  // try to normalize via name.
  const known = LOOKUP.get(code);
  if (known) return { code: known.code, name: known.name };
  if (input.english_name) {
    const fallback = normalizeLanguage(input.english_name);
    if (fallback) return fallback;
  }
  // Last resort: trust TMDB's code + name as-is (rare languages).
  return {
    code,
    name: input.english_name || input.name || code
  };
}

/**
 * Normalize a TMDB `original_language` string (a single ISO 639-1 code
 * like "en", "sv", "hi").
 */
export function fromTmdbOriginalLanguage(code: string | undefined): NormalizedLanguage | null {
  if (!code) return null;
  const known = LOOKUP.get(code.toLowerCase());
  if (known) return { code: known.code, name: known.name };
  return { code: code.toLowerCase(), name: code };
}

export type { NormalizedLanguage };
