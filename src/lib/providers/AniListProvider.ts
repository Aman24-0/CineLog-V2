// src/lib/providers/AniListProvider.ts
//
// AniListProvider — implements MetadataProvider for anime content.
// ---------------------------------------------------------------------
// Wraps the existing AniList client + anime carousels service so
// they conform to the MetadataProvider interface. This lets the
// ProviderRegistry route anime requests uniformly.
//
// NOTE: This provider is OPTIONAL — the app works fine without it
// (TMDB handles all content). AniListProvider adds anime-specific
// enrichment (seasonal, characters, recommendations, etc.) on top
// of TMDB.
//
// REGISTERED in index.ts (lazy, on first import).

import type { TMDBTitle } from "~/shared/types";
import {
  fetchTrendingAnime,
  fetchSeasonalAnime,
  fetchUpcomingAnime,
  fetchTopRatedAnime,
  searchAnime,
  fetchMediaDetails,
  currentAniListSeason,
  type AniListMedia
} from "~/lib/anilist";
import { getTmdbId } from "~/lib/supabase/repositories/animeMapping";
import { fetchTmdbMetadataBatch } from "~/core/tmdb/tmdb";
import type {
  MetadataProvider,
  MediaType,
  TrendingOptions,
  SeasonalOptions,
  SearchOptions,
  RecommendationOptions,
  MediaRef,
  MediaDetailsResult
} from "./BaseProvider";

/**
 * Convert AniList Media[] → TMDBTitle[] by mapping each AniList id to
 * its TMDB id and fetching TMDB metadata. Items without a mapping are
 * skipped. (Shared with animeCarousels.ts — kept inline here so the
 * provider is self-contained.)
 */
async function anilistMediaToTmdbTitles(
  anilistMedia: AniListMedia[],
  limit: number
): Promise<TMDBTitle[]> {
  if (!anilistMedia || anilistMedia.length === 0) return [];
  const pairs = await Promise.all(
    anilistMedia.map(async (m) => {
      const tmdbId = await getTmdbId(m.id);
      return tmdbId != null ? { tmdbId, mediaType: "tv" as const } : null;
    })
  );
  const valid = pairs.filter((p): p is { tmdbId: number; mediaType: "tv" } => p !== null);
  if (valid.length === 0) return [];
  const map = await fetchTmdbMetadataBatch(valid);
  const out: TMDBTitle[] = [];
  for (const { tmdbId, mediaType } of valid) {
    const t = map.get(`${mediaType}/${tmdbId}`);
    if (t) {
      out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export const AniListProvider: MetadataProvider = {
  id: "anilist",
  name: "AniList",
  icon: "whatshot",

  canHandle(mediaType: MediaType): boolean {
    // AniList handles anime + manga. We treat "anime" as a content
    // type that includes both anime TV series and anime films.
    return mediaType === "anime" || mediaType === "manga";
  },

  async getTrending(opts: TrendingOptions): Promise<TMDBTitle[]> {
    const perPage = opts.perPage ?? 20;
    const result = await fetchTrendingAnime(opts.page ?? 1, perPage);
    return anilistMediaToTmdbTitles(result.media, perPage);
  },

  async getSeasonal(opts: SeasonalOptions): Promise<TMDBTitle[]> {
    const { season, year } = opts.season && opts.year
      ? { season: opts.season, year: opts.year }
      : currentAniListSeason();
    const perPage = opts.perPage ?? 20;
    const result = await fetchSeasonalAnime(season, year, opts.page ?? 1, perPage);
    return anilistMediaToTmdbTitles(result.media, perPage);
  },

  async getUpcoming(opts: TrendingOptions): Promise<TMDBTitle[]> {
    const perPage = opts.perPage ?? 20;
    const result = await fetchUpcomingAnime(opts.page ?? 1, perPage);
    return anilistMediaToTmdbTitles(result.media, perPage);
  },

  async getTopRated(opts: TrendingOptions): Promise<TMDBTitle[]> {
    const perPage = opts.perPage ?? 20;
    const result = await fetchTopRatedAnime(opts.page ?? 1, perPage);
    return anilistMediaToTmdbTitles(result.media, perPage);
  },

  async search(opts: SearchOptions): Promise<TMDBTitle[]> {
    const perPage = opts.perPage ?? 20;
    const result = await searchAnime(opts.query, opts.page ?? 1, perPage);
    return anilistMediaToTmdbTitles(result.media, perPage);
  },

  async getRecommendations(opts: RecommendationOptions): Promise<TMDBTitle[]> {
    // Lazy import to avoid a circular dep with animeRecommendations.ts.
    const { getAnimeRecommendations } = await import("~/features/details/animeRecommendations");
    const anilistId = typeof opts.ref.id === "string"
      ? parseInt(opts.ref.id, 10)
      : opts.ref.id;
    if (!Number.isFinite(anilistId)) return [];
    return getAnimeRecommendations(anilistId, opts.perPage ?? 12);
  },

  async getDetails(ref: MediaRef): Promise<MediaDetailsResult | null> {
    // For AniList, `ref.id` is the AniList id. We fetch the AniList
    // Media details and return them as the `anilist` field.
    const anilistId = typeof ref.id === "string" ? parseInt(ref.id, 10) : ref.id;
    if (!Number.isFinite(anilistId)) return null;
    const media = await fetchMediaDetails(anilistId);
    return {
      provider: "anilist",
      tmdb: null,
      anilist: media
    };
  }
};
