// src/features/search/useSearch.ts
import { createSignal, createMemo, createEffect, onMount, Accessor } from "solid-js";
import { searchMulti, getTrending, discoverMovies, discoverTv, genreIdFor } from "~/core/tmdb/discover";
import { buildVaultKeySet, vaultIdKey } from "~/shared/utils/vaultMatch";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";

/* ------------------------------------------------------------------
   Recent searches — stored in localStorage. Max 8, deduped, MRU first.
   ------------------------------------------------------------------ */
const RECENT_KEY = "cinelog_recent_searches";
const MAX_RECENT = 8;

const loadRecent = (): string[] => {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
};

const saveRecent = (items: string[]): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    /* ignore quota errors */
  }
};

/* ------------------------------------------------------------------
   SearchResult — grouped by type for the text-search results UI.
   ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------
   GenreBrowse — the state for genre-browsing mode.
   When active, the Search page shows a flat, paginated list of titles
   in the selected genre (both movies and TV), instead of grouped text
   results. Genre browsing uses TMDB discover endpoints with
   with_genres — NOT text search — so "Horror" returns actual Horror
   films, not titles containing the word "Horror".
   ------------------------------------------------------------------ */
export interface GenreBrowseState {
  /** The genre name being browsed (e.g. "Horror") — null when not browsing */
  genre: string | null;
  /** The TMDB genre IDs for movies + TV (resolved via genreIdFor) */
  movieGenreId: number | undefined;
  tvGenreId: number | undefined;
  /** Accumulated results (movies + series merged, deduped) */
  items: TMDBTitle[];
  /** Whether a fetch is in flight */
  loading: boolean;
  /** Current page (1-indexed) — for infinite scroll */
  page: number;
  /** Whether more pages are available */
  hasMore: boolean;
}

