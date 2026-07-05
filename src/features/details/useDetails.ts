// src/features/details/useDetails.ts
import { createResource, createSignal } from "solid-js";
import { fetchTmdbDetails } from "~/core/tmdb/tmdb";
import { fetchOmdbRatings } from "~/core/omdb/omdb";
import type { WatchlistItem, TMDBDetails, OMDbRatings } from "~/shared/types";

export function useDetails(baseItem: () => WatchlistItem | null) {
  const [retryTick, setRetryTick] = createSignal(0);

  const source = () => {
    const item = baseItem();
    if (!item) return null;
    return { item, tick: retryTick() };
  };

  const fetcher = async (src: { item: WatchlistItem; tick: number } | null) => {
    if (!src) return null;
    const [tmdbData, omdbData] = await Promise.all([
      fetchTmdbDetails(src.item.media_type, src.item.id),
      fetchOmdbRatings(src.item.title || src.item.name || "")
    ]);
    return { tmdb: tmdbData, omdb: omdbData };
  };

  const [data] = createResource(source, fetcher);

  const retry = () => setRetryTick((t) => t + 1);

  return {
    tmdb: () => data()?.tmdb ?? null,
    omdb: () => data()?.omdb ?? null,
    loading: data.loading,
    error: data.error,
    retry
  };
}
