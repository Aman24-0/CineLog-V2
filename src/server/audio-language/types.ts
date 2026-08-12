// src/server/audio-language/types.ts
//
// CineLog V2 — Audio Language Worker: shared types
// ---------------------------------------------------------------------
// The worker follows a source-adapter architecture:
//
//   TMDB ID (+ type)
//     ↓
//   resolver
//     ├─→ SourceAdapter A → raw result
//     ├─→ SourceAdapter B → raw result
//     └─→ SourceAdapter C → raw result
//     ↓
//   normalizer (ISO 639-1 / BCP-47)
//     ↓
//   dedup + confidence resolution
//     ↓
//   dubbed = detectedAudio − originalLanguages
//     ↓
//   cache (audio_languages_cache table)
//     ↓
//   API endpoint / modal
//
// Each source adapter implements `AudioLanguageSource`. The resolver
// runs them in parallel (Promise.allSettled) so one slow/failing source
// does NOT block the others. Sources are independent — adding a new
// source is a single-file change.

/**
 * The kind of title the worker is querying for.
 * TMDB uses "movie" and "tv"; we mirror that here.
 */
export type TitleType = "movie" | "tv";

/**
 * A normalized language entry — the canonical form every source's raw
 * result is converted to before merging.
 *
 * `code` is the ISO 639-1 (two-letter) code where one exists. For
 * languages without a 2-letter code (e.g. Rajasthani), we fall back to
 * the ISO 639-3 (three-letter) code. We never store raw display strings
 * as the identity — `code` is always the identity, `name` is for UI.
 *
 * `name` is the English display name (matches TMDB's
 * `spoken_languages[].english_name` convention).
 */
export interface NormalizedLanguage {
  /** ISO 639-1 (preferred) or ISO 639-3 code. Lowercase. */
  code: string;
  /** English display name (e.g. "Hindi", "French"). */
  name: string;
}

/**
 * Confidence levels for a dubbed-language entry.
 *
 * - "high"     — multiple independent sources agree, OR a single
 *                first-party source (e.g. a streaming provider's own
 *                catalogue metadata) explicitly lists the audio track.
 * - "medium"   — one reliable source confirms the audio language.
 * - "low"      — language is inferred from less reliable metadata
 *                (e.g. metadata-translation availability, file/stream
 *                metadata). Surfaced in the UI as "Detected", never as
 *                "Verified".
 *
 * Per spec STEP 9: never display low-confidence data as officially
 * confirmed.
 */
export type Confidence = "high" | "medium" | "low";

/**
 * A single dubbed-language entry in the final worker result.
 */
export interface DubbedLanguageEntry {
  code: string;
  name: string;
  confidence: Confidence;
  /** Names of the sources that contributed this language. */
  sources: string[];
}

/**
 * A language entry returned by a single source, BEFORE normalization
 * and merge. Sources return raw strings + an optional best-effort code;
 * the normalizer takes care of producing a NormalizedLanguage.
 */
export interface RawLanguageEntry {
  /** Raw display string from the source (e.g. "Hindi", "hi", "hi-IN"). */
  raw: string;
  /** Optional pre-mapped code from the source. */
  code?: string;
  /** Optional English display name from the source. */
  name?: string;
}

/**
 * The result returned by a single source adapter.
 *
 * `success: false` means the source could not be reached (network error,
 * 403, parse failure). It does NOT mean "the title has no dubs" — see
 * `noData`.
 *
 * `noData: true` means the source reached successfully but has no
 * audio-language information for this title. This is distinct from
 * `success: false` because it does NOT lower our confidence in OTHER
 * sources' results.
 *
 * Per spec STEP 10: absence of metadata is NEVER converted into
 * "unavailable". `noData: true` contributes nothing to the merge and
 * does not affect the final `status`.
 */
export interface AudioLanguageSourceResult {
  /** Source name (matches `AudioLanguageSource.name`). */
  source: string;
  /** Did the source respond successfully? */
  success: boolean;
  /** Did the source explicitly have no audio-language data? */
  noData?: boolean;
  /** Raw language entries from this source. */
  languages: RawLanguageEntry[];
  /** Region the source was queried for (e.g. "IN"). */
  region?: string;
  /** ISO timestamp the source was queried at. */
  checkedAt: string;
  /** Error message if `success` is false. */
  error?: string;
  /**
   * Optional: the source's own confidence in this data. Defaults to
   * "medium" for source-confirmed audio tracks; "low" for inferred
   * metadata. The resolver may upgrade to "high" if multiple sources
   * agree.
   */
  defaultConfidence?: Confidence;
}

