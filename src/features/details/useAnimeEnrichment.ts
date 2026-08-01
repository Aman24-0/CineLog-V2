// src/features/details/useAnimeEnrichment.ts
//
// useAnimeEnrichment — fetches AniList data for the currently-open
// anime title in the Details modal.
//
// PIPELINE:
//   1. Wait for TMDB details to load (we need the title + year + genres
//      to detect anime and to auto-map).
//   2. Detect anime via the detector (heuristics + mapping table).
//      If NOT anime → return null, do nothing.
//   3. Resolve the AniList id:
//      a. Check the mapping table (getAnilistId).
//      b. If no mapping AND autoMapping is enabled, run autoMap.
//      c. If still no id, return null.
//   4. Fetch the AniList Media details (characters, studios, relations,
//      airing schedule, OP/ED themes, recommendations).
//   5. Return the AniList Media object.
//
// CACHING:
//   The AniList client caches responses for 5 minutes (30 minutes for
//   details queries), so re-opening the same anime title is instant.
//
// ERROR HANDLING:
//   AniList failures are SILENT — the hook returns null and the
//   Details modal simply doesn't render the anime sections. The
//   user sees the standard TMDB-only Details page. We log to console
//   for debugging but never throw.
//
// GATING:
//   The hook checks anime_settings.enabled before doing anything.
//   If the admin has disabled anime features, this is a no-op.
//   The hook also respects per-feature toggles (charactersStaff,
//   relations, airingSchedule, openingEndingThemes) by passing them
//   to the AniList query layer — but since GraphQL fragments are
//   static, we simply fetch everything and let the UI decide which
//   sections to render based on the settings. (This is simpler and
//   avoids query-string construction bugs.)

import { createResource, createMemo } from "solid-js";
import type { TMDBDetails, WatchlistItem } from "~/shared/types";
import type { SelectedItem } from "~/shared/hooks/useModalState";
import { detectAnime } from "~/core/anime/detector";
import { getAnilistId, autoMap } from "~/lib/supabase/repositories/animeMapping";
import { fetchMediaDetails } from "~/lib/anilist";
import { useAnimeSettings } from "~/features/anime/useAnimeSettings";
import type { AniListMedia } from "~/lib/anilist";

/**
 * Build the search input for auto-mapping from a TMDB details payload.
 * Returns the best title + year we can extract.
 */
function extractTitleYear(details: TMDBDetails): {
  title: string;
  year: number | null;
  tmdbType: "movie" | "tv";
} {
  const isMovie = details.media_type === "movie" ||
    (!details.media_type && !!details.title);
  const title = (isMovie ? details.title : details.name) ||
    details.title || details.name || "";
  const dateStr = isMovie ? details.release_date : details.first_air_date;
  const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
  return {
    title,
    year: Number.isNaN(year as number) ? null : year,
    tmdbType: isMovie ? "movie" : "tv"
  };
}

export interface AnimeEnrichmentResult {
  anilist: AniListMedia | null;
  anilistId: number | null;
  isAnime: boolean;
}

/**
 * useAnimeEnrichment — fetches AniList data for the open title.
 *
 * @param selected  The modal's SelectedItem (provides baseItem).
 * @param details   The TMDB details accessor (from useDetails).
 */
export function useAnimeEnrichment(
  selected: () => SelectedItem | null,
  details: () => TMDBDetails | null
) {
  const settings = useAnimeSettings();

  // The source signal drives the resource. Returns null when there's
  // nothing to enrich (no selection, no TMDB data yet, anime disabled,
  // or detection said "not anime").
  const source = createMemo(() => {
    const item = selected()?.baseItem;
    const d = details();
    if (!item || !d) return null;
    if (!settings.enabled()) return null;
    return { item, details: d };
  });

  const fetcher = async (
    src: { item: WatchlistItem; details: TMDBDetails } | null
  ): Promise<AnimeEnrichmentResult> => {
    if (!src) {
      return { anilist: null, anilistId: null, isAnime: false };
    }

    // 1. Detect anime (heuristics + mapping table).
    let isAnime: boolean;
    try {
      isAnime = await detectAnime({
        id: src.item.id,
        genre_ids: [],
        genres: Array.isArray(src.details.genres) ? src.details.genres : [],
        origin_country: src.details.origin_country ?? [],
        spoken_languages: src.details.spoken_languages ?? [],
        original_language: src.details.original_language,
        title: src.details.title,
        name: src.details.name,
        overview: src.details.overview
      });
    } catch (err) {
      console.warn("[animeEnrichment] detectAnime failed:", err);
      return { anilist: null, anilistId: null, isAnime: false };
    }

    if (!isAnime) {
      return { anilist: null, anilistId: null, isAnime: false };
    }

    // 2. Resolve the AniList id (mapping table → autoMap fallback).
    const tmdbIdNum =
      typeof src.item.id === "string" ? parseInt(src.item.id, 10) : src.item.id;
    let anilistId = await getAnilistId(tmdbIdNum);

    if (anilistId == null && settings.autoMapping()) {
      const { title, year, tmdbType } = extractTitleYear(src.details);
      if (title) {
        try {
          anilistId = await autoMap({
            tmdbId: tmdbIdNum,
            title,
            year,
            tmdbType
          });
        } catch (err) {
          console.warn("[animeEnrichment] autoMap failed:", err);
        }
      }
    }

    if (anilistId == null) {
      // It's anime but we couldn't map it. Return isAnime=true so the
      // UI can show a subtle "Anime data not available" note if desired.
      return { anilist: null, anilistId: null, isAnime: true };
    }

    // 3. Fetch the AniList Media details.
    try {
      const anilist = await fetchMediaDetails(anilistId);
      return { anilist, anilistId, isAnime: true };
    } catch (err) {
      console.warn("[animeEnrichment] fetchMediaDetails failed:", err);
      return { anilist: null, anilistId, isAnime: true };
    }
  };

  const [resource] = createResource(source, fetcher);

  return {
    anilist: () => resource()?.anilist ?? null,
    anilistId: () => resource()?.anilistId ?? null,
    isAnime: () => resource()?.isAnime ?? false,
    loading: () => resource.loading,
    error: () => resource.error,
    settings
  };
}
