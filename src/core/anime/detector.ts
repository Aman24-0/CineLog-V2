// src/core/anime/detector.ts
//
// Anime Detection
// ---------------------------------------------------------------------
// Determines whether a TMDB-sourced title is "anime" so the rest of
// the app can fetch AniList enrichment (characters, voice actors,
// relations, airing schedule, OP/ED themes).
//
// SIGNALS (any one is enough — we use a multi-signal approach so we
// don't miss titles whose TMDB metadata is sparse):
//
//   1. Origin country includes "JP" + Animation genre (genre id 16)
//      → strong signal. This catches most anime TV series.
//
//   2. TMDB genre 16 (Animation) + original language "ja" (Japanese)
//      → strong signal for movies (e.g. Spirited Away, Your Name).
//
//   3. Title/overview contains anime keywords ("anime", "manga",
//      "Japanese animation", "ova", "light novel adaptation", etc.)
//      → weak signal, only used if no strong signal.
//
//   4. The TMDB id exists in the local `anime_mappings` table — i.e.
//      a previous automap or admin entry confirmed the title is anime.
//      → strong signal. Looked up via the mapping repository.
//
//   5. AniList title search returns a result with a close title match
//      + year match → strong signal (used by automap only, not by
//      the synchronous detector, since search is expensive).
//
// IMPORTANT: detector.ts is synchronous-friendly. It performs ONLY
// in-memory heuristics (signals 1-3). The async mapping-table lookup
// (signal 4) is in `isAnimeByMapping()` and is called separately by
// the caller. This separation lets the detector run inside render
// paths without blocking on a DB query.
//
// USAGE:
//   import { isAnimeByHeuristics, isAnimeByMapping, detectAnime } from "~/core/anime/detector";
//
//   // Quick synchronous check (no DB):
//   if (isAnimeByHeuristics(title)) { ... }
//
//   // Full check (DB + heuristics):
//   const isAnime = await detectAnime(title);

import type { TMDBTitle, TMDBDetails } from "~/shared/types";

// ─── Constants ──────────────────────────────────────────────────────

/** TMDB genre id 16 = "Animation" (same id for movies and TV). */
export const GENRE_ID_ANIMATION = 16;

/**
 * Japanese origin country code (ISO 3166-1 alpha-2).
 * Used by signal 1.
 */
export const COUNTRY_JP = "JP";

/**
 * Japanese language code (ISO 639-1).
 * Used by signal 2.
 */
export const LANGUAGE_JA = "ja";

/**
 * Keywords that strongly suggest an anime title. Matched case-insensitively
 * against the title + overview. We require the keyword to appear as a
 * standalone word (not a substring) to avoid false positives like
 * "Animetown" matching "anime".
 *
 * NOTE: "anime" itself is not a strong keyword in overviews because
 * Western marketing copy sometimes uses it loosely. We weight it
 * lower than "ova", "light novel", "manga adaptation", etc.
 */
const STRONG_KEYWORDS: string[] = [
  "ova",
  "ona",
  "light novel adaptation",
  "manga adaptation",
  "japanese animation"
];

const WEAK_KEYWORDS: string[] = ["anime", "manga", "shounen", "shoujo", "seinen", "isekai"];

// ─── Helpers ────────────────────────────────────────────────────────

function includesWord(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  // Word-boundary regex; case-insensitive.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  return re.test(haystack);
}

function anyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((k) => includesWord(text, k));
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Synchronous heuristic check — uses ONLY in-memory signals (genres,
 * origin country, language, keywords). No DB / network.
 *
 * @returns true if any strong heuristic signal is present.
 */