/**
 * The input passed to each source adapter.
 *
 * `tmdbId` is always present. `imdbId` is resolved by the resolver
 * (via TMDB's /movie/{id} or /tv/{id}/external_ids endpoint) before
 * sources are queried, so adapters that need IMDb don't each have to
 * resolve it themselves.
 */
export interface AudioLanguageSourceInput {
  tmdbId: number;
  type: TitleType;
  /** IMDb ID, if resolvable. May be undefined for some titles. */
  imdbId?: string;
  /** ISO 3166-1 region code (e.g. "IN"). */
  region: string;
  /** Optional: TMDB title (for source-side matching heuristics). */
  title?: string;
  /** Optional: TMDB original_language (e.g. "en"). */
  originalLanguage?: string;
}

/**
 * The contract every source adapter implements.
 *
 * Adapters MUST:
 *   - Never throw — wrap all errors in `{ success: false, error }`.
 *   - Never bypass authentication, DRM, or access controls.
 *   - Never download or redistribute copyrighted video.
 *   - Return raw entries; the normalizer handles canonicalization.
 *
 * Adapters MAY:
 *   - Make network requests to public endpoints.
 *   - Use server-side environment variables for API keys.
 *   - Return `noData: true` when the source has nothing for this title.
 */
export interface AudioLanguageSource {
  /** Human-readable source name (used in UI + logs). */
  readonly name: string;
  /**
   * Query the source for audio-language information.
   * MUST NOT throw — always return an `AudioLanguageSourceResult`.
   */
  getAudioLanguages(
    input: AudioLanguageSourceInput
  ): Promise<AudioLanguageSourceResult>;
}

// ─── Final worker result types ────────────────────────────────────────

/**
 * The status of the worker's overall result.
 *
 * - "success"  — at least one source returned data. `dubbedLanguages`
 *                may still be empty (if no dubs were found).
 * - "unknown"  — no source returned usable data. Distinct from
 *                "the title has no dubs" — we just don't know.
 * - "error"    — the worker itself failed (e.g. could not resolve
 *                TMDB metadata). The UI shows an error state.
 *
 * Per spec STEP 10: "unknown" must NEVER be reported as
 * "no dubbed languages exist".
 */
export type WorkerStatus = "success" | "unknown" | "error";

/**
 * The final worker result returned to the API endpoint and cached in
 * the database. Stored as `data` in `audio_languages_cache`.
 */
export interface AudioLanguageResult {
  tmdbId: number;
  type: TitleType;

  /** Original/spoken languages from TMDB (TMDB `spoken_languages`). */
  originalLanguages: NormalizedLanguage[];

  /**
   * Dubbed audio languages = (union of all source-detected audio
   * languages) MINUS originalLanguages.
   */
  dubbedLanguages: DubbedLanguageEntry[];

  /**
   * All audio languages detected by sources (BEFORE subtracting
   * originalLanguages). Kept for debugging + future UI use.
   */
  detectedAudioLanguages: DubbedLanguageEntry[];

  /** Per-source raw results (for the "source" indicator in the UI). */
  sources: AudioLanguageSourceResult[];

  status: WorkerStatus;

  /** Region the worker queried (e.g. "IN"). */
  region: string;

  /** ISO timestamp the worker ran. */
  checkedAt: string;

  /** ISO timestamp the cache entry expires. */
  expiresAt?: string;

  /**
   * For series: per-season audio availability, when a source provides
   * it. Keys are season numbers (as strings). Values are language
   * codes. Empty/missing when no source exposes season-level data —
   * in that case the UI shows "Season-specific data unavailable".
   */
  seasonAvailability?: Record<string, string[]>;

  /** Optional IMDb ID resolved during the worker run. */
  imdbId?: string;
}

/**
 * Compact API response — the full result is reduced to what the UI needs.
 * Raw source payloads stay server-side.
 */
export interface AudioLanguageApiResponse {
  tmdbId: number;
  type: TitleType;
  originalLanguages: NormalizedLanguage[];
  dubbedLanguages: Array<{
    code: string;
    name: string;
    confidence: Confidence;
    sources: string[];
  }>;
  status: WorkerStatus;
  checkedAt: string;
  region: string;
  /** True when no source provided any audio-language data. */
  noData: boolean;
  /** True when the worker encountered an error. */
  error: boolean;
  /** Optional error message (only present when status === "error"). */
  message?: string;
  /** Per-season availability (series only). */
  seasonAvailability?: Record<string, string[]>;
  /** Number of source adapters that returned success. */
  sourceCount: number;
  /** Whether the result was served from cache. */
  fromCache: boolean;
  /** Whether the cache was stale (and a refresh was triggered). */
  stale?: boolean;
}
