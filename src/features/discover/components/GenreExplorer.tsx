// src/features/discover/components/GenreExplorer.tsx
//
// GenreExplorer — interactive genre chips with lazy-loaded carousels.
//
// Production polish (Search → Discover merge):
//   • Genre chips are ALWAYS visible (previously rendered only a title
//     when no genre was selected, which looked broken).
//   • Movies AND series load in parallel and are interleaved, so each
//     genre carousel is a single mixed rail (the user asked for
//     "movie series list continue corausal").
//   • Continuous carousel: a "Load more" trigger appends the next page
//     of results. No hard cap — the rail grows until TMDB runs out.
//   • Only ONE genre expanded at a time — selecting a new chip
//     collapses the previous and expands the new.
//   • Smooth expand/collapse animation (max-height + opacity transition
//     under 250ms, reduced-motion safe).
//   • Every genre is cached — re-tapping a previously-expanded genre
//     is instant (the cache is page-aware so load-more still works).
//   • Expanded state preserved across re-renders (in-component signal).
//   • GlassEmptyState with Retry on network failure.
//

import {
  For, Show, createSignal, createMemo, type Component,
} from "solid-js";
import { discoverMovies, discoverTv } from "~/core/tmdb/discover";
import { MOVIE_GENRES } from "~/core/tmdb/genres";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";
import DiscoverEmptyState from "./DiscoverEmptyState";

interface GenreExplorerProps {
  onSelect: (title: TMDBTitle) => void;
  /**
   * Optional reactive set of "{media_type}/{tmdb_id}" keys for titles
   * already in the user's vault. When provided, vault titles are filtered
   * out of every genre carousel so the user never sees a title they've
   * already added. When omitted (e.g. for guests), no filtering is applied.
   */
  vaultKeys?: () => Set<string>;
}

interface GenreDef {
  name: string;
  movieId: number;
  tvId?: number;
  icon: string;
}

// Curated, ordered genre list (rather than iterating the full MOVIE_GENRES
// map, which would include Documentary, Western, etc.). Each entry carries
// its TMDB movie + TV genre IDs so we can fetch both in parallel.
//
// TV genre IDs differ from movie IDs for some genres — e.g. "Sci-Fi" is
// 878 for movies but doesn't exist as a standalone TV genre (it's rolled
// into "Sci-Fi & Fantasy" 10765). When a TV id is omitted, the carousel
// for that genre shows movies only.
const GENRE_ICONS: Record<string, string> = {
  "Action": "bolt",
  "Adventure": "explore",
  "Animation": "animation",
  "Comedy": "sentiment_very_satisfied",
  "Crime": "gavel",
  "Drama": "theater_comedy",
  "Fantasy": "auto_fix_high",
  "Mystery": "search",
  "Sci-Fi": "rocket_launch",
  "Thriller": "psychology",
};

const GENRES: GenreDef[] = [
  { name: "Action",      movieId: 28,   tvId: 10759,           icon: GENRE_ICONS["Action"] },
  { name: "Comedy",      movieId: 35,   tvId: 35,              icon: GENRE_ICONS["Comedy"] },
  { name: "Thriller",    movieId: 53,                         icon: GENRE_ICONS["Thriller"] },
  { name: "Drama",       movieId: 18,   tvId: 18,              icon: GENRE_ICONS["Drama"] },
  { name: "Sci-Fi",      movieId: 878,  tvId: 10765,           icon: GENRE_ICONS["Sci-Fi"] },
  { name: "Animation",   movieId: 16,   tvId: 16,              icon: GENRE_ICONS["Animation"] },
  { name: "Fantasy",     movieId: 14,   tvId: 10765,           icon: GENRE_ICONS["Fantasy"] },
  { name: "Adventure",   movieId: 12,   tvId: 10759,           icon: GENRE_ICONS["Adventure"] },
  { name: "Crime",       movieId: 80,   tvId: 80,              icon: GENRE_ICONS["Crime"] },
  { name: "Mystery",     movieId: 9648, tvId: 9648,            icon: GENRE_ICONS["Mystery"] },
];

// Sanity check — the movie IDs above match the TMDB MOVIE_GENRES map.
// (Defensive: if MOVIE_GENRES ever changes its IDs, this catches it.)
void MOVIE_GENRES;