export function isAnimeByHeuristics(title: {
  genre_ids?: number[];
  genres?: Array<{ id: number } | number>;
  origin_country?: string[];
  spoken_languages?: Array<{ iso_639_1?: string }>;
  original_language?: string;
  title?: string;
  name?: string;
  overview?: string;
}): boolean {
  // ── Signal 1: JP origin + Animation genre ─────────────────────────
  const genreIds: number[] = [];
  if (Array.isArray(title.genre_ids)) {
    genreIds.push(...title.genre_ids);
  }
  if (Array.isArray(title.genres)) {
    for (const g of title.genres) {
      if (typeof g === "number") genreIds.push(g);
      else if (g && typeof g.id === "number") genreIds.push(g.id);
    }
  }
  const hasAnimationGenre = genreIds.includes(GENRE_ID_ANIMATION);

  const originCountry = Array.isArray(title.origin_country)
    ? title.origin_country
    : [];
  const isJapaneseOrigin = originCountry.includes(COUNTRY_JP);

  if (hasAnimationGenre && isJapaneseOrigin) return true;

  // ── Signal 2: Animation genre + Japanese language ─────────────────
  const langs = Array.isArray(title.spoken_languages)
    ? title.spoken_languages.map((l) => l?.iso_639_1).filter(Boolean)
    : [];
  const originalLang = title.original_language;
  const hasJapanese =
    langs.includes(LANGUAGE_JA) || originalLang === LANGUAGE_JA;

  if (hasAnimationGenre && hasJapanese) return true;

  // ── Signal 3: Strong keyword in title or overview ─────────────────
  const combinedText = `${title.title ?? ""} ${title.name ?? ""} ${title.overview ?? ""}`;
  if (anyKeyword(combinedText, STRONG_KEYWORDS)) return true;

  // ── Signal 3b: Weak keyword + JP origin (avoids false positives
  //              like "Animetown" matching just "anime") ──────────────
  if (isJapaneseOrigin && anyKeyword(combinedText, WEAK_KEYWORDS)) return true;

  return false;
}

/**
 * Async check via the mapping table. Returns true if the TMDB id is
 * already in `anime_mappings` (i.e. previously confirmed as anime).
 *
 * This is a SEPARATE function from isAnimeByHeuristics so the caller
 * can decide whether to incur the DB round-trip. The Discover page
 * uses only heuristics (no DB); the Details page uses both.
 *
 * @param tmdbId The TMDB id (movie or tv).
 */
export async function isAnimeByMapping(tmdbId: number): Promise<boolean> {
  // Lazy import to avoid pulling the supabase client into the bundle
  // when this function is never called (e.g. on the Discover page).
  const { getAnilistId } = await import("~/lib/supabase/repositories/animeMapping");
  const id = await getAnilistId(tmdbId);
  return id !== null;
}

/**
 * Full async detection — runs heuristics first (fast, no DB), then
 * falls back to a mapping table lookup. Returns true if EITHER signal
 * is present.
 *
 * This is the function callers should use when they need the
 * authoritative answer (e.g. the Details page before fetching
 * AniList enrichment).
 */
export async function detectAnime(
  title: Parameters<typeof isAnimeByHeuristics>[0] & { id?: number | string }
): Promise<boolean> {
  if (isAnimeByHeuristics(title)) return true;
  if (title.id != null) {
    const tmdbId = typeof title.id === "string" ? parseInt(title.id, 10) : title.id;
    if (!Number.isNaN(tmdbId)) {
      try {
        return await isAnimeByMapping(tmdbId);
      } catch {
        // DB lookup failed — fall through to false. The Details page
        // will just skip AniList enrichment silently.
        return false;
      }
    }
  }
  return false;
}

/**
 * Detect anime from a TMDBDetails payload (the full /movie/{id} or
 * /tv/{id} response). Convenience wrapper that extracts the relevant
 * fields into the shape isAnimeByHeuristics expects.
 */
export function isAnimeDetails(details: TMDBDetails | null): boolean {
  if (!details) return false;
  return isAnimeByHeuristics({
    genre_ids: [],
    genres: Array.isArray(details.genres) ? details.genres : [],
    origin_country: Array.isArray(details.origin_country) ? details.origin_country : [],
    spoken_languages: Array.isArray(details.spoken_languages) ? details.spoken_languages : [],
    original_language: details.original_language,
    title: details.title,
    name: details.name,
    overview: details.overview
  });
}

/**
 * Detect anime from a TMDBTitle (the lightweight shape used by Discover
 * rails and vault items). Convenience wrapper.
 */
export function isAnimeTitle(title: TMDBTitle): boolean {
  return isAnimeByHeuristics({
    genre_ids: title.genre_ids,
    genres: title.genres?.map((g) => g as unknown as { id: number }) as Array<{ id: number }> | undefined,
    origin_country: title.origin_country,
    spoken_languages: title.spoken_languages as Array<{ iso_639_1?: string }> | undefined,
    title: title.title,
    name: title.name,
    overview: title.overview
  });
}
