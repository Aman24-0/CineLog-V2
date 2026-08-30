// src/features/search/useSearch.ts
import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  Accessor
} from "solid-js";
import {
  searchMulti,
  searchPeople,
  getTrending,
  genreIdFor
} from "~/core/tmdb/discover";
import { buildVaultKeySet, vaultIdKey } from "~/shared/utils/vaultMatch";
import type { TMDBTitle, TMDBPerson, WatchlistItem } from "~/shared/types";
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
  /** Phase 6.2 Task 4b — people results from TMDB /search/multi. */
  people: TMDBPerson[];
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
  /**
   * Optional accessor for the user-library loading state (from
   * `useUserLibrary().loading`). When provided, the public
   * `trendingLoading()` accessor waits for BOTH the TMDB trending fetch
   * AND the vault fetch to resolve before reporting `false`.
   *
   * This prevents the "Trending this week" section from flashing
   * library items that disappear once the vault arrives — the trending
   * list is filtered against the vault reactively, so we wait for the
   * vault to land before unblocking the loader. Guests (no vault fetch)
   * resolve `loading` to `false` immediately, so they see trending as
   * soon as the TMDB call completes.
   */
  vaultLoading?: Accessor<boolean>;
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
  // Raw TMDB trending items, unfiltered. The public `trending` accessor
  // (declared further down) derives from this and removes any items
  // already present in the user's vault, so the "Trending this week"
  // section never shows library cards. The raw signal is kept separate
  // from the derived accessor so the filter stays reactive to vault
  // changes (e.g. when the vault finishes loading after the trending
  // fetch resolves, or when the user adds/removes a title while the
  // search page is open).
  const [trendingItems, setTrendingItems] = createSignal<TMDBTitle[]>([]);
  // Raw fetch-state for the trending API call. The public
  // `trendingLoading` accessor (declared further down) combines this
  // with the optional `vaultLoading` arg so the Search page stays in
  // its loading state until BOTH the trending fetch and the vault fetch
  // have resolved — preventing a flash where library items appear in
  // Trending and then vanish once the vault arrives.
  const [trendingFetching, setTrendingFetching] = createSignal(false);
  const [genreBrowse, setGenreBrowse] =
    createSignal<GenreBrowseState>(emptyGenreBrowse());

  // Anime fallback results (Phase 5). When TMDB search returns no
  // results AND the query looks anime-related, we fire an AniList
  // search and map results back to TMDB. The UI renders these as a
  // separate "Anime Results" section so the user can distinguish them.
  const [animeResults, setAnimeResults] = createSignal<TMDBTitle[]>([]);
  const [animeLoading, setAnimeLoading] = createSignal(false);
  // Incrementing this signal re-runs the current catalog request without
  // creating a second search implementation. It powers the visible Retry
  // action when the shared request fails.
  const [searchRevision, setSearchRevision] = createSignal(0);

  // Vault key set — composite "{media_type}/{id}" keys for O(1) membership
  // checks. Uses composite keys (not bare ids) because TMDB movie and TV
  // IDs are separate namespaces and can collide.
  const vaultKeys = createMemo(() => buildVaultKeySet(args.vault()));

  onMount(() => {
    setRecentSearches(loadRecent());
    setTrendingFetching(true);
    getTrending("all", "week")
      .then((items) => setTrendingItems(items.slice(0, 12)))
      .catch(() => setTrendingItems([]))
      .finally(() => setTrendingFetching(false));
  });

  // Debounce the query — 250ms after the user stops typing
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  createEffect(() => {
    const q = query();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setDebouncedQuery(q), 250);
  });

  // ── Race-condition protection ──────────────────────────────────────
  // When the user types quickly, multiple search requests can be in
  // flight at the same time. Without protection, a slow response for
  // query "a" can arrive AFTER the fast response for "ab" and overwrite
  // the correct results. We use TWO guards:
  //
  //   1. requestId — a monotonically increasing counter. Each new search
  //      increments it. When a response arrives, we only update state
  //      if the requestId still matches the one that was current when
  //      the search was initiated. Stale responses are silently dropped.
  //
  //   2. AbortController — marks the in-flight request as cancelled
  //      when a new search starts. The signal.aborted flag is checked
  //      before committing results to state, so stale responses are
  //      silently dropped even if the underlying HTTP request already
  //      completed.
  let searchRequestId = 0;
  let searchAbortController: AbortController | null = null;

  // Cleanup: cancel pending debounce on unmount to prevent calling
  // setDebouncedQuery on a dead reactive root (SolidJS warning).
  // Also abort any in-flight search request.
  onCleanup(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
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
    // Read the revision so retrySearch() can re-run the same query.
    searchRevision();
    if (genreBrowse().genre) return; // Don't run text search in genre mode
    const q = debouncedQuery().trim();
    if (q.length < 2) {
      setResults(emptyResults());
      setLoading(false);
      setError(null);
      setAnimeResults([]);
      setAnimeLoading(false);
      // Abort any in-flight request for the previous query
      if (searchAbortController) {
        searchAbortController.abort();
        searchAbortController = null;
      }
      return;
    }

    // ── Race guard: increment request ID + abort previous ──────────
    const thisRequestId = ++searchRequestId;
    if (searchAbortController) {
      searchAbortController.abort();
    }
    const abortController = new AbortController();
    searchAbortController = abortController;
    const signal = abortController.signal;

    setLoading(true);
    setError(null);
    // Reset anime fallback state — will be re-populated if the query
    // looks anime-related (Phase 6.2 Task 4a: now fires in PARALLEL with
    // TMDB, not as a fallback only when TMDB returns 0).
    setAnimeResults([]);
    setAnimeLoading(false);

    // Phase 6.2 Task 4a — fire AniList IN PARALLEL with TMDB when the
    // query looks anime-related. Previously AniList was a fallback that
    // only fired when TMDB returned 0 results. Now both fire at once,
    // and the AniList results are MERGED into the movies/series arrays
    // (deduped by TMDB id) so the user sees a single unified list.
    //
    // We still keep the separate `animeResults` signal for the case
    // where TMDB returns 0 — in that case the UI shows a dedicated
    // "Anime Results" section so the user knows the results came from
    // a different source.
    const animeLooksLikely = looksLikeAnimeQuery(q);
    let animePromise: Promise<TMDBTitle[]> | null = null;
    if (animeLooksLikely) {
      setAnimeLoading(true);
      animePromise = searchAnimeFallback(q, 10)
        .then((titles) => {
          if (signal.aborted) return [];
          setAnimeResults(titles);
          return titles;
        })
        .catch(() => {
          if (signal.aborted) return [];
          setAnimeResults([]);
          return [];
        })
        .finally(() => {
          if (!signal.aborted) setAnimeLoading(false);
        });
    }

    // Phase 6.2 Task 4b — fire searchPeople IN PARALLEL with searchMulti.
    // TMDB's /search/multi (used by searchMulti) filters out people, so
    // we make a separate /search/person call to populate the People
    // section. The call is cached (10-min TTL) so repeat searches are
    // instant. We keep the limit low (8) to avoid overwhelming the UI.
    const peoplePromise = searchPeople(q, 8).catch(() => [] as TMDBPerson[]);

    Promise.all([searchMulti(q), peoplePromise])
      .then(([items, peopleRaw]) => {
        // ── Stale-response guard ───────────────────────────────────
        // If a newer search has been initiated since this one started,
        // this response is stale — silently discard it.
        if (signal.aborted || thisRequestId !== searchRequestId) return;

        const movies = items.filter((t) => t.media_type === "movie");
        const series = items.filter((t) => t.media_type === "tv");

        // Phase 6.2 Task 4a — merge AniList results into movies/series.
        // If animePromise is null (query didn't look anime), this is a
        // no-op. If it's in-flight, we wait for it so the merged result
        // includes both sources. Dedup by TMDB id (a popular anime like
        // "Attack on Titan" might appear in both TMDB and AniList).
        const mergeAnime = (
          animeTitles: TMDBTitle[]
        ): {
          movies: TMDBTitle[];
          series: TMDBTitle[];
        } => {
          if (animeTitles.length === 0) return { movies, series };
          const seenMovieIds = new Set(movies.map((m) => m.id));
          const seenSeriesIds = new Set(series.map((s) => s.id));
          const extraSeries: TMDBTitle[] = [];
          const extraMovies: TMDBTitle[] = [];
          for (const t of animeTitles) {
            if (t.media_type === "movie" && !seenMovieIds.has(t.id)) {
              extraMovies.push(t);
              seenMovieIds.add(t.id);
            } else if (t.media_type === "tv" && !seenSeriesIds.has(t.id)) {
              extraSeries.push(t);
              seenSeriesIds.add(t.id);
            }
          }
          return {
            movies: [...movies, ...extraMovies],
            series: [...series, ...extraSeries]
          };
        };

        const finalize = (animeTitles: TMDBTitle[]) => {
          // Double-check the guard before committing results to state.
          if (signal.aborted || thisRequestId !== searchRequestId) return;
          const merged = mergeAnime(animeTitles);
          const totalCount = merged.movies.length + merged.series.length;
          setResults({
            movies: merged.movies,
            series: merged.series,
            people: peopleRaw,
            totalCount
          });
        };

        if (animePromise) {
          // Wait for AniList to finish so we can merge in one shot.
          // If AniList fails, we still set the TMDB results (the
          // .catch in the promise above returns []).
          animePromise.then((animeTitles) => finalize(animeTitles));
        } else {
          finalize([]);
        }
      })
      .catch((err) => {
        // AbortError is expected when a new search supersedes this one.
        if (signal.aborted) return;
        // Stale-response guard
        if (thisRequestId !== searchRequestId) return;
        console.error("Search failed:", err);
        setError("Search failed. Please try again.");
        setResults(emptyResults());
      })
      .finally(() => {
        // Only clear loading if this is still the active request.
        if (thisRequestId === searchRequestId) {
          setLoading(false);
        }
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

  /**
   * Run a submitted query immediately instead of waiting for the debounce
   * timer. Typing still uses the normal debounce; this method fixes the
   * submit path where commitSearch() previously only wrote recent history.
   */
  const runSearchNow = (value: string) => {
    const trimmed = value.trim();
    setQuery(value);
    setDebouncedQuery(trimmed);
  };

  /** Clear the active catalog query and its rendered results immediately. */
  const clearQuery = () => {
    setQuery("");
    setDebouncedQuery("");
  };

  /** Retry the current debounced catalog query through the same pipeline. */
  const retrySearch = () => {
    if (debouncedQuery().trim().length < 2) return;
    setSearchRevision((value) => value + 1);
  };

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

  // ── Trending filtering ─────────────────────────────────────────────
  // "Trending this week" on the Search page must NOT show items that are
  // already in the user's library. We exclude them at the data level by
  // deriving `trending` from the raw `trendingItems` signal and the
  // existing `vaultKeys` memo (composite "{media_type}/{id}" keys, so a
  // movie and a TV show sharing the same numeric TMDB id are never
  // treated as the same item).
  //
  // The filter is reactive: when the vault finishes loading after the
  // trending fetch resolves, or when the user adds/removes a title while
  // the search page is open, the memo recomputes and the rendered list
  // updates. Order is preserved — we keep the TMDB trending order
  // exactly, only dropping matching items.
  //
  // Edge cases handled:
  //   • Empty vault → `vaultKeys().size === 0` → short-circuit returns
  //     the raw list (no allocation for the common guest case).
  //   • All items in vault → returns `[]`; the Search page's existing
  //     `<For>` over an empty array renders nothing inside the section.
  //   • Vault still loading → `vaultKeys` is empty for now, so the
  //     filter is a no-op; the public `trendingLoading` accessor (below)
  //     keeps the loader up until the vault resolves to avoid a flash.
  const trending = createMemo(() => {
    const items = trendingItems();
    const keys = vaultKeys();
    if (keys.size === 0) return items;
    return items.filter((t) => {
      const key = vaultIdKey(t);
      return key === null || !keys.has(key);
    });
  });

  // Public loading accessor for the "Trending this week" section. We
  // gate on BOTH the raw TMDB trending fetch AND the optional
  // `vaultLoading` accessor so the Search page does not flash
  // library items that disappear once the vault arrives. When
  // `vaultLoading` is not provided (e.g. unit tests that only pass
  // `vault`), this collapses to just the fetch state.
  const trendingLoading = createMemo(() => {
    if (trendingFetching()) return true;
    return args.vaultLoading ? args.vaultLoading() : false;
  });

  // Derived flags — captured as variables so the linter can analyze the
  // createMemo return values (also a tiny perf win: declared once per
  // hook call instead of inline in the returned object literal).
  const hasQuery = createMemo(() => debouncedQuery().trim().length >= 2);
  const isGenreBrowse = createMemo(() => genreBrowse().genre !== null);

  return {
    query,
    setQuery,
    runSearchNow,
    clearQuery,
    retrySearch,
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
    hasQuery,
    // Genre browse
    genreBrowse,
    browseGenre,
    loadMoreGenre,
    clearGenre,
    isGenreBrowse,
    // Anime fallback (Phase 5) — populated only when TMDB returns 0
    // results AND the query looks anime-related. Rendered as a separate
    // section in SearchResults so the user can distinguish them.
    animeResults,
    animeLoading
  };
}
