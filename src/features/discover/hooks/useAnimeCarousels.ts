// src/features/discover/hooks/useAnimeCarousels.ts
//
// useAnimeCarousels — SolidJS hook that fetches all anime Discover
// carousels in parallel and exposes reactive signals for each.
//
// Used by DiscoverPage to render the "Anime" section. Each carousel
// is independent — if one fails, the others still load.
//
// All carousels are gated by the `enabled` master flag (admin-controlled).
// Each carousel ALSO has its own per-carousel flag (e.g. `trendingCarousel`,
// `seasonalCarousel`, etc.) — all default to `true` so the carousels
// appear on first deploy without any admin configuration.
//
// When the master flag is off, the hook returns empty arrays and never
// fires any AniList requests. When a per-carousel flag is off, only that
// carousel is skipped.

import { createSignal, onMount, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";
import type { TMDBTitle } from "~/shared/types";
import {
  getTrendingAnimeCarousel,
  getSeasonalAnimeCarousel,
  getUpcomingAnimeCarousel,
  getTopRatedAnimeCarousel,
  getPopularAnimeCarousel,
  getHiddenGemsAnimeCarousel,
  getAnimeMoviesCarousel
} from "../services/animeCarousels";
import { useAnimeSettings } from "~/features/anime/useAnimeSettings";

export interface AnimeCarousels {
  trending: Accessor<TMDBTitle[]>;
  seasonal: Accessor<TMDBTitle[]>;
  upcoming: Accessor<TMDBTitle[]>;
  topRated: Accessor<TMDBTitle[]>;
  popular: Accessor<TMDBTitle[]>;
  hiddenGems: Accessor<TMDBTitle[]>;
  movies: Accessor<TMDBTitle[]>;
  loading: Accessor<boolean>;
  retry: () => void;
}

export function useAnimeCarousels(): AnimeCarousels {
  const settings = useAnimeSettings();
  const [trending, setTrending] = createSignal<TMDBTitle[]>([]);
  const [seasonal, setSeasonal] = createSignal<TMDBTitle[]>([]);
  const [upcoming, setUpcoming] = createSignal<TMDBTitle[]>([]);
  const [topRated, setTopRated] = createSignal<TMDBTitle[]>([]);
  const [popular, setPopular] = createSignal<TMDBTitle[]>([]);
  const [hiddenGems, setHiddenGems] = createSignal<TMDBTitle[]>([]);
  const [movies, setMovies] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(false);

  const loadAll = () => {
    if (isServer) return;
    // Master toggle — if anime features are globally disabled, skip
    // everything. The hook returns empty arrays for all carousels.
    if (!settings.enabled()) return;
    setLoading(true);

    // Fetch all enabled carousels in parallel. Each carousel has its
    // own per-carousel flag (defaults to true) so the admin can hide
    // individual rails without disabling the whole integration.
    //
    // Failures in one carousel don't affect others (Promise.allSettled).
    // All carousels use cachedFetch internally so repeat visits are
    // instant and the AniList API is only hit on cache miss.
    Promise.allSettled([
      settings.trendingCarousel()
        ? getTrendingAnimeCarousel(12).then(setTrending)
        : Promise.resolve(),
      settings.seasonalCarousel()
        ? getSeasonalAnimeCarousel(12).then(setSeasonal)
        : Promise.resolve(),
      settings.upcomingCarousel()
        ? getUpcomingAnimeCarousel(12).then(setUpcoming)
        : Promise.resolve(),
      settings.topRatedCarousel()
        ? getTopRatedAnimeCarousel(12).then(setTopRated)
        : Promise.resolve(),
      settings.popularCarousel()
        ? getPopularAnimeCarousel(12).then(setPopular)
        : Promise.resolve(),
      settings.hiddenGemsCarousel()
        ? getHiddenGemsAnimeCarousel(12).then(setHiddenGems)
        : Promise.resolve(),
      settings.animeMoviesCarousel()
        ? getAnimeMoviesCarousel(12).then(setMovies)
        : Promise.resolve()
    ]).finally(() => setLoading(false));
  };

  onMount(loadAll);

  return {
    trending,
    seasonal,
    upcoming,
    topRated,
    popular,
    hiddenGems,
    movies,
    loading,
    retry: loadAll
  };
}
