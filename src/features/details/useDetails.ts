// src/features/details/useDetails.ts
import { createResource, createSignal } from "solid-js";
import { fetchTmdbDetails } from "~/core/tmdb/tmdb";
import type { WatchlistItem } from "~/shared/types";
import type { SelectedItem } from "~/shared/hooks/useModalState";

/**
 * useDetails — fetches TMDB details for the currently-selected title.
 *
 * OMDB removal (Phase 1 audit fix Min-29):
 *   Previously this hook also fetched OMDb ratings + metadata via
 *   `~/core/omdb/omdb.ts`, which read `import.meta.env.VITE_OMDB_API_KEY`
 *   and therefore shipped the OMDB API key to the browser bundle. That
 *   module has been deleted. The `omdb` accessor is kept in the return
 *   value for backwards compatibility with the existing DetailsModal
 *   section components (DetailsMetadata, DetailsRatings, MetadataGrid)
 *   which still destructure it — it now always returns `null`, and
 *   those components gracefully handle the null case (MDBList via
 *   /api/media/ratings is the sole rating source, and the "Rated" cell
 *   in MetadataGrid is simply omitted when OMDb data is absent).
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
    const tmdbData = await fetchTmdbDetails(src.item.media_type, src.item.id);
    return { tmdb: tmdbData };
  };

  const [data] = createResource(source, fetcher);

  const retry = () => setRetryTick((t) => t + 1);

  return {
    tmdb: () => data()?.tmdb ?? null,
    // OMDB module was deleted (Phase 1 audit fix). Kept as a stable
    // null accessor so downstream components don't break — they
    // already null-check before using it.
    omdb: () => null,
    loading: () => data.loading,
    error: () => data.error,
    retry
  };
}
