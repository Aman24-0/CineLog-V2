// src/core/tmdb/discoverNormalize.ts
import type { TMDBTitle } from "~/shared/types";
import { resolveGenres } from "./genres";

/**
 * discoverNormalize — TMDB response normalization helpers.
 *
 * Extracted from discover.ts to keep that file under the 250-line limit.
 * TMDB returns slightly different shapes for movie vs tv and for
 * /discover vs /trending vs /recommendations — these helpers unify them
 * into TMDBTitle.
 */

export interface TMDBRawItem {
  id: number;
  title?: string;
  name?: string;
  media_type?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  /** TMDB original_language (ISO 639-1). Present on /movie/now_playing,
   *  /discover/movie, /trending, and /movie/{id} responses. */
  original_language?: string;
}

export function normalize(
  raw: TMDBRawItem,
  fallbackMediaType?: "movie" | "tv"
): TMDBTitle | null {
  if (!raw || !raw.id) return null;
  // trending endpoints return media_type on every item; /discover/movie doesn't
  const mediaType =
    (raw.media_type as "movie" | "tv") || fallbackMediaType || "movie";
  if (mediaType !== "movie" && mediaType !== "tv") return null;
  return {
    id: raw.id,
    title: raw.title,
    name: raw.name,
    media_type: mediaType,
    poster_path: raw.poster_path ?? null,
    backdrop_path: raw.backdrop_path ?? null,
    overview: raw.overview,
    release_date: raw.release_date,
    first_air_date: raw.first_air_date,
    vote_average: raw.vote_average,
    vote_count: raw.vote_count,
    genre_ids: raw.genre_ids,
    genres: resolveGenres(raw.genre_ids, mediaType),
    original_language: raw.original_language
  };
}

export function normalizeList(
  items: TMDBRawItem[] | undefined,
  fallbackMediaType?: "movie" | "tv"
): TMDBTitle[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => normalize(i, fallbackMediaType))
    .filter((t): t is TMDBTitle => t !== null);
}