const emptyGenreBrowse = (): GenreBrowseState => ({
  genre: null,
  movieGenreId: undefined,
  tvGenreId: undefined,
  items: [],
  loading: false,
  page: 1,
  hasMore: true
});

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
 *   The two modes are mutually exclusive: starting a genre browse clears
 *   the text query, and typing in the search bar clears the genre browse.
 *   This keeps the UI simple — the user is always in one mode.
 *
 * ARCHITECTURE:
 *   - `query` — the current text search string (debounced 250ms)
 *   - `results` — grouped text-search results
 *   - `genreBrowse` — the genre-browse state (genre, items, page, hasMore)
 *   - `recentSearches` — last 8 text searches from localStorage
 *   - `trending` — TMDB trending this week (cold-start state)
 *   - `vaultKeys` — composite "{media_type}/{id}" key set for vault-aware rendering
 *
 * GENRE BROWSE infinite scroll:
 *   `loadMoreGenre()` fetches the next page and appends to items.
 *   The UI calls it when the user scrolls near the bottom.
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

  // Genre browse state
  const [genreBrowse, setGenreBrowse] = createSignal<GenreBrowseState>(emptyGenreBrowse());

  // Vault key set — composite "{media_type}/{id}" keys for O(1) membership
  // checks. Uses composite keys (not bare ids) because TMDB movie and TV
  // IDs are separate namespaces and can collide (e.g. movie/1398 = Stalker,
  // tv/1398 = The Sopranos). A bare-id set would produce false positives.
  const vaultKeys = createMemo(() => buildVaultKeySet(args.vault()));

  /* Load recent searches + trending on mount (cold-start state) */
  onMount(() => {
    setRecentSearches(loadRecent());
    setTrendingLoading(true);
    getTrending("all", "week")
      .then((items) => setTrending(items.slice(0, 12)))
      .catch(() => setTrending([]))
      .finally(() => setTrendingLoading(false));
  });

  /* Debounce the query — 250ms after the user stops typing */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  createEffect(() => {
    const q = query();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      setDebouncedQuery(q);
    }, 250);
  });

  /* When the user types in the search bar, clear any active genre browse */
  createEffect(() => {
    if (query().trim().length > 0 && genreBrowse().genre) {
      setGenreBrowse(emptyGenreBrowse());
    }
  });

  /* Fetch text-search results when the debounced query changes */
  createEffect(() => {
    // Don't run text search if we're in genre browse mode
    if (genreBrowse().genre) return;

    const q = debouncedQuery().trim();
    if (q.length < 2) {
      setResults(emptyResults());
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    searchMulti(q)
      .then((items) => {
        const movies = items.filter((t) => t.media_type === "movie");
        const series = items.filter((t) => t.media_type === "tv");
        const people: TMDBTitle[] = [];
        setResults({
          movies,
          series,
          people,
          totalCount: movies.length + series.length
        });
      })
      .catch((err) => {
        console.error("Search failed:", err);
        setError("Search failed. Please try again.");
        setResults(emptyResults());
      })
      .finally(() => setLoading(false));
  });

  /* ---- GENRE BROWSE ---- */

  /**
   * browseGenre — start browsing a genre by name.
   * Resolves the TMDB genre IDs for both movies and TV, clears the text
   * query, and fetches the first page. The UI switches to genre-browse mode.
   */
  const browseGenre = (genreName: string) => {
    const movieId = genreIdFor(genreName, "movie");
    const tvId = genreIdFor(genreName, "tv");
    if (movieId === undefined && tvId === undefined) return;

    // Clear text search
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

    // Fetch page 1
    fetchGenrePage(genreName, movieId, tvId, 1)
      .then((items) => {
        setGenreBrowse((prev) => ({
          ...prev,
          items,
          loading: false,
          page: 1,
          // TMDB discover returns 20 items per page; if we got < 20, no more
          hasMore: items.length >= 20
        }));
      })
      .catch((err) => {
        console.error("Genre browse failed:", err);
        setGenreBrowse((prev) => ({ ...prev, loading: false, hasMore: false }));
      });
  };

  /**
   * loadMoreGenre — fetch the next page of genre results and append.
   * Called by the UI when the user scrolls near the bottom (infinite scroll).
   */
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

  /**
   * clearGenre — exit genre-browse mode, return to cold-start state.
   */
  const clearGenre = () => {
    setGenreBrowse(emptyGenreBrowse());
  };

  /**
   * fetchGenrePage — internal helper. Fetches one page of genre results
   * from both movie and TV discover endpoints, merges, and deduplicates.
   * Returns 20 items per page (10 movies + 10 TV, interleaved).
   */
  const fetchGenrePage = async (
    _genreName: string,
    movieGenreId: number | undefined,
    tvGenreId: number | undefined,
    page: number
  ): Promise<TMDBTitle[]> => {
    const promises: Promise<TMDBTitle[]>[] = [];
    if (movieGenreId !== undefined) {
      promises.push(discoverMovies({
        withGenres: [movieGenreId],
        sortBy: "popularity.desc",
        voteCountGte: 100,
        page
      }));
    }
    if (tvGenreId !== undefined) {
      promises.push(discoverTv({
        withGenres: [tvGenreId],
        sortBy: "popularity.desc",
        voteCountGte: 50,
        page
      }));
    }
    const results = await Promise.all(promises);
    // Destructure safely — if only one endpoint was called (e.g. the genre
    // only exists for movies, not TV), the other array is empty.
    const movies: TMDBTitle[] = results[0] ?? [];
    const series: TMDBTitle[] = results[1] ?? [];
    // Interleave: alternate movie, tv, movie, tv... for variety
    const merged: TMDBTitle[] = [];
    const maxLen = Math.max(movies.length, series.length);
    for (let i = 0; i < maxLen; i++) {
      if (movies[i]) merged.push(movies[i]);
      if (series[i]) merged.push(series[i]);
    }
    // Deduplicate by composite key (in case the same title appears in both)
    const seen = new Set<string>();
    return merged.filter((t) => {
      const key = `${t.media_type}/${t.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  /* Commit a search to recent searches (called when the user submits) */
  const commitSearch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  };

  /* Clear a single recent search */
  const removeRecent = (q: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((s) => s !== q);
      saveRecent(next);
      return next;
    });
  };

  /* Clear all recent searches */
  const clearRecent = () => {
    setRecentSearches([]);
    saveRecent([]);
  };

  /* Check if a title is in the vault (for result rendering).
     Uses the composite key set so movie/1398 and tv/1398 are distinct. */
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
    isGenreBrowse: createMemo(() => genreBrowse().genre !== null)
  };
}
