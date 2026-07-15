// src/core/tmdb/tmdb.ts
import type {
  TMDBDetails,
  TMDBSeasonDetails,
  TMDBCollection,
  TMDBTitle,
  TMDBPerson,
  TMDBPersonCombinedCredits,
  TMDBVideo,
  TMDBWatchProviderResults,
  TMDBWatchProviderResponse,
} from "~/shared/types";
import { cachedFetch, buildCacheKey, TMDB_TTL } from "~/shared/utils/apiCache";
import { applyPosterQuality } from "~/core/preferences";

export const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY;

const IMG_BASE = "https://image.tmdb.org/t/p";
const API = "https://api.themoviedb.org/3";

/**
 * Build a TMDB image URL. Sizes follow TMDB's documented w-pixel conventions.
 * Returns "" if path is null/undefined (so callers can <Show when={url}>).
 *
 * Poster-quality preference is automatically applied (see src/core/preferences).
 * For hero/backdrop images ("w1280" / "original"), no downgrade happens.
 */
export const tmdbImage = (
  path: string | null | undefined,
  size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "w1280" | "original" = "w500"
): string => (path ? `${IMG_BASE}/${applyPosterQuality(size)}${path}` : "");

/** Cached fetch helper for TMDB JSON endpoints. */
async function tmdbFetch<T>(endpoint: string): Promise<T> {
  return cachedFetch(
    buildCacheKey(`tmdb:${endpoint}`),
    TMDB_TTL,
    async () => {
      const res = await fetch(`${API}${endpoint}&api_key=${TMDB_KEY}`);
      if (!res.ok) throw new Error(`TMDB request failed: ${res.status}`);
      return res.json() as Promise<T>;
    }
  );
}

export const fetchTmdbDetails = async (
  mediaType: string,
  id: string
): Promise<TMDBDetails> => {
  // append_to_response=videos,credits — fetches trailers AND cast/crew
  // in one request. The credits payload populates TMDBDetails.credits,
  // which the DetailsCast component reads to render cast & crew with
  // images (replacing the text-only OMDb actors list).
  //
  // v2.4: include_video_language=en,null — also include videos with no
  // language tag (covers most international trailers that aren't tagged
  // en-US). This fixes the bug where some titles showed NO trailer
  // button in the Details modal because their only trailers were tagged
  // with a non-English language or no language at all. The list of
  // languages is intentionally narrow (en,null) to keep the payload
  // small — if a title has only non-English trailers, the
  // useDetailsActions hook falls back to a separate /videos fetch
  // without language filter (see fetchAnyVideoKey below).
  return tmdbFetch<TMDBDetails>(
    `/${mediaType}/${id}?language=en-US&append_to_response=videos,credits&include_video_language=en,null`
  );
};

/**
 * Fetch TMDB person details by id.
 * Used by the PersonModal to show biography, birthday, place of birth,
 * known_for_department, etc.
 */
export async function fetchPersonDetails(
  personId: number | string,
): Promise<TMDBPerson | null> {
  try {
    return await tmdbFetch<TMDBPerson>(
      `/person/${personId}?language=en-US`,
    );
  } catch (err) {
    console.warn(`[tmdb] Failed to fetch person/${personId}:`, err);
    return null;
  }
}

/**
 * Fetch a person's combined credits (movies + TV in one payload).
 * Used by the PersonModal to show the full filmography grid. The
 * `cast` array is acting roles, `crew` is behind-the-scenes work.
 */
export async function fetchPersonCombinedCredits(
  personId: number | string,
): Promise<TMDBPersonCombinedCredits | null> {
  try {
    return await tmdbFetch<TMDBPersonCombinedCredits>(
      `/person/${personId}/combined_credits?language=en-US`,
    );
  } catch (err) {
    console.warn(`[tmdb] Failed to fetch person/${personId}/combined_credits:`, err);
    return null;
  }
}

