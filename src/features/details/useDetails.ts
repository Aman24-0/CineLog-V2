// src/features/details/useDetails.ts
import { createResource, createSignal } from "solid-js";
import { fetchTmdbDetails } from "~/core/tmdb/tmdb";
import { fetchOmdbRatings } from "~/core/omdb/omdb";
import type {WatchlistItem} from "~/shared/types";
import type { SelectedItem } from "~/shared/hooks/useModalState";

/**
 * useDetails — fetches TMDB + OMDb details for the currently-selected title.
 *
 * Takes a `SelectedItem | null` (the new ownership-boundary shape) and
 * derives the baseItem for the fetch. The baseItem is always the TMDB
 * identity — vaultItem is irrelevant for fetching details (TMDB doesn't
 * know about the user's vault).
 */
export function useDetails(selected: () => SelectedItem | null) {
  const [retryTick, setRetryTick] = createSignal(0);

  const source = () => {
    const item = selected()?.baseItem;
    if (!item) return null;
    return { item, tick: retryTick() };
  };

  const fetcher = async (src: { item: WatchlistItem; tick: number } | null) => {
    if (!src) return null;
    // Fetch TMDB first to get imdb_id, then use it for the OMDb lookup.
    // This prevents OMDb returning the wrong movie when titles share a name.
    // The two fetches are sequential (not parallel) only for the imdb_id
    // dependency; TMDB is fast (cached after first load).
    const tmdbData = await fetchTmdbDetails(src.item.media_type, src.item.id);
    const imdbId = tmdbData?.imdb_id ?? null;
    const omdbData = await fetchOmdbRatings(
      src.item.title || src.item.name || "",
      imdbId
    );
    return { tmdb: tmdbData, omdb: omdbData };
  };

  const [data] = createResource(source, fetcher);

  const retry = () => setRetryTick((t) => t + 1);

  return {
    tmdb: () => data()?.tmdb ?? null,
    omdb: () => data()?.omdb ?? null,
    loading: () => data.loading,
    error: () => data.error,
    retry
  };
}
