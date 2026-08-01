// src/features/search/useSearch.ts
import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  Accessor
} from "solid-js";
import { searchMulti, getTrending, genreIdFor } from "~/core/tmdb/discover";
import { buildVaultKeySet, vaultIdKey } from "~/shared/utils/vaultMatch";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";
import { loadRecent, saveRecent, MAX_RECENT } from "./searchStorage";
import {
  searchAnimeFallback,
  looksLikeAnimeQuery
} from "./animeSearchFallback";
import {
  fetchGenrePage,
  emptyGenreBrowse,
  type GenreBrowseState
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
  totalCount: 0
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
  const [genreBrowse, setGenreBrowse] =
    createSignal<GenreBrowseState>(emptyGenreBrowse());

  // Anime fallback results (Phase 5). When TMDB search returns no
  // results AND the query looks anime-related, we fire an AniList
  // search and map results back to TMDB. The UI renders these as a
  // separate "Anime Results" section so the user can distinguish them.
  const [animeResults, setAnimeResults] = createSignal<TMDBTitle[]>([]);
  const [animeLoading, setAnimeLoading] = createSignal(false);

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

  // Fetch text-search results when the debounced query changes
  createEffect(() => {
    if (genreBrowse().genre) return; // Don't run text search in genre mode
    const q = debouncedQuery().trim();
    if (q.length < 2) {
      setResults(emptyResults());
      setLoading(false);
      setError(null);
      setAnimeResults([]);
      setAnimeLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // Reset anime fallback state — will be re-populated if TMDB returns 0.
    setAnimeResults([]);
    setAnimeLoading(false);
    searchMulti(q)
      .then((items) => {
        const movies = items.filter((t) => t.media_type === "movie");
        const series = items.filter((t) => t.media_type === "tv");
        const totalCount = movies.length + series.length;
        setResults({ movies, series, people: [], totalCount });

        // Phase 5 — AniList fallback. Only fire if TMDB returned zero
        // results AND the query looks anime-related. This avoids spamming
        // AniList for every English movie search.
        if (totalCount === 0 && looksLikeAnimeQuery(q)) {
          setAnimeLoading(true);
          searchAnimeFallback(q, 10)
            .then((titles) => setAnimeResults(titles))
            .catch(() => setAnimeResults([]))
            .finally(() => setAnimeLoading(false));
        }
      })
      .catch((err) => {
        console.error("Search failed:", err);
        setError("Search failed. Please try again.");
        setResults(emptyResults());
      })
      .finally(() => setLoading(false));
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
      hasMore: true
    });

    fetchGenrePage(genreName, movieId, tvId, 1)
      .then((items) => {
        setGenreBrowse((prev) => ({
          ...prev,
          items,
          loading: false,
          page: 1,
          hasMore: items.length >= 20
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
          hasMore: newItems.length >= 20
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
      const next = [
        trimmed,
        ...prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())
      ].slice(0, MAX_RECENT);
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
    // Anime fallback (Phase 5) — populated only when TMDB returns 0
    // results AND the query looks anime-related. Rendered as a separate
    // section in SearchResults so the user can distinguish them.
    animeResults,
    animeLoading
  };
}