/**
 * Fetch lightweight TMDB metadata (title, poster, backdrop, release date,
 * vote average) for a single movie or TV title by its TMDB id.
 *
 * Used by the vault enrichment layer (userLibraryAdapter) to fill in
 * display fields that are NOT stored in the Supabase `vault` table.
 * The vault only stores user-owned state (status, rating, notes) + the
 * TMDB id — the title/poster must be fetched from TMDB on every load.
 *
 * Returns null on error so the caller can fall back to "Untitled" /
 * "NO POSTER" placeholders rather than crashing the whole vault render.
 *
 * @param mediaType "movie" | "tv"
 * @param id        TMDB numeric id (as stored in vault.tmdb_id)
 */
export async function fetchTmdbMetadata(
  mediaType: "movie" | "tv",
  id: number | string,
): Promise<TMDBTitle | null> {
  try {
    const data = await tmdbFetch<TMDBTitle>(
      `/${mediaType}/${id}?language=en-US`,
    );
    return { ...data, media_type: mediaType };
  } catch (err) {
    console.warn(`[tmdb] Failed to fetch ${mediaType}/${id}:`, err);
    return null;
  }
}

/**
 * Batch-fetch TMDB metadata for multiple vault items.
 *
 * Fires all requests in parallel (Promise.allSettled) so one slow/failing
 * request doesn't block the others. Returns a Map keyed by "{media_type}/{id}"
 * for O(1) lookup during vault enrichment.
 *
 * @param items Array of { mediaType, tmdbId } pairs.
 * @returns Map<"movie|tv/{id}", TMDBTitle>
 */
export async function fetchTmdbMetadataBatch(
  items: ReadonlyArray<{ mediaType: "movie" | "tv"; tmdbId: number | string }>,
): Promise<Map<string, TMDBTitle>> {
  const results = await Promise.allSettled(
    items.map((item) => fetchTmdbMetadata(item.mediaType, item.tmdbId)),
  );
  const map = new Map<string, TMDBTitle>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) {
      const item = items[index];
      map.set(`${item.mediaType}/${item.tmdbId}`, result.value);
    }
  });
  return map;
}

export const fetchSeasonDetails = async (
  tvId: string | number,
  seasonNumber: number
): Promise<TMDBSeasonDetails> => {
  return tmdbFetch<TMDBSeasonDetails>(
    `/tv/${tvId}/season/${seasonNumber}?language=en-US`
  );
};

export const fetchCollectionDetails = async (
  collectionId: number
): Promise<TMDBCollection> => {
  return tmdbFetch<TMDBCollection>(
    `/collection/${collectionId}?language=en-US`
  );
};

/**
 * Fetch the watch providers (streaming/rent/buy) for a single movie or TV
 * title in a specific region.
 *
 * TMDB endpoint: /{mediaType}/{id}/watch/providers
 *
 * Returns the raw TMDB `results` object keyed by ISO 3166-1 country code.
 * Each country entry has:
 *   - link: TMDB watch page URL
 *   - flatrate: streaming providers (subscription)
 *   - rent: rental providers
 *   - buy: purchase providers
 *   - free: free (ad-supported) providers
 *   - ads: ad-supported providers
 *
 * Returns null on error so the caller can silently hide the section.
 */
export async function fetchTitleWatchProviders(
  mediaType: "movie" | "tv",
  id: number | string,
): Promise<TMDBWatchProviderResults | null> {
  try {
    const data = await tmdbFetch<TMDBWatchProviderResponse>(
      `/${mediaType}/${id}/watch/providers?language=en-US`,
    );
    return data?.results ?? null;
  } catch (err) {
    console.warn(`[tmdb] Failed to fetch watch/providers for ${mediaType}/${id}:`, err);
    return null;
  }
}

