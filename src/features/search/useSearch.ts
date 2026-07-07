// src/features/search/useSearch.ts
import { createSignal, createMemo, createEffect, onMount, Accessor } from "solid-js";
import { searchMulti, getTrending } from "~/core/tmdb/discover";
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
   SearchResult — grouped by type for the results UI.
   ------------------------------------------------------------------ */
export interface SearchResults {
  movies: TMDBTitle[];
  series: TMDBTitle[];
  people: TMDBTitle[]; // search/multi returns person results; we filter them out for now
  totalCount: number;
}

const emptyResults = (): SearchResults => ({
  movies: [],
  series: [],
  people: [],
  totalCount: 0
});

interface UseSearchArgs {
  vault: Accessor<WatchlistItem[]>;
}

/**
 * useSearch — the search engine for CineLog's Search experience.
 *
 * ARCHITECTURE:
 *   - `query` — the current search string (debounced 250ms before fetch)
 *   - `results` — grouped SearchResults (movies / series / people)
 *   - `recentSearches` — last 8 searches from localStorage
 *   - `trending` — TMDB trending this week (for the cold-start state)
 *   - `vaultIds` — Set of vault ids, for vault-aware result rendering
 *
 * The hook is intentionally simple — no AI, no voice, no filters in v1.
 * The architecture (a single hook returning results) supports adding
 * those layers later without UI changes.
 *
 * COLD START (no query): results are empty; the UI shows recent searches
 * + trending. ACTIVE QUERY: debounced fetch from TMDB search/multi.
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

  // Vault id set — for vault-aware result rendering
  const vaultIds = createMemo(
    () => new Set(args.vault().map((m) => String(m.id)))
  );

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

  /* Fetch results when the debounced query changes */
  createEffect(() => {
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
        const people: TMDBTitle[] = []; // search/multi filters out people in discover.ts
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

  /* Check if a title is in the vault (for result rendering) */
  const isInVault = (title: TMDBTitle): boolean =>
    vaultIds().has(String(title.id));

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
    hasQuery: createMemo(() => debouncedQuery().trim().length >= 2)
  };
}