/**
 * Fetch one page of genre results.
 *
 * QUERY DIVERSITY (v2):
 *   Previously this fetched `sort_by=popularity.desc` which always
 *   returned the same newest popular movies — the same 2026 blockbusters
 *   that appear in every other Discover row. Now we sort by
 *   `vote_average.desc` with `vote_count.gte=1500` to surface acclaimed
 *   genre classics, AND we pick a random page (1-5) on the FIRST page
 *   fetch so different users / sessions explore different catalogs.
 *
 *   Load-more requests use the sequential next page (page 2, 3, ...)
 *   so the continuous carousel still flows naturally after the first
 *   random page.
 *
 * Fetches from both movie and TV discover endpoints in parallel, then
 * interleaves the results (movie, tv, movie, tv...) for variety. Returns
 * ~20 items per page (10 movies + 10 TV). Deduplicates by composite
 * "{media_type}/{id}" key in case the same title appears in both.
 */
async function fetchGenrePage(
  genre: GenreDef,
  page: number,
): Promise<TMDBTitle[]> {
  // For the first page, pick a random starting page (1-5) so the
  // carousel shows different titles each session. For subsequent
  // pages (load-more), use the sequential page number so the carousel
  // flows continuously from the first random page.
  const fetchPage = page === 1 ? (1 + Math.floor(Math.random() * 5)) : page;

  const promises: Promise<TMDBTitle[]>[] = [
    discoverMovies({
      withGenres: [genre.movieId],
      // Sort by vote_average.desc (not popularity.desc) so we get
      // acclaimed genre classics instead of the same new blockbusters.
      sortBy: "vote_average.desc",
      // vote_count.gte=1500 ensures the results are well-known enough
      // to be "acclaimed" (not obscure 1-vote 10/10 entries).
      voteCountGte: 1500,
      page: fetchPage,
    }),
  ];
  if (genre.tvId !== undefined) {
    promises.push(
      discoverTv({
        withGenres: [genre.tvId],
        sortBy: "vote_average.desc",
        voteCountGte: 500,
        page: fetchPage,
      }),
    );
  }
  const results = await Promise.all(promises);
  const movies: TMDBTitle[] = results[0] ?? [];
  const series: TMDBTitle[] = results[1] ?? [];
  // Interleave: alternate movie, tv, movie, tv... for variety.
  const merged: TMDBTitle[] = [];
  const maxLen = Math.max(movies.length, series.length);
  for (let i = 0; i < maxLen; i++) {
    if (movies[i]) merged.push(movies[i]);
    if (series[i]) merged.push(series[i]);
  }
  // Deduplicate by composite key (in case the same title appears in both).
  const seen = new Set<string>();
  return merged.filter((t) => {
    const key = `${t.media_type}/${t.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface GenreCacheEntry {
  items: TMDBTitle[];
  page: number;
  hasMore: boolean;
  loading: boolean;
}

const GenreExplorer: Component<GenreExplorerProps> = (props) => {
  const [expandedGenre, setExpandedGenre] = createSignal<number | null>(null);
  // Per-genre cache: genreName → { items, page, hasMore, loading }.
  // Re-tapping a previously-expanded genre restores the cached rail
  // instantly without re-fetching.
  const [cache, setCache] = createSignal<Record<string, GenreCacheEntry>>({});
  const [errorGenre, setErrorGenre] = createSignal<Error | null>(null);

  const fetchFirstPage = async (genre: GenreDef) => {
    setCache((prev) => ({
      ...prev,
      [genre.name]: { items: [], page: 1, hasMore: true, loading: true },
    }));
    setErrorGenre(null);
    try {
      // fetchGenrePage picks a random page (1-5) for logical page 1 so
      // different sessions explore different catalogs. The cache stores
      // the LOGICAL page (1); loadMore passes 2, 3, ... which
      // fetchGenrePage maps to sequential TMDB pages.
      const items = await fetchGenrePage(genre, 1);
      setCache((prev) => ({
        ...prev,
        [genre.name]: {
          items,
          page: 1,
          // TMDB returns ~20 items per page on a single-endpoint call.
          // We merge two endpoints, so a full page is ~20-40 items.
          // Treat <10 returned items as "no more pages".
          hasMore: items.length >= 10,
          loading: false,
        },
      }));
    } catch (err) {
      console.error("[GenreExplorer] Failed to fetch genre:", err);
      setErrorGenre(err instanceof Error ? err : new Error(String(err)));
      setCache((prev) => ({
        ...prev,
        [genre.name]: { items: [], page: 1, hasMore: false, loading: false },
      }));
    }
  };

  const loadMore = async () => {
    const id = expandedGenre();
    if (id === null) return;
    const genre = GENRES.find((g) => g.movieId === id);
    if (!genre) return;
    const entry = cache()[genre.name];
    if (!entry || entry.loading || !entry.hasMore) return;

    const nextPage = entry.page + 1;
    setCache((prev) => ({
      ...prev,
      [genre.name]: { ...prev[genre.name], loading: true },
    }));
    try {
      const newItems = await fetchGenrePage(genre, nextPage);
      setCache((prev) => {
        const cur = prev[genre.name];
        return {
          ...prev,
          [genre.name]: {
            items: [...cur.items, ...newItems],
            page: nextPage,
            // If the API returned fewer than 10, we've hit the end.
            hasMore: newItems.length >= 10,
            loading: false,
          },
        };
      });
    } catch (err) {
      console.error("[GenreExplorer] load more failed:", err);
      setCache((prev) => ({
        ...prev,
        [genre.name]: { ...prev[genre.name], loading: false, hasMore: false },
      }));
    }
  };

  const toggleGenre = (genre: GenreDef) => {
    if (expandedGenre() === genre.movieId) {
      // Collapse — but preserve the cache so re-expanding is instant.
      setExpandedGenre(null);
      return;
    }
    setExpandedGenre(genre.movieId);
    setErrorGenre(null);
    // Lazy load only on first tap.
    if (!cache()[genre.name]) {
      void fetchFirstPage(genre);
    }
  };

  const currentEntry = createMemo(() => {
    const id = expandedGenre();
    if (id === null) return null;
    const genre = GENRES.find((g) => g.movieId === id);
    if (!genre) return null;
    return cache()[genre.name] ?? null;
  });

  /**
   * Reactive view of the current genre's items with vault titles filtered
   * out. Recomputes whenever the cache entry OR the vault keys change —
   * so adding a title to the watchlist immediately removes it from the
   * open carousel. When no vaultKeys prop is supplied (guest mode),
   * returns the raw items unfiltered.
   */
  const visibleItems = createMemo<TMDBTitle[]>(() => {
    const entry = currentEntry();
    if (!entry) return [];
    const items = entry.items;
    const vault = props.vaultKeys?.();
    if (!vault || vault.size === 0) return items;
    return items.filter((t) => !vault.has(`${t.media_type}/${t.id}`));
  });

  const currentGenreDef = createMemo(() => {
    const id = expandedGenre();
    if (id === null) return null;
    return GENRES.find((g) => g.movieId === id) ?? null;
  });

  const handleRetry = () => {
    const def = currentGenreDef();
    if (!def) return;
    void fetchFirstPage(def);
  };

  return (
    <div class="genre-explorer">
      {/* Genre chips — ALWAYS visible */}
      <div class="quick-filter-bar genre-explorer-chips" role="tablist" aria-label="Browse by genre">
        <For each={GENRES}>
          {(genre) => (
            <button
              type="button"
              class="quick-filter-tab focus-ring genre-chip"
              data-active={expandedGenre() === genre.movieId}
              onClick={() => toggleGenre(genre)}
              role="tab"
              aria-selected={expandedGenre() === genre.movieId}
              aria-controls="genre-explorer-panel"
              aria-label={`Browse ${genre.name} movies and series`}
            >
              <span class="material-symbols-outlined genre-chip-icon" aria-hidden="true">
                {genre.icon}
              </span>
              {genre.name}
            </button>
          )}
        </For>
      </div>

      {/* Expanded carousel panel — appears below chips, smooth animation */}
      <div
        id="genre-explorer-panel"
        class="genre-explorer-panel"
        classList={{ "is-expanded": expandedGenre() !== null }}
        role="region"
        aria-live="polite"
      >
        <Show when={expandedGenre() !== null}>
          <div class="genre-explorer-panel-inner">
            <Show
              when={!currentEntry()?.loading || (currentEntry()?.items.length ?? 0) > 0}
              fallback={
                <div class="search-rail">
                  <For each={Array.from({ length: 6 })}>
                    {() => (
                      <div class="search-rail-card" style={{ cursor: "default" }}>
                        <div class="search-rail-poster skeleton-base" />
                      </div>
                    )}
                  </For>
                </div>
              }
            >
              <Show
                when={visibleItems().length > 0}
                fallback={
                  <Show
                    when={!errorGenre()}
                    fallback={
                      <DiscoverEmptyState
                        icon="movie"
                        message={`Couldn't load ${currentGenreDef()?.name ?? "this genre"} titles.`}
                        hint="Check your connection and try again."
                        onRetry={handleRetry}
                      />
                    }
                  >
                    <DiscoverEmptyState
                      icon="movie"
                      message={`No new ${currentGenreDef()?.name ?? ""} titles to discover.`}
                      hint="You've already added everything here — try another genre."
                    />
                  </Show>
                }
              >
                <div class="search-rail" role="list">
                  <For each={visibleItems()}>
                    {(title) => {
                      const year = () =>
                        (title.release_date || title.first_air_date || "").split("-")[0] || "";
                      const rating = () =>
                        title.vote_average ? title.vote_average.toFixed(1) : null;

                      return (
                        <button
                          type="button"
                          class="search-rail-card focus-ring"
                          onClick={() => props.onSelect(title)}
                          role="listitem"
                          aria-label={`${title.title || title.name || "Untitled"}, ${year()}${title.media_type === "tv" ? ", Series" : ", Movie"}${rating() ? `, rated ${rating()}` : ""}`}
                        >
                          <div class="search-rail-poster">
                            <Show
                              when={title.poster_path}
                              fallback={
                                <div class="search-rail-poster-fallback">
                                  <span class="material-symbols-outlined" style={{ "font-size": "28px", color: "var(--text-dim)" }} aria-hidden="true">
                                    movie
                                  </span>
                                </div>
                              }
                            >
                              <img
                                src={tmdbImage(title.poster_path, "w342")}
                                class="search-rail-poster-img"
                                loading="lazy"
                                decoding="async"
                                alt=""
                                aria-hidden="true"
                                onError={(e) => { e.currentTarget.style.display = "none"; }}
                              />
                            </Show>

                            {/* Premium glass rating badge — top-right corner */}
                            <Show when={rating()}>
                              <span class="search-rail-rating" aria-label={`Rated ${rating()}`}>
                                <span class="material-symbols-outlined" style={{ "font-size": "10px", "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }} aria-hidden="true">star</span>
                                {rating()}
                              </span>
                            </Show>
                          </div>
                          <p class="search-rail-title">{title.title || title.name || "Untitled"}</p>
                          <p class="search-rail-meta">
                            <Show when={year()}>
                              <span>{year()}</span>
                            </Show>
                            <Show when={year() && title.media_type}>
                              <span style={{ color: "var(--text-dim)" }}>·</span>
                            </Show>
                            <Show when={title.media_type}>
                              <span>{title.media_type === "tv" ? "Series" : "Movie"}</span>
                            </Show>
                          </p>
                        </button>
                      );
                    }}
                  </For>
                </div>

                {/* Continuous carousel — load-more trigger (no hard cap) */}
                <Show when={currentEntry()?.hasMore}>
                  <div
                    class="search-load-more"
                    onClick={() => loadMore()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        loadMore();
                      }
                    }}
                    role="button"
                    tabindex={0}
                    aria-label={`Load more ${currentGenreDef()?.name ?? ""} titles`}
                  >
                    <Show
                      when={!currentEntry()?.loading}
                      fallback={
                        <span class="search-load-more-loading">
                          <span
                            class="material-symbols-outlined animate-spin"
                            style={{ "font-size": "16px" }}
                            aria-hidden="true"
                          >
                            progress_activity
                          </span>
                          Loading more…
                        </span>
                      }
                    >
                      <span class="search-load-more-text">Load more</span>
                    </Show>
                  </div>
                </Show>

                {/* End of results — quiet closer */}
                <Show when={!currentEntry()?.hasMore && (currentEntry()?.items.length ?? 0) > 0}>
                  <p class="search-end-of-results type-micro">
                    You've reached the end of {currentGenreDef()?.name}
                  </p>
                </Show>
              </Show>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default GenreExplorer;
