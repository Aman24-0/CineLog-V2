// src/features/search/useSearch.ts
import { createSignal, createMemo, createEffect, onMount, onCleanup, Accessor } from "solid-js";
import { searchMulti, getTrending, genreIdFor } from "~/core/tmdb/discover";
import { buildVaultKeySet, vaultIdKey } from "~/shared/utils/vaultMatch";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";
import { loadRecent, saveRecent, MAX_RECENT } from "./searchStorage";
import {
  fetchGenrePage,
  emptyGenreBrowse,
  type GenreBrowseState,
} from "./genreBrowseUtils";

export interface SearchResults {
  movies: TMDBTitle[];
  series: TMDBTitle[];
  people: TMDBTitle[];
  totalCount: number;
}

const emptyResults = (): SearchResults => ({
  movies: [],
  series: [],
  people: [],
  totalCount: 0,
});

// Re-export so existing consumers can keep importing from useSearch.
export type { GenreBrowseState };

interface UseSearchArgs {
  vault: Accessor<WatchlistItem[]>;
}

/**
 * useSearch — the search engine for CineLog's Search experience.
 *
 * TWO MODES:
 *   1. TEXT SEARCH (default) — debounced TMDB search/multi, results
 *      grouped by Movies / Series.
 *   2. GENRE BROWSE — TMDB discover by genre ID, flat paginated list.
 *      Activated by `browseGenre(name)`. Cleared by `clearGenre()`.
 *
 * The two modes are mutually exclusive: starting a genre browse clears
 * the text query, and typing in the search bar clears the genre browse.
 *
 * STATE:
 *   - `query` — the current text search string (debounced 250ms)
 *   - `results` — grouped text-search results
 *   - `genreBrowse` — the genre-browse state (genre, items, page, hasMore)
 *   - `recentSearches` — last 8 text searches from localStorage
 *   - `trending` — TMDB trending this week (cold-start state)
 *   - `vaultKeys` — composite "{media_type}/{id}" key set for O(1) checks
 */
export function useSearch(args: UseSearchArgs) {
  const [query, setQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  const [results, setResults] = createSignal<SearchResults>(emptyResults());
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [recentSearches, setRecentSearches] = createSignal<string[]>([]);
  const [trending, setTrending] = createSignal<TMDBTitle[]>([]);
  const [trendingLoading, setTrendingLoading] = createSignal(false);
  const [genreBrowse, setGenreBrowse] = createSignal<GenreBrowseState>(emptyGenreBrowse());

  // Vault key set — composite "{media_type}/{id}" keys for O(1) membership
  // checks. Uses composite keys (not bare ids) because TMDB movie and TV
  // IDs are separate namespaces and can collide.
  const vaultKeys = createMemo(() => buildVaultKeySet(args.vault()));

  onMount(() => {
    setRecentSearches(loadRecent());
    setTrendingLoading(true);
    getTrending("all", "week")
      .then((items) => setTrending(items.slice(0, 12)))
      .catch(() => setTrending([]))
      .finally(() => setTrendingLoading(false));
  });

  // Debounce the query — 250ms after the user stops typing
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  createEffect(() => {
    const q = query();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setDebouncedQuery(q), 250);
  });
  // Cleanup: cancel pending debounce on unmount to prevent calling
  // setDebouncedQuery on a dead reactive root (SolidJS warning).
  onCleanup(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  });

  // When the user types in the search bar, clear any active genre browse
  createEffect(() => {
    if (query().trim().length > 0 && genreBrowse().genre) {
      setGenreBrowse(emptyGenreBrowse());
    }
  });

  // Fetch text-search results when the debounced query changes.
  // Uses a generation counter to discard stale results when the user
  // types quickly — if the query changes while a fetch is in-flight,
  // the old results are silently discarded.
  let searchGeneration = 0;
  createEffect(() => {
    if (genreBrowse().genre) return; // Don't run text search in genre mode
    const q = debouncedQuery().trim();
    if (q.length < 2) {
      setResults(emptyResults());
      setLoading(false);
      setError(null);
      return;
    }
    const gen = ++searchGeneration;
    setLoading(true);
    setError(null);
    searchMulti(q)
      .then((items) => {
        // Only apply results if no newer search has been fired
        if (gen !== searchGeneration) return;
        const movies = items.filter((t) => t.media_type === "movie");
        const series = items.filter((t) => t.media_type === "tv");
        setResults({
          movies,
          series,
          people: [],
          totalCount: movies.length + series.length,
        });
      })
      .catch((err) => {
        if (gen !== searchGeneration) return;
        console.error("Search failed:", err);
        setError("Search failed. Please try again.");
        setResults(emptyResults());
      })
      .finally(() => {
        if (gen === searchGeneration) setLoading(false);
      });
  });

  /* ---- GENRE BROWSE ---- */

  const browseGenre = (genreName: string) => {
    const movieId = genreIdFor(genreName, "movie");
    const tvId = genreIdFor(genreName, "tv");
    if (movieId === undefined && tvId === undefined) return;

    setQuery("");
    setDebouncedQuery("");
    setResults(emptyResults());

    setGenreBrowse({
      genre: genreName,
      movieGenreId: movieId,
      tvGenreId: tvId,
      items: [],
      loading: true,
      page: 1,
      hasMore: true,
    });

    fetchGenrePage(genreName, movieId, tvId, 1)
      .then((items) => {
        setGenreBrowse((prev) => ({
          ...prev,
          items,
          loading: false,
          page: 1,
          hasMore: items.length >= 20,
        }));
      })
      .catch((err) => {
        console.error("Genre browse failed:", err);
        setGenreBrowse((prev) => ({ ...prev, loading: false, hasMore: false }));
      });
  };

  const loadMoreGenre = () => {
    const gb = genreBrowse();
    if (!gb.genre || gb.loading || !gb.hasMore) return;
    const nextPage = gb.page + 1;
    setGenreBrowse((prev) => ({ ...prev, loading: true }));
    fetchGenrePage(gb.genre, gb.movieGenreId, gb.tvGenreId, nextPage)
      .then((newItems) => {
        setGenreBrowse((prev) => ({
          ...prev,
          items: [...prev.items, ...newItems],
          loading: false,
          page: nextPage,
          hasMore: newItems.length >= 20,
        }));
      })
      .catch((err) => {
        console.error("Genre load more failed:", err);
        setGenreBrowse((prev) => ({ ...prev, loading: false, hasMore: false }));
      });
  };

  const clearGenre = () => setGenreBrowse(emptyGenreBrowse());

  /* ---- RECENT SEARCHES ---- */

  const commitSearch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  };

  const removeRecent = (q: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((s) => s !== q);
      saveRecent(next);
      return next;
    });
  };

  const clearRecent = () => {
    setRecentSearches([]);
    saveRecent([]);
  };

  /* Check if a title is in the vault (for result rendering). */
  const isInVault = (title: TMDBTitle): boolean => {
    const key = vaultIdKey(title);
    return key !== null && vaultKeys().has(key);
  };

  return {
    query,
    setQuery,
    debouncedQuery,
    results,
    loading,
    error,
    recentSearches,
    trending,
    trendingLoading,
    commitSearch,
    removeRecent,
    clearRecent,
    isInVault,
    hasQuery: createMemo(() => debouncedQuery().trim().length >= 2),
    // Genre browse
    genreBrowse,
    browseGenre,
    loadMoreGenre,
    clearGenre,
    isGenreBrowse: createMemo(() => genreBrowse().genre !== null),
  };
}
