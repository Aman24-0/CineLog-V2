// src/server/audio-language/resolver.ts
//
// CineLog V2 — Audio Language Resolver (orchestrator)
// ---------------------------------------------------------------------
// Given a TMDB ID + type, runs all registered source adapters in
// parallel, normalizes their results, dedupes, and produces the final
// `AudioLanguageResult`.
//
// PIPELINE (per spec STEP 2):
//
//   TMDB ID + type
//     ↓
//   fetch TMDB metadata (title, original_language, spoken_languages, imdb_id)
//     ↓
//   build originalLanguages  ← from TMDB spoken_languages (+original_language)
//     ↓
//   resolve imdbId           ← from TMDB movie/tv external_ids
//     ↓
//   run all sources in parallel (Promise.allSettled)
//     ↓
//   normalize each source's raw languages → NormalizedLanguage
//     ↓
//   merge: group by `code`, track sources + per-source confidence
//     ↓
//   confidence resolution:
//     - "high"   if ≥2 independent sources agree (JustWatch multi-provider
//                 already counts as 1 source reporting high)
//     - "medium" if exactly 1 reliable source (JustWatch, OTT metadata)
//     - "low"    if only low-confidence sources (TMDB translations,
//                 stream/file metadata) contributed
//     ↓
//   dubbedLanguages = detectedAudioLanguages − originalLanguages
//     ↓
//   return AudioLanguageResult
//
// Per spec STEP 7: original/spoken languages are NEVER shown as dubbed,
//   even if a source reports an audio track matching an original language.
// Per spec STEP 10: unknown data is NEVER reported as "unavailable".
//   If no source returned any data, status = "unknown" (NOT "no dubs").
// Per spec STEP 24: we never fabricate data. Every language in the
//   result has at least one real source behind it.

import type {
  AudioLanguageResult,
  AudioLanguageSource,
  AudioLanguageSourceInput,
  AudioLanguageSourceResult,
  Confidence,
  DubbedLanguageEntry,
  NormalizedLanguage,
  RawLanguageEntry,
  TitleType,
  WorkerStatus
} from "./types";
import { normalizeRawEntry, fromTmdbSpokenLanguage, fromTmdbOriginalLanguage } from "./normalizer";

// ─── TMDB metadata fetch (server-only) ────────────────────────────────

interface TmdbTitleMeta {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
  spoken_languages?: Array<{ iso_639_1?: string; english_name?: string; name?: string }>;
  imdb_id?: string;
  id?: number;
}

interface TmdbExternalIds {
  imdb_id?: string;
  tvdb_id?: number;
  wikidata_id?: string;
  facebook_id?: string;
  instagram_id?: string;
  twitter_id?: string;
}

/** Read the TMDB API key from server-side env (same pattern as tmdb.ts). */
function getTmdbApiKey(): string | null {
  const key = process.env.TMDB_API_KEY ?? process.env.VITE_TMDB_API_KEY;
  return key && key.length > 0 ? key : null;
}

/** Fetch with timeout — TMDB can occasionally hang on cold caches. */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
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

/** Fetch the title + original_language + spoken_languages + imdb_id from TMDB. */
async function fetchTmdbTitleMeta(
  tmdbId: number,
  type: TitleType
): Promise<{ meta: TmdbTitleMeta | null; error?: string }> {
  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    return { meta: null, error: "TMDB_API_KEY not configured" };
  }
  const endpoint = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${encodeURIComponent(apiKey)}&language=en-US`;
  try {
    const res = await fetchWithTimeout(endpoint, 8000);
    if (!res.ok) {
      return { meta: null, error: `TMDB HTTP ${res.status}` };
    }
    const json = (await res.json()) as TmdbTitleMeta;
    return { meta: json };
  } catch (err) {
    return {
      meta: null,
      error: `TMDB fetch failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/** Fetch external IDs (imdb_id, tvdb_id, etc.) for a TMDB title. */
async function fetchTmdbExternalIds(
  tmdbId: number,
  type: TitleType
): Promise<TmdbExternalIds | null> {
  const apiKey = getTmdbApiKey();
  if (!apiKey) return null;
  const endpoint = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetchWithTimeout(endpoint, 8000);
    if (!res.ok) return null;
    return (await res.json()) as TmdbExternalIds;
  } catch {
    return null;
  }
}

// ─── Merge / confidence logic ─────────────────────────────────────────

interface MergedLanguage {
  code: string;
  name: string;
  sources: Set<string>;
  /** Per-source confidence flags — the resolver takes the MAX. */
  confidences: Confidence[];
  /** The originating source result objects (for debugging / UI). */
  sourceResults: AudioLanguageSourceResult[];
}

/**
 * Map a confidence level to a numeric rank for `Math.max`-style comparison.
 */