/**
 * Pick the best trailer from a TMDB details payload.
 *
 * v2.4: Broadened scoring so titles with NO Trailer/Teaser still surface
 * a playable video. Priority order:
 *   1. Official Trailer (+15)
 *   2. Official Teaser (+12)
 *   3. Trailer (+10)
 *   4. Teaser (+5)
 *   5. Official Clip / Featurette / Behind the Scenes / Bloopers (+6)
 *   6. Clip / Featurette / Behind the Scenes / Bloopers (+2)
 *   7. Any other YouTube video (+0)
 *
 * Also accepts Vimeo as a last-resort fallback (returns a key, but the
 * UI is currently YouTube-only — the caller should treat Vimeo keys as
 * "no playable trailer" unless they add a Vimeo player).
 *
 * Returns null if NO playable video (any site) is available.
 */
export const pickTrailer = (details: TMDBDetails | null): {
  key: string;
  name: string;
} | null => {
  const videos = details?.videos?.results;
  if (!videos || videos.length === 0) return null;

  // Prefer YouTube; fall back to Vimeo only if no YouTube at all.
  const youTube = videos.filter((v) => v.site === "YouTube");
  const vimeo = videos.filter((v) => v.site === "Vimeo");
  const pool = youTube.length > 0 ? youTube : vimeo;
  if (pool.length === 0) return null;

  const EXTRA_TYPES = new Set([
    "Clip",
    "Featurette",
    "Behind the Scenes",
    "Bloopers",
    "Recap",
    "Opening Credits",
  ]);

  const score = (v: (typeof pool)[number]): number => {
    let s = 0;
    if (v.type === "Trailer") s += 10;
    if (v.type === "Teaser") s += 5;
    if (EXTRA_TYPES.has(v.type)) s += 2;
    if (v.official) s += 5;
    return s;
  };

  const best = [...pool].sort((a, b) => score(b) - score(a))[0];
  return best ? { key: best.key, name: best.name } : null;
};

/**
 * v2.4: Fallback trailer fetch for titles whose main /details payload
 * had NO playable YouTube video (i.e. pickTrailer returned null).
 *
 * Why this is needed: fetchTmdbDetails uses language=en-US + the
 * `include_video_language=en,null` filter, which only returns English +
 * null-language videos. Many international titles (Bollywood, K-dramas,
 * anime) have trailers ONLY in their original language — those won't
 * appear in the main payload.
 *
 * This helper fetches /{mediaType}/{id}/videos with NO language filter
 * (which defaults to en-US but is broader in practice) AND with
 * `include_video_language` set to a list of common source languages.
 * It then re-runs the same pickTrailer-style scoring on the combined
 * results.
 *
 * Returns the best video key found, or null if still none.
 */
export async function fetchAnyVideoKey(
  mediaType: "movie" | "tv",
  id: number | string,
): Promise<string | null> {
  try {
    const endpoint = `/${mediaType}/${id}/videos?language=en-US&include_video_language=en,null,hi,ja,ko,zh,es,fr,de,it,pt,ru,ta,te,mr,bn`;
    const data = await tmdbFetch<{ results: TMDBVideo[] }>(endpoint);
    const videos = data?.results ?? [];
    if (videos.length === 0) return null;

    const youTube = videos.filter((v) => v.site === "YouTube");
    if (youTube.length === 0) return null;

    const EXTRA_TYPES = new Set([
      "Clip",
      "Featurette",
      "Behind the Scenes",
      "Bloopers",
      "Recap",
      "Opening Credits",
    ]);

    const score = (v: (typeof youTube)[number]): number => {
      let s = 0;
      if (v.type === "Trailer") s += 10;
      if (v.type === "Teaser") s += 5;
      if (EXTRA_TYPES.has(v.type)) s += 2;
      if (v.official) s += 5;
      return s;
    };

    const best = [...youTube].sort((a, b) => score(b) - score(a))[0];
    return best?.key ?? null;
  } catch (err) {
    console.warn(`[tmdb] fetchAnyVideoKey failed for ${mediaType}/${id}:`, err);
    return null;
  }
}
