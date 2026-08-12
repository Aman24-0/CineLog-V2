// src/server/audio-language/sources/tmdb-translations.ts
//
// CineLog V2 — Audio Language Source: TMDB translations (low confidence)
// ---------------------------------------------------------------------
// TMDB's /movie/{id}/translations and /tv/{id}/translations endpoints
// list the (country, language) pairs for which TMDB has translated
// METADATA (title, overview, tagline). This is NOT a list of dubbed
// audio tracks — it's a list of metadata-translation locales.
//
// Why we still use it as a source:
//   1. It's a real, free, no-auth-required TMDB endpoint that we
//      already have a key for.
//   2. For some titles, the set of metadata-translation locales
//      correlates with the set of locales that have dubbed audio
//      (studios often translate metadata + dub together).
//   3. Per spec STEP 9: we EXPLICITLY mark this data as
//      `defaultConfidence: "low"` ("Detected", not "Verified"). The
//      UI shows it as "Detected" and the resolver NEVER upgrades it
//      to "high" based on this source alone.
//
// Per spec STEP 7 (no original-as-dubbed confusion): the resolver
// subtracts `originalLanguages` from all detected languages, so this
// source's translations do NOT pollute the dubbed list with original
// languages.
//
// Per spec STEP 8 (no hardcoded language filtering): we surface every
// translation locale the source returns — Hindi, Tamil, French, etc.
// No Indian-language-only filtering.
//
// Per spec STEP 24 (do not fake data): we never INVENT translations
// data. If TMDB returns no translations, we return `noData: true`.

import type {
  AudioLanguageSource,
  AudioLanguageSourceInput,
  AudioLanguageSourceResult,
  RawLanguageEntry
} from "../types";

/**
 * Fetch with timeout — TMDB can occasionally hang on cold caches.
 * 8s is enough for a single translations fetch; we don't want to
 * block the entire worker if TMDB is slow.
 */
async function fetchWithTimeout(
  url: string,
  ms: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
  } finally {
    clearTimeout(timer);
  }
}

interface TmdbTranslation {
  iso_639_1?: string;
  iso_3166_1?: string;
  name?: string;
  english_name?: string;
  data?: {
    title?: string;
    name?: string;
    overview?: string;
    tagline?: string;
    homepage?: string;
  };
}

interface TmdbTranslationsResponse {
  id?: number;
  translations?: TmdbTranslation[];
  success?: boolean;
  status_message?: string;
}

/**
 * TMDB translations source adapter.
 *
 * Returns metadata-translation locales as a LOW-confidence "detected"
 * signal. Per spec: never displayed as "Verified".
 */
export class TmdbTranslationsSource implements AudioLanguageSource {
  readonly name = "TMDB Translations";

  /**
   * The TMDB API key is read at call time. We use the same env var as
   * the rest of the app: `TMDB_API_KEY` (server-only). Falls back to
   * `VITE_TMDB_API_KEY` for compatibility with the existing pattern
   * in `src/core/tmdb/tmdb.ts:getTmdbApiKey()`.
   */
  private getApiKey(): string | null {
    const key = process.env.TMDB_API_KEY ?? process.env.VITE_TMDB_API_KEY;
    return key && key.length > 0 ? key : null;
  }

  async getAudioLanguages(
    input: AudioLanguageSourceInput
  ): Promise<AudioLanguageSourceResult> {
    const checkedAt = new Date().toISOString();

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        source: this.name,
        success: false,
        error: "TMDB_API_KEY not configured",
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    // TMDB uses "tv" for series — matches our `type` directly.
    const endpoint = `https://api.themoviedb.org/3/${input.type}/${input.tmdbId}/translations?api_key=${encodeURIComponent(apiKey)}`;

    let res: Response;
    try {
      res = await fetchWithTimeout(endpoint, 8000);
    } catch (err) {
      return {
        source: this.name,
        success: false,
        error: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    if (!res.ok) {
      // 404 is "title not on TMDB" — treat as noData, not as error.
      if (res.status === 404) {
        return {
          source: this.name,
          success: true,
          noData: true,
          languages: [],
          region: input.region,
          checkedAt
        };
      }
      return {
        source: this.name,
        success: false,
        error: `HTTP ${res.status}`,
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    let json: TmdbTranslationsResponse;
    try {
      json = await res.json();
    } catch (err) {
      return {
        source: this.name,
        success: false,
        error: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    if (json.success === false) {
      return {
        source: this.name,
        success: false,
        error: json.status_message ?? "TMDB returned success=false",
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    const translations = json.translations ?? [];
    if (translations.length === 0) {
      return {
        source: this.name,
        success: true,
        noData: true,
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    // Convert each translation entry to a RawLanguageEntry. We use the
    // ISO 639-1 code from TMDB directly (it's already canonical).
    // We ALSO filter out entries whose `data` is empty (no title AND
    // no overview AND no tagline) — those represent locales TMDB has
    // on file but no actual translated content for, so they're noise.
    const languages: RawLanguageEntry[] = [];
    for (const t of translations) {
      if (!t.iso_639_1) continue;
      const d = t.data ?? {};
      const hasContent =
        (d.title && d.title.length > 0) ||
        (d.name && d.name.length > 0) ||
        (d.overview && d.overview.length > 0) ||
        (d.tagline && d.tagline.length > 0);
      if (!hasContent) continue;

      languages.push({
        raw: t.iso_639_1,
        code: t.iso_639_1,
        name: t.english_name ?? t.name ?? t.iso_639_1
      });
    }

    if (languages.length === 0) {
      return {
        source: this.name,
        success: true,
        noData: true,
        languages: [],
        region: input.region,
        checkedAt
      };
    }

    return {
      source: this.name,
      success: true,
      languages,
      region: input.region,
      checkedAt,
      // Per spec STEP 9: never display low-confidence data as officially
      // confirmed. TMDB translations are metadata translations — NOT
      // confirmed audio dubs. Always "low".
      defaultConfidence: "low"
    };
  }
}