function confidenceRank(c: Confidence): number {
  switch (c) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function rankToConfidence(rank: number): Confidence {
  if (rank >= 3) return "high";
  if (rank >= 2) return "medium";
  return "low";
}

/**
 * Resolve the final confidence for a merged language.
 *
 * - "high" if either:
 *     (a) ≥2 INDEPENDENT sources contributed it (regardless of their
 *         individual confidence), OR
 *     (b) the JustWatch source explicitly flagged it as "high" because
 *         ≥2 providers reported it.
 * - "medium" if exactly 1 reliable source (medium defaultConfidence)
 *     contributed it.
 * - "low" if only low-confidence sources contributed it.
 */
function resolveConfidence(merged: MergedLanguage): Confidence {
  const maxRank = Math.max(...merged.confidences.map(confidenceRank), 0);
  // ≥2 distinct sources agreeing → upgrade to "high" regardless of
  // individual source confidence. The exception: a single source that
  // reports high (e.g. JustWatch multi-provider) is already high.
  if (merged.sources.size >= 2) return "high";
  return rankToConfidence(maxRank);
}

/**
 * Convert a list of source results into a Map<code, MergedLanguage>.
 *
 * Each source's RawLanguageEntry[] is normalized; entries that don't
 * normalize to a known { code, name } are dropped (better to omit than
 * miscategorize).
 */
function mergeSourceResults(
  sourceResults: AudioLanguageSourceResult[]
): Map<string, MergedLanguage> {
  const merged = new Map<string, MergedLanguage>();
  for (const sr of sourceResults) {
    if (!sr.success || sr.noData) continue;
    const defaultConfidence: Confidence = sr.defaultConfidence ?? "medium";
    for (const raw of sr.languages) {
      const normalized = normalizeRawEntry(raw);
      if (!normalized) continue;
      let entry = merged.get(normalized.code);
      if (!entry) {
        entry = {
          code: normalized.code,
          name: normalized.name,
          sources: new Set<string>(),
          confidences: [],
          sourceResults: []
        };
        merged.set(normalized.code, entry);
      }
      // Prefer the source-provided english_name if the current name is
      // just the code (normalizer may fall back to code when name is missing).
      if (entry.name === entry.code && normalized.name !== normalized.code) {
        entry.name = normalized.name;
      }
      entry.sources.add(sr.source);
      entry.confidences.push(defaultConfidence);
      entry.sourceResults.push(sr);
    }
  }
  return merged;
}

/**
 * Convert a merged map to a sorted array of DubbedLanguageEntry.
 * Sort order: confidence (high → medium → low), then alphabetical by name.
 */
function mergedToEntries(
  merged: Map<string, MergedLanguage>
): DubbedLanguageEntry[] {
  const entries: DubbedLanguageEntry[] = [];
  for (const m of merged.values()) {
    entries.push({
      code: m.code,
      name: m.name,
      confidence: resolveConfidence(m),
      sources: Array.from(m.sources).sort()
    });
  }
  entries.sort((a, b) => {
    const c = confidenceRank(b.confidence) - confidenceRank(a.confidence);
    if (c !== 0) return c;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

// ─── The resolver ─────────────────────────────────────────────────────

export interface ResolveOptions {
  /**
   * ISO 3166-1 alpha-2 region code (e.g. "IN", "US", "DE"). The caller
   * (worker) is expected to pass the user's profile country dynamically.
   * Falls back to "US" when omitted — NEVER "IN" (spec §7: do not
   * hard-code "IN").
   */
  region?: string;
  /** Optional: pre-resolved IMDb ID (skip TMDB external_ids fetch). */
  imdbId?: string;
}

/**
 * Run all source adapters against a TMDB title and produce the final
 * AudioLanguageResult. Does NOT throw — wraps all errors in
 * `status: "error"`.
 *
 * @param sources  The list of registered source adapters (injected by
 *   the worker). The resolver does NOT import them directly so that
 *   tests can swap them out.
 * @param tmdbId   TMDB numeric ID.
 * @param type     "movie" | "tv".
 * @param opts     Optional region + pre-resolved IMDb ID.
 */
export async function resolveAudioLanguages(
  sources: readonly AudioLanguageSource[],
  tmdbId: number,
  type: TitleType,
  opts: ResolveOptions = {}
): Promise<AudioLanguageResult> {
  const region = opts.region ?? "US";
  const checkedAt = new Date().toISOString();

  // ── 1. Fetch TMDB metadata (title + original_language + spoken_languages) ──
  const { meta: tmdbMeta, error: tmdbErr } = await fetchTmdbTitleMeta(tmdbId, type);

  // Build originalLanguages from TMDB spoken_languages. If TMDB fetch
  // failed, we have no originals — but we can still attempt sources
  // (which may surface their own audio data). The result will be marked
  // with status="success" but the originalLanguages array will be empty.
  let originalLanguages: NormalizedLanguage[] = [];
  let title: string | undefined;
  let originalLanguageCode: string | undefined;
  let imdbId: string | undefined = opts.imdbId;

  if (tmdbMeta) {
    title = tmdbMeta.title ?? tmdbMeta.original_title ?? tmdbMeta.name ?? tmdbMeta.original_name;
    originalLanguageCode = tmdbMeta.original_language;
    if (tmdbMeta.spoken_languages && tmdbMeta.spoken_languages.length > 0) {
      for (const sl of tmdbMeta.spoken_languages) {
        const n = fromTmdbSpokenLanguage(sl);
        if (n) originalLanguages.push(n);
      }
    }
    // If spoken_languages was empty but we have original_language, use it.
    if (originalLanguages.length === 0 && originalLanguageCode) {
      const n = fromTmdbOriginalLanguage(originalLanguageCode);
      if (n) originalLanguages.push(n);
    }
    // Prefer the imdb_id from the title endpoint (movies expose it there).
    if (!imdbId && tmdbMeta.imdb_id) {
      imdbId = tmdbMeta.imdb_id;
    }
  }

  // ── 2. Resolve IMDb ID (for sources that need it) ─────────────────
  if (!imdbId) {
    const externals = await fetchTmdbExternalIds(tmdbId, type);
    if (externals?.imdb_id) {
      imdbId = externals.imdb_id;
    }
  }

  console.log(
    `[AUDIO] TMDB ID: ${tmdbId} (${type})\n` +
      `[AUDIO] IMDb ID: ${imdbId ?? "(unresolved)"}\n` +
      `[AUDIO] Original: ${originalLanguages.map((l) => l.code).join(", ") || "(none)"}\n` +
      `[AUDIO] Region: ${region}`
  );

  // ── 3. Build the source input ────────────────────────────────────
  const sourceInput: AudioLanguageSourceInput = {
    tmdbId,
    type,
    imdbId,
    region,
    title,
    originalLanguage: originalLanguageCode
  };

  // ── 4. Run all sources in parallel (Promise.allSettled) ──────────
  const sourceResults: AudioLanguageSourceResult[] = [];
  const settled = await Promise.allSettled(
    sources.map((s) => s.getAudioLanguages(sourceInput))
  );
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      sourceResults.push(result.value);
      const sr = result.value;
      const langs = sr.languages
        .map((l) => l.code ?? l.raw)
        .filter(Boolean)
        .join(", ");
      console.log(
        `[AUDIO] Source: ${sr.source}\n` +
          `[AUDIO] Status: ${sr.success ? (sr.noData ? "noData" : "success") : "error"}\n` +
          `[AUDIO] Languages: ${langs || "(none)"}` +
          (sr.error ? `\n[AUDIO] Error: ${sr.error}` : "")
      );
    } else {
      // Adapter threw — wrap as a failed result so it shows up in the
      // UI's source list. This should NEVER happen per the AudioLanguageSource
      // contract (adapters must not throw), but we handle it defensively.
      const sourceName = sources[i]?.name ?? "unknown";
      const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn(`[AUDIO] Source: ${sourceName} threw:`, errMsg);
      sourceResults.push({
        source: sourceName,
        success: false,
        error: `adapter threw: ${errMsg}`,
        languages: [],
        region,
        checkedAt
      });
    }
  }

  // ── 5. Merge + normalize + dedup ─────────────────────────────────
  const merged = mergeSourceResults(sourceResults);
  const detectedAudioLanguages = mergedToEntries(merged);

  console.log(
    `[AUDIO] Normalized (detected): ${detectedAudioLanguages.map((l) => l.code).join(", ") || "(none)"}`
  );

  // ── 6. dubbedLanguages = detectedAudioLanguages − originalLanguages ──
  const originalCodes = new Set(originalLanguages.map((l) => l.code));
  const dubbedLanguages = detectedAudioLanguages.filter(
    (l) => !originalCodes.has(l.code)
  );

  console.log(
    `[AUDIO] Final dubbed: ${dubbedLanguages.map((l) => l.code).join(", ") || "(none)"}`
  );

  // ── 7. Compute overall status ────────────────────────────────────
  // - "error"   if TMDB fetch failed AND no source returned data
  // - "unknown" if no source returned any audio data (but no error)
  // - "success" if at least one source contributed data (even if dubbed
  //             list is empty after subtracting originals)
  let status: WorkerStatus;
  let statusMessage: string | undefined;

  const anySourceSucceeded = sourceResults.some(
    (s) => s.success && !s.noData && s.languages.length > 0
  );
  const allSourcesNoData = sourceResults.every(
    (s) => !s.success || s.noData || s.languages.length === 0
  );

  if (tmdbErr && !anySourceSucceeded) {
    status = "error";
    statusMessage = tmdbErr;
  } else if (allSourcesNoData) {
    status = "unknown";
  } else {
    status = "success";
  }

  return {
    tmdbId,
    type,
    originalLanguages,
    dubbedLanguages,
    detectedAudioLanguages,
    sources: sourceResults,
    status,
    region,
    checkedAt,
    imdbId
  };
}

// Re-export for callers that need to inspect source results.
export { mergeSourceResults, mergedToEntries };
export type { MergedLanguage };
