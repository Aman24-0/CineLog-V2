// src/features/search/SearchPage.tsx
import { For, Show, createSignal, createMemo, onMount } from "solid-js";
import { useVault } from "~/features/watchlist/useVault";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { getClient } from "~/lib/supabase/client";
import { createVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";
import { tmdbImage } from "~/core/tmdb/tmdb";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import Icon from "~/shared/ui/Icon";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";
import { useSearch } from "./useSearch";

/* Genre pills for the cold-start "browse by genre" grid.
   These map to TMDB movie genre IDs via the discover API's genreIdFor. */
const GENRE_PILLS: { label: string; icon: string }[] = [
  { label: "Sci-Fi", icon: "rocket_launch" },
  { label: "Drama", icon: "theater_comedy" },
  { label: "Thriller", icon: "psychology" },
  { label: "Action", icon: "bolt" },
  { label: "Comedy", icon: "sentiment_very_satisfied" },
  { label: "Horror", icon: "ghost" },
  { label: "Romance", icon: "favorite" },
  { label: "Documentary", icon: "movie" }
];

/**
 * SearchPage — CineLog's intentional discovery-by-query experience.
 *
 * DESIGN PHILOSOPHY:
 *   Search is the INTENTIONAL path; Discover is the SERENDIPITOUS path.
 *   Discover says "here's something you might love"; Search says "find
 *   me this specific thing". They must feel different.
 *
 * COLD START (no query):
 *   - Search bar (autofocus)
 *   - Recent searches rail (last 8, from localStorage)
 *   - Trending this week rail (TMDB trending, vault-aware)
 *   - Browse by genre grid (8 genre pills → future genre search)
 *
 * ACTIVE QUERY (≥2 chars, debounced 250ms):
 *   - Results grouped into Movies / Series
 *   - Each result is a horizontal row: poster + title + year + type +
 *     RelationshipPill (vault-aware)
 *   - Vault titles get a subtle accent border
 *
 * EMPTY RESULTS:
 *   A quiet, cinematic empty state — not an error.
 *
 * INTEGRATION:
 *   - Reuses openTitle from useModalState (ownership-aware)
 *   - Reuses addToVault service (one-tap save)
 *   - Reuses v2-pill, surface-glass, btn-primary design tokens
 */
export default function SearchPage() {
  const { watchlist, isGuest } = useVault();
  const { showToast } = useToast();
  const { openTitle } = useModalState();

  const {
    query,
    setQuery,
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
    genreBrowse,
    browseGenre,
    loadMoreGenre,
    clearGenre,
    isGenreBrowse
  } = useSearch({ vault: watchlist });

  const [searchInputEl, setSearchInputEl] = createSignal<HTMLInputElement | null>(null);

  onMount(() => {
    // Autofocus the search bar on mount
    setTimeout(() => searchInputEl()?.focus(), 100);
  });

  const handleOpenTitle = (title: TMDBTitle) => {
    const baseItem: WatchlistItem = {
      id: String(title.id),
      title: title.title,
      name: title.name,
      media_type: title.media_type,
      poster_path: title.poster_path,
      backdrop_path: title.backdrop_path,
      status: "Planned",
      release_date: title.release_date,
      first_air_date: title.first_air_date,
      genresList: title.genres
    };
    openTitle(baseItem, watchlist());
  };

  const handleAddToVault = async (title: TMDBTitle) => {
    const uid = getCurrentUid();
    if (!uid) {
      showToast("Sign in to save titles to your vault.", "error");
      return;
    }
    if (isGuest()) {
      try {
        const supabase = getClient();
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: typeof window !== "undefined" ? window.location.origin : undefined
          }
        });
        if (error) throw error;
        showToast("Signed in — try saving again.", "success");
      } catch {
        showToast("Sign in failed. Please try again.", "error");
      }
      return;
    }
    try {
      const item: WatchlistItem = {
        id: String(title.id),
        title: title.title,
        name: title.name,
        media_type: title.media_type,
        poster_path: title.poster_path ?? undefined,
        backdrop_path: title.backdrop_path ?? undefined,
        status: "Planned",
        release_date: title.release_date,
        first_air_date: title.first_air_date,
        genresList: title.genres,
        director: title.director
      };
      await createVaultItemInSupabase(uid, item);
      const name = title.title || title.name || "Title";
      showToast(`Added "${name}" to your vault`, "success", 1800);
    } catch (err) {
      console.error("Failed to add to vault:", err);
      showToast("Failed to save. Try again.", "error");
    }
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    commitSearch(query());
  };

  const handleRecentClick = (q: string) => {
    setQuery(q);
    commitSearch(q);
  };

  const titleOf = (t: TMDBTitle) => t.title || t.name || "Untitled";
  const yearOf = (t: TMDBTitle) =>
    (t.release_date || t.first_air_date || "").split("-")[0] || "";
  const imdbOf = (t: TMDBTitle) =>
    t.vote_average ? t.vote_average.toFixed(1) : null;

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />

      {/* Page eyebrow — sets the search mindset */}
      <div class="search-eyebrow-block">
        <p class="search-eyebrow">Search</p>
        <h1 class="search-page-title">Find your next watch</h1>
        <p class="search-page-subtitle">
          {isGuest()
            ? "Search across movies and series — sign in to save what you find."
            : "Search by title, person, or franchise. Results you already own are highlighted."}
        </p>
      </div>

      {/* Search bar — the primary interaction */}
      <form class="search-bar-form" onSubmit={handleSubmit} role="search">
        <div class="search-bar">
          <span class="material-symbols-outlined search-bar-icon" aria-hidden="true">search</span>
          <input
            ref={setSearchInputEl}
            type="search"
            class="search-bar-input"
            placeholder="Search movies, series, people…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            aria-label="Search movies, series, and people"
            autocomplete="off"
            spellcheck={false}
          />
          <Show when={query()}>
            <button
              type="button"
              class="search-bar-clear"
              onClick={() => { setQuery(""); searchInputEl()?.focus(); }}
              aria-label="Clear search"
            >
              <span class="material-symbols-outlined" style="font-size: 18px" aria-hidden="true">close</span>
            </button>
          </Show>
        </div>
      </form>

      {/* Genre browse mode OR text-search results OR cold-start state */}
      <Show when={isGenreBrowse()} fallback={
        <Show when={hasQuery()} fallback={
        <div class="search-cold-start">
          {/* Recent searches */}
          <Show when={recentSearches().length > 0}>
            <section class="search-section">
              <div class="search-section-label">
                <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">history</span>
                Recent Searches
                <button
                  type="button"
                  class="search-section-action"
                  onClick={clearRecent}
                  aria-label="Clear all recent searches"
                >
                  Clear
                </button>
              </div>
              <div class="search-recent-list">
                <For each={recentSearches()}>
                  {(q) => (
                    <button
                      type="button"
                      class="search-recent-chip"
                      onClick={() => handleRecentClick(q)}
                      aria-label={`Search for: ${q}`}
                    >
                      <span>{q}</span>
                      <span
                        class="material-symbols-outlined search-recent-remove"
                        style="font-size: 14px"
                        aria-hidden="true"
                        onClick={(e) => { e.stopPropagation(); removeRecent(q); }}
                      >
                        close
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </section>
          </Show>

          {/* Trending this week */}
          <Show when={!trendingLoading()}>
            <section class="search-section">
              <div class="search-section-label">
                <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">trending_up</span>
                Trending This Week
              </div>
              <div class="search-rail">
                <For each={trending()}>
                  {(t) => (
                    <button
                      type="button"
                      class="search-rail-card"
                      onClick={() => handleOpenTitle(t)}
                      aria-label={`${titleOf(t)}${yearOf(t) ? `, ${yearOf(t)}` : ""} — open details`}
                    >
                      <div class={`search-rail-poster${isInVault(t) ? " search-rail-poster-vault" : ""}`}>
                        <Show
                          when={t.poster_path || t.backdrop_path}
                          fallback={
                            <div class="search-rail-poster-fallback" aria-hidden="true">
                              <span class="material-symbols-outlined" style="font-size: 24px; color: var(--text-dim)">movie</span>
                            </div>
                          }
                        >
                          <img
                            src={tmdbImage(t.poster_path || t.backdrop_path, "w342")}
                            class="search-rail-poster-img"
                            loading="lazy"
                            decoding="async"
                            alt=""
                            aria-hidden="true"
                          />
                        </Show>
                        <Show when={isInVault(t)}>
                          <span class="search-rail-vault-dot" aria-label="In your vault" />
                        </Show>
                      </div>
                      <p class="search-rail-title">{titleOf(t)}</p>
                      <p class="search-rail-meta">
                        {yearOf(t) ? `${yearOf(t)} · ` : ""}
                        {t.media_type === "tv" ? "Series" : "Movie"}
                      </p>
                    </button>
                  )}
                </For>
              </div>
            </section>
          </Show>

          {/* Browse by genre */}
          <section class="search-section">
            <div class="search-section-label">
              <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">grid_view</span>
              Browse by Genre
            </div>
            <div class="search-genre-grid">
              <For each={GENRE_PILLS}>
                {(g) => (
                  <button
                    type="button"
                    class="search-genre-pill"
                    onClick={() => browseGenre(g.label)}
                    aria-label={`Browse ${g.label} titles`}
                  >
                    <span class="material-symbols-outlined search-genre-icon" aria-hidden="true">{g.icon}</span>
                    {g.label}
                  </button>
                )}
              </For>
            </div>
          </section>
        </div>
      }>
        {/* Active query results */}
        <Show when={!error()} fallback={
          <div class="search-empty">
            <p class="type-body-soft" style={{ "text-align": "center" }}>{error()}</p>
          </div>
        }>
          <Show when={!loading()} fallback={
            <div class="search-loading" aria-hidden="true">
              <For each={[1, 2, 3, 4]}>
                {() => <div class="search-result-skeleton" />}
              </For>
            </div>
          }>
            <Show
              when={results().totalCount > 0}
              fallback={
                <div class="search-empty">
                  <span class="material-symbols-outlined search-empty-icon" aria-hidden="true">search_off</span>
                  <p class="type-body-soft" style={{ "text-align": "center", "max-width": "280px" }}>
                    Nothing matches "{query()}" yet. Try a title, a person, or a genre.
                  </p>
                </div>
              }
            >
              {/* Movies */}
              <Show when={results().movies.length > 0}>
                <section class="search-section">
                  <div class="search-section-label">
                    <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">movie</span>
                    Movies ({results().movies.length})
                  </div>
                  <div class="search-results-list">
                    <For each={results().movies}>
                      {(t) => (
                        <SearchResultRow
                          title={t}
                          inVault={isInVault(t)}
                          onOpen={() => handleOpenTitle(t)}
                          onAdd={() => handleAddToVault(t)}
                        />
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              {/* Series */}
              <Show when={results().series.length > 0}>
                <section class="search-section">
                  <div class="search-section-label">
                    <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">tv</span>
                    Series ({results().series.length})
                  </div>
                  <div class="search-results-list">
                    <For each={results().series}>
                      {(t) => (
                        <SearchResultRow
                          title={t}
                          inVault={isInVault(t)}
                          onOpen={() => handleOpenTitle(t)}
                          onAdd={() => handleAddToVault(t)}
                        />
                      )}
                    </For>
                  </div>
                </section>
              </Show>
            </Show>
          </Show>
        </Show>
      </Show>
      }>
        {/* GENRE BROWSE MODE — flat paginated list of titles in the selected genre.
            Uses TMDB discover by genre ID, not text search, so "Horror" returns
            actual Horror films. Infinite scroll via loadMoreGenre. */}
        <section class="search-section">
          {/* Genre header with back button */}
          <div class="search-genre-header">
            <button
              type="button"
              class="search-genre-back"
              onClick={clearGenre}
              aria-label="Back to search"
            >
              <span class="material-symbols-outlined" style="font-size: 18px" aria-hidden="true">arrow_back</span>
            </button>
            <div class="search-genre-header-text">
              <p class="search-genre-eyebrow">Browsing</p>
              <h2 class="search-genre-title">{genreBrowse().genre}</h2>
            </div>
          </div>

          {/* Results — flat list (movies + series interleaved), vault-aware */}
          <Show when={!genreBrowse().loading || genreBrowse().items.length > 0} fallback={
            <div class="search-loading" aria-hidden="true">
              <For each={[1, 2, 3, 4, 5, 6]}>
                {() => <div class="search-result-skeleton" />}
              </For>
            </div>
          }>
            <div class="search-results-list">
              <For each={genreBrowse().items}>
                {(t) => (
                  <SearchResultRow
                    title={t}
                    inVault={isInVault(t)}
                    onOpen={() => handleOpenTitle(t)}
                    onAdd={() => handleAddToVault(t)}
                  />
                )}
              </For>
            </div>

            {/* Infinite scroll trigger + loading more indicator */}
            <Show when={genreBrowse().hasMore}>
              <div
                class="search-load-more"
                onClick={() => loadMoreGenre()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    loadMoreGenre();
                  }
                }}
                role="button"
                tabindex={0}
                aria-label="Load more results"
              >
                <Show when={!genreBrowse().loading} fallback={
                  <span class="search-load-more-loading">
                    <span class="material-symbols-outlined animate-spin" style="font-size: 16px" aria-hidden="true">progress_activity</span>
                    Loading more…
                  </span>
                }>
                  <span class="search-load-more-text">Load more</span>
                </Show>
              </div>
            </Show>

            {/* End of results */}
            <Show when={!genreBrowse().hasMore && genreBrowse().items.length > 0}>
              <p class="search-end-of-results type-micro">
                You've reached the end of {genreBrowse().genre}
              </p>
            </Show>
          </Show>
        </section>
      </Show>
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/* SearchResultRow — a single horizontal result row.                  */
/* ------------------------------------------------------------------ */
interface SearchResultRowProps {
  title: TMDBTitle;
  inVault: boolean;
  onOpen: () => void;
  onAdd: () => void;
}

function SearchResultRow(props: SearchResultRowProps) {
  const titleOf = () => props.title.title || props.title.name || "Untitled";
  const yearOf = () =>
    (props.title.release_date || props.title.first_air_date || "").split("-")[0] || "";
  const imdbOf = () =>
    props.title.vote_average ? props.title.vote_average.toFixed(1) : null;

  return (
    <div class={`search-result-row${props.inVault ? " search-result-row-vault" : ""}`}>
      <button
        type="button"
        class="search-result-main"
        onClick={() => props.onOpen()}
        aria-label={`${titleOf()}${yearOf() ? `, ${yearOf()}` : ""} — open details`}
      >
        {/* Poster thumbnail */}
        <div class="search-result-poster">
          <Show
            when={props.title.poster_path || props.title.backdrop_path}
            fallback={
              <div class="search-result-poster-fallback" aria-hidden="true">
                <span class="material-symbols-outlined" style="font-size: 20px; color: var(--text-dim)">movie</span>
              </div>
            }
          >
            <img
              src={tmdbImage(props.title.poster_path || props.title.backdrop_path, "w185")}
              class="search-result-poster-img"
              loading="lazy"
              decoding="async"
              alt=""
              aria-hidden="true"
            />
          </Show>
        </div>

        {/* Info */}
        <div class="search-result-info">
          <p class="search-result-title">{titleOf()}</p>
          <p class="search-result-meta">
            {yearOf() ? `${yearOf()} · ` : ""}
            {props.title.media_type === "tv" ? "Series" : "Movie"}
            <Show when={imdbOf()}>
              {" · "}<span style="color: #f5c518">★ {imdbOf()}</span>
            </Show>
          </p>
        </div>
      </button>

      {/* Action — vault-aware */}
      <Show
        when={!props.inVault}
        fallback={
          <span class="v2-pill v2-pill-accent search-result-pill" aria-label="In your vault">
            <span class="material-symbols-outlined" style="font-size: 10px" aria-hidden="true">check</span>
            In Vault
          </span>
        }
      >
        <button
          type="button"
          class="search-result-add"
          onClick={() => props.onAdd()}
          aria-label={`Add ${titleOf()} to your vault`}
        >
          <span class="material-symbols-outlined" style="font-size: 16px" aria-hidden="true">add</span>
        </button>
      </Show>
    </div>
  );
}
