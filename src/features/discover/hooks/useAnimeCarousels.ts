// src/features/discover/hooks/useAnimeCarousels.ts
//
// useAnimeCarousels — SolidJS hook that fetches all anime Discover
// carousels in parallel and exposes reactive signals for each.
//
// Used by DiscoverPage to render the "Anime" section. Each carousel
// is independent — if one fails, the others still load.
//
// All carousels are gated by the `anime_enabled` feature flag (Phase 8).
// When the flag is off, the hook returns empty arrays and never fires
// any AniList requests.

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
    if (!settings.enabled()) return; // Master toggle off — skip everything
    setLoading(true);

    // Fetch all carousels in parallel. Each is independent — failures
    // don't affect others. All use cachedFetch so repeat visits are instant.
    Promise.allSettled([
      settings.seasonalCarousel() ? getTrendingAnimeCarousel(12).then(setTrending) : Promise.resolve(),
      settings.seasonalCarousel() ? getSeasonalAnimeCarousel(12).then(setSeasonal) : Promise.resolve(),
      getUpcomingAnimeCarousel(12).then(setUpcoming),
      getTopRatedAnimeCarousel(12).then(setTopRated),
      getPopularAnimeCarousel(12).then(setPopular),
      getHiddenGemsAnimeCarousel(12).then(setHiddenGems),
      getAnimeMoviesCarousel(12).then(setMovies)
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
