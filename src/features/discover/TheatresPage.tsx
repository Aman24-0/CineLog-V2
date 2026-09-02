// src/features/discover/TheatresPage.tsx
//
// TheatresPage — full-page view of movies currently in theatres for the
// user's selected country. Reached from the "Running in Theatres"
// section's "See All" button on the Discover page.
//
// 2026-09-03 v2: Added pagination (Load More), search, genre/language/
// rating filters, and sorting. All filters operate client-side on the
// already-loaded pages — no additional TMDB requests per filter change.
//
// Architecture:
//   - Data: getNowPlayingPage(region, page) from ~/core/tmdb/discover
//   - Region: useDiscoverRegion() (reactive — resets on country change)
//   - Pagination: append + dedupe by TMDB ID, stop at totalPages
//   - Filters: client-side memo over loaded titles
//   - Sort: client-side, stable deterministic

import {
  createSignal,
  createMemo,
  Show,
  For,
  onMount,
  on,
  createEffect,
  type Component
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import { getNowPlayingPage } from "~/core/tmdb/discover";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import { isTmdb404 } from "~/core/tmdb/tmdb";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { MOVIE_GENRES } from "~/core/tmdb/genres";
import { languageDisplayName } from "~/shared/data/languageCodes";
import type { TMDBTitle } from "~/shared/types";
import { useDiscoverActions } from "~/features/discover/useDiscoverActions";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";

type SortMode = "popular" | "rating" | "newest" | "oldest";

const TheatresPage: Component = () => {
  const navigate = useNavigate();
  const region = useDiscoverRegion();

  // ── State: loaded titles + pagination ────────────────────────────
  const [allTitles, setAllTitles] = createSignal<TMDBTitle[]>([]);
  const [currentPage, setCurrentPage] = createSignal(0);
  const [totalPages, setTotalPages] = createSignal(1);
  const [totalResults, setTotalResults] = createSignal(0);
  const [loadingInitial, setLoadingInitial] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [errorMore, setErrorMore] = createSignal<string | null>(null);

  // ── State: filters / sort ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = createSignal("");
  const [genreFilter, setGenreFilter] = createSignal<string>("all");
  const [languageFilter, setLanguageFilter] = createSignal<string>("all");
  const [ratingFilter, setRatingFilter] = createSignal<string>("all");
  const [sortMode, setSortMode] = createSignal<SortMode>("popular");

  const { watchlist, isGuest } = useUserLibrary();
  const { handleOpenTitle } = useDiscoverActions({
    watchlist,
    isGuest
  });

  // ── Data fetching ────────────────────────────────────────────────
  const fetchPage = async (page: number, replace: boolean) => {
    if (replace) {
      setLoadingInitial(true);
      setError(null);
    } else {
      setLoadingMore(true);
      setErrorMore(null);
    }

    try {
      const r = region();
      const result = await getNowPlayingPage(r, page);

      setCurrentPage(result.page);
      setTotalPages(result.totalPages);
      setTotalResults(result.totalResults);

      if (replace) {
        setAllTitles(result.titles);
      } else {
        // Append + dedupe by TMDB ID
        setAllTitles((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const newTitles = result.titles.filter((t) => !existingIds.has(t.id));
          return [...prev, ...newTitles];
        });
      }
    } catch (err) {
      if (!isTmdb404(err)) {
        console.warn("[TheatresPage] fetch failed:", err);
      }
      const msg = "Failed to load theatrical movies. Please try again.";
      if (replace) {
        setError(msg);
        setAllTitles([]);
      } else {
        setErrorMore(msg);
      }
    } finally {
      if (replace) setLoadingInitial(false);
      else setLoadingMore(false);
    }
  };

  // Initial load
  onMount(() => void fetchPage(1, true));

  // Region change → reset + fetch page 1 for the new region
  createEffect(
    on(
      region,
      () => {
        setAllTitles([]);
        setCurrentPage(0);
        setTotalPages(1);
        setTotalResults(0);
        setSearchQuery("");
        setGenreFilter("all");
        setLanguageFilter("all");
        setRatingFilter("all");
        setSortMode("popular");
        void fetchPage(1, true);
      },
      { defer: true }
    )
  );

  const loadMore = () => {
    if (loadingMore()) return; // no duplicate concurrent requests
    if (currentPage() >= totalPages()) return; // end of results
    void fetchPage(currentPage() + 1, false);
  };

  const canLoadMore = createMemo(
    () => currentPage() < totalPages() && !loadingMore()
  );

  // ── Derived: available genres/languages from loaded titles ───────
  const availableGenres = createMemo(() => {
    const genreSet = new Set<string>();
    for (const t of allTitles()) {
      const ids = t.genre_ids ?? [];
      for (const id of ids) {
        const name = MOVIE_GENRES[id];
        if (name) genreSet.add(name);
      }
    }
    return Array.from(genreSet).sort();
  });

  const availableLanguages = createMemo(() => {
    const langSet = new Set<string>();
    for (const t of allTitles()) {
      if (t.original_language) {
        langSet.add(t.original_language);
      }
    }
    return Array.from(langSet).sort();
  });

  // ── Derived: filtered + sorted titles ────────────────────────────
  const filteredTitles = createMemo(() => {
    let result = allTitles();

    // Search filter
    const q = searchQuery().trim().toLowerCase();
    if (q) {
      result = result.filter((t) => {
        const title = (t.title || t.name || "").toLowerCase();
        return title.includes(q);
      });
    }

    // Genre filter
    const gf = genreFilter();
    if (gf !== "all") {
      result = result.filter((t) => {
        const ids = t.genre_ids ?? [];
        return ids.some((id) => MOVIE_GENRES[id] === gf);
      });
    }

    // Language filter
    const lf = languageFilter();
    if (lf !== "all") {
      result = result.filter((t) => t.original_language === lf);
    }

    // Rating filter
    const rf = ratingFilter();
    if (rf !== "all") {
      const min = parseFloat(rf);
      result = result.filter((t) => (t.vote_average ?? 0) >= min);
    }

    // Sort
    const sm = sortMode();
    const sorted = [...result];
    switch (sm) {
      case "popular":
        sorted.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
        break;
      case "rating":
        sorted.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
        break;
      case "newest":
        sorted.sort((a, b) => {
          const da = a.release_date ?? "";
          const db = b.release_date ?? "";
          return db.localeCompare(da);
        });
        break;
      case "oldest":
        sorted.sort((a, b) => {
          const da = a.release_date ?? "";
          const db = b.release_date ?? "";
          return da.localeCompare(db);
        });
        break;
    }

    return sorted;
  });

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      {/* Back button */}
      <button
        type="button"
        class="btn-ghost focus-ring"
        onClick={() => navigate("/discover")}
        style={{ "margin-bottom": "var(--sp-4)" }}
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          arrow_back
        </span>
        Back to Discover
      </button>

      {/* Header */}
      <div class="discover-fold-header" style={{ "margin-bottom": "var(--sp-3)" }}>
        <div class="discover-fold-label">
          <span class="material-symbols-outlined" aria-hidden="true">
            theaters
          </span>
          Running in Theatres
        </div>
      </div>

      <p
        class="type-micro"
        style={{ color: "var(--text-muted)", "margin-bottom": "var(--sp-3)" }}
      >
        {region()} ·{" "}
        {allTitles().length > 0
          ? `${allTitles().length} of ${totalResults()} movies`
          : "Loading…"}
      </p>

      {/* Search + filters */}
      <Show when={!loadingInitial() && allTitles().length > 0}>
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "0.5rem",
            "margin-bottom": "var(--sp-4)"
          }}
        >
          {/* Search */}
          <input
            type="search"
            class="library-search-input"
            placeholder="Search theatre movies…"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            style={{
              width: "100%",
              "box-sizing": "border-box"
            }}
            aria-label="Search theatre movies"
          />

          {/* Filter row — wraps on mobile */}
          <div
            style={{
              display: "flex",
              "flex-wrap": "wrap",
              gap: "0.5rem",
              "align-items": "center"
            }}
          >
            <select
              class="rounded-lg border border-white/10 bg-[var(--glass-bg)] px-3 py-2 text-sm text-white outline-none"
              value={genreFilter()}
              onChange={(e) => setGenreFilter(e.currentTarget.value)}
              aria-label="Filter by genre"
            >
              <option value="all">All Genres</option>
              <For each={availableGenres()}>
                {(g) => <option value={g}>{g}</option>}
              </For>
            </select>

            <select
              class="rounded-lg border border-white/10 bg-[var(--glass-bg)] px-3 py-2 text-sm text-white outline-none"
              value={languageFilter()}
              onChange={(e) => setLanguageFilter(e.currentTarget.value)}
              aria-label="Filter by language"
            >
              <option value="all">All Languages</option>
              <For each={availableLanguages()}>
                {(lang) => (
                  <option value={lang}>
                    {languageDisplayName(lang) || lang}
                  </option>
                )}
              </For>
            </select>

            <select
              class="rounded-lg border border-white/10 bg-[var(--glass-bg)] px-3 py-2 text-sm text-white outline-none"
              value={ratingFilter()}
              onChange={(e) => setRatingFilter(e.currentTarget.value)}
              aria-label="Filter by rating"
            >
              <option value="all">All Ratings</option>
              <option value="6">6+ ★</option>
              <option value="7">7+ ★</option>
              <option value="8">8+ ★</option>
            </select>

            <select
              class="rounded-lg border border-white/10 bg-[var(--glass-bg)] px-3 py-2 text-sm text-white outline-none"
              value={sortMode()}
              onChange={(e) => setSortMode(e.currentTarget.value as SortMode)}
              aria-label="Sort by"
            >
              <option value="popular">Popular</option>
              <option value="rating">Highest Rated</option>
              <option value="newest">Newest Release</option>
              <option value="oldest">Oldest Release</option>
            </select>
          </div>
        </div>
      </Show>

      {/* Loading — initial */}
      <Show when={loadingInitial()}>
        <div class="search-rail" style={{ "flex-wrap": "wrap", "overflow-x": "visible" }}>
          <For each={Array.from({ length: 8 })}>
            {() => (
              <div class="search-rail-card">
                <div class="search-rail-poster skeleton-base" />
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Error — initial */}
      <Show when={!loadingInitial() && error()}>
        <div class="glass-empty-state" role="alert">
          <h3 class="glass-empty-state-title">Something went wrong</h3>
          <p class="glass-empty-state-body">{error()}</p>
          <button
            class="btn-primary focus-ring"
            onClick={() => void fetchPage(1, true)}
            style={{ "margin-top": "var(--sp-2)" }}
          >
            Retry
          </button>
        </div>
      </Show>

      {/* Empty — no movies at all */}
      <Show when={!loadingInitial() && !error() && allTitles().length === 0}>
        <div class="glass-empty-state">
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "48px", color: "var(--text-dim)" }}
            aria-hidden="true"
          >
            theaters
          </span>
          <h3 class="glass-empty-state-title">No movies in theatres</h3>
          <p class="glass-empty-state-body">
            There are no currently playing theatrical movies for your selected country.
            Try changing your country in Settings.
          </p>
        </div>
      </Show>

      {/* Filtered results */}
      <Show when={!loadingInitial() && !error() && allTitles().length > 0}>
        {/* No results after filtering (but more pages may exist) */}
        <Show when={filteredTitles().length === 0}>
          <div class="glass-empty-state">
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "32px", color: "var(--text-dim)" }}
              aria-hidden="true"
            >
              filter_alt_off
            </span>
            <h3 class="glass-empty-state-title">No movies match your filters</h3>
            <p class="glass-empty-state-body">
              Try adjusting your search or filters.
              <Show when={canLoadMore()}>
                {" "}Or load more movies to expand the search.
              </Show>
            </p>
          </div>
        </Show>

        {/* Movie grid */}
        <Show when={filteredTitles().length > 0}>
          <div
            class="search-rail"
            style={{
              "flex-wrap": "wrap",
              "overflow-x": "visible",
              "justify-content": "flex-start"
            }}
          >
            <For each={filteredTitles()}>
              {(title) => (
                <button
                  type="button"
                  class="search-rail-card"
                  onClick={() => handleOpenTitle(title)}
                  style={{ cursor: "pointer", "text-align": "left" }}
                  aria-label={`${title.title || title.name || "Untitled"} — open details`}
                >
                  <Show
                    when={title.poster_path}
                    fallback={
                      <div
                        class="search-rail-poster"
                        style={{
                          display: "flex",
                          "align-items": "center",
                          "justify-content": "center"
                        }}
                      >
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-size": "28px", color: "var(--text-dim)" }}
                          aria-hidden="true"
                        >
                          movie
                        </span>
                      </div>
                    }
                  >
                    <img
                      src={tmdbImage(title.poster_path, "w342") ?? ""}
                      alt=""
                      class="search-rail-poster"
                      loading="lazy"
                      decoding="async"
                    />
                  </Show>
                  <p class="search-rail-title">
                    {title.title || title.name || "Untitled"}
                  </p>
                  <p class="search-rail-meta">
                    {(title.release_date || title.first_air_date || "").slice(0, 4)}
                    {" · Movie"}
                  </p>
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* Load More */}
        <Show when={canLoadMore()}>
          <div
            style={{
              display: "flex",
              "justify-content": "center",
              "margin-top": "var(--sp-4)"
            }}
          >
            <button
              type="button"
              class="btn-primary focus-ring"
              onClick={() => loadMore()}
              disabled={loadingMore()}
            >
              {loadingMore() ? "Loading…" : "Load More"}
            </button>
          </div>
        </Show>

        {/* Error on Load More */}
        <Show when={errorMore()}>
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              "align-items": "center",
              gap: "0.5rem",
              "margin-top": "var(--sp-3)"
            }}
          >
            <p class="type-micro" style={{ color: "var(--text-muted)" }}>
              {errorMore()}
            </p>
            <button
              type="button"
              class="btn-ghost focus-ring"
              onClick={() => loadMore()}
            >
              Retry Load More
            </button>
          </div>
        </Show>

        {/* End of results */}
        <Show when={!canLoadMore() && !loadingMore() && currentPage() >= totalPages()}>
          <p
            class="type-micro"
            style={{
              "text-align": "center",
              color: "var(--text-dim)",
              "margin-top": "var(--sp-4)"
            }}
          >
            All {allTitles().length} movies loaded
          </p>
        </Show>
      </Show>
    </PageContainer>
  );
};

export default TheatresPage;
