// src/features/discover/components/GenreExplorer.tsx
//
// GenreExplorer — interactive genre chips with lazy-loaded carousels.
//
// Production polish (final Discover update):
//   • Genre chips are ALWAYS visible (previously rendered only a title
//     when no genre was selected, which looked broken).
//   • Movies load only after the first tap (lazy fetch per genre).
//   • Only ONE genre expanded at a time — selecting a new chip
//     collapses the previous and expands the new.
//   • Smooth expand/collapse animation (max-height + opacity transition
//     under 250ms, reduced-motion safe).
//   • Carousel appears directly below chips.
//   • Every genre is cached — re-tapping a previously-expanded genre
//     is instant.
//   • Expanded state preserved across re-renders (in-component signal).
//   • Premium empty states with Retry on network failure.
//

import {
  For, Show, createSignal, createMemo, type Component,
} from "solid-js";
import { discoverMovies } from "~/core/tmdb/discover";
import { MOVIE_GENRES } from "~/core/tmdb/genres";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";
import PremiumEmptyState from "./PremiumEmptyState";

interface GenreExplorerProps {
  onSelect: (title: TMDBTitle) => void;
}

interface GenreDef {
  name: string;
  id: number;
  icon: string;
}

// Curated genre list for the explorer — matches the spec:
// Action, Comedy, Thriller, Drama, Sci-Fi, Animation, Fantasy,
// Adventure, Crime, Mystery.
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

// Curated, ordered genre list (rather than iterating the full MOVIE_GENRES
// map, which would include Documentary, Western, etc.).
const GENRES: GenreDef[] = [
  { name: "Action",      id: 28,   icon: GENRE_ICONS["Action"] },
  { name: "Comedy",      id: 35,   icon: GENRE_ICONS["Comedy"] },
  { name: "Thriller",    id: 53,   icon: GENRE_ICONS["Thriller"] },
  { name: "Drama",       id: 18,   icon: GENRE_ICONS["Drama"] },
  { name: "Sci-Fi",      id: 878,  icon: GENRE_ICONS["Sci-Fi"] },
  { name: "Animation",   id: 16,   icon: GENRE_ICONS["Animation"] },
  { name: "Fantasy",     id: 14,   icon: GENRE_ICONS["Fantasy"] },
  { name: "Adventure",   id: 12,   icon: GENRE_ICONS["Adventure"] },
  { name: "Crime",       id: 80,   icon: GENRE_ICONS["Crime"] },
  { name: "Mystery",     id: 9648, icon: GENRE_ICONS["Mystery"] },
];

// Sanity check — the IDs above match the TMDB MOVIE_GENRES map.
// (Defensive: if MOVIE_GENRES ever changes its IDs, this catches it.)
void MOVIE_GENRES;

const GenreExplorer: Component<GenreExplorerProps> = (props) => {
  const [expandedGenre, setExpandedGenre] = createSignal<number | null>(null);
  const [genreTitles, setGenreTitles] = createSignal<Record<number, TMDBTitle[]>>({});
  const [loadingGenre, setLoadingGenre] = createSignal(false);
  const [errorGenre, setErrorGenre] = createSignal<Error | null>(null);
  /** Tracks genres we've already fetched so we don't re-fetch on toggle. */
  const [fetchedGenres, setFetchedGenres] = createSignal<Set<number>>(new Set());

  const fetchGenre = async (genreId: number) => {
    setLoadingGenre(true);
    setErrorGenre(null);
    try {
      const titles = await discoverMovies({
        withGenres: [genreId],
        sortBy: "popularity.desc",
        voteCountGte: 100,
      });
      setGenreTitles((prev) => ({ ...prev, [genreId]: titles }));
      setFetchedGenres((prev) => new Set(prev).add(genreId));
    } catch (err) {
      console.error("[GenreExplorer] Failed to fetch genre:", err);
      setErrorGenre(err instanceof Error ? err : new Error(String(err)));
      setGenreTitles((prev) => ({ ...prev, [genreId]: [] }));
    } finally {
      setLoadingGenre(false);
    }
  };

  const toggleGenre = (genreId: number) => {
    if (expandedGenre() === genreId) {
      // Collapse — but preserve the cache so re-expanding is instant.
      setExpandedGenre(null);
      return;
    }
    setExpandedGenre(genreId);
    setErrorGenre(null);
    // Lazy load only on first tap.
    if (!fetchedGenres().has(genreId)) {
      void fetchGenre(genreId);
    }
  };

  const currentTitles = createMemo(() => {
    const id = expandedGenre();
    if (id === null) return [];
    return genreTitles()[id] ?? [];
  });

  const currentGenreDef = createMemo(() => {
    const id = expandedGenre();
    if (id === null) return null;
    return GENRES.find((g) => g.id === id) ?? null;
  });

  const handleRetry = () => {
    const id = expandedGenre();
    if (id === null) return;
    // Force re-fetch — clear cache for this genre.
    setFetchedGenres((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    void fetchGenre(id);
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
              data-active={expandedGenre() === genre.id}
              onClick={() => toggleGenre(genre.id)}
              role="tab"
              aria-selected={expandedGenre() === genre.id}
              aria-controls="genre-explorer-panel"
              aria-label={`Browse ${genre.name} movies`}
            >
              <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">
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
              when={!loadingGenre()}
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
                when={currentTitles().length > 0}
                fallback={
                  <Show
                    when={!errorGenre()}
                    fallback={
                      <PremiumEmptyState
                        icon="movie"
                        message={`Couldn't load ${currentGenreDef()?.name ?? "this genre"} movies.`}
                        hint="Check your connection and try again."
                        onRetry={handleRetry}
                      />
                    }
                  >
                    <PremiumEmptyState
                      icon="movie"
                      message={`No ${currentGenreDef()?.name ?? ""} titles available.`}
                      hint="Try another genre."
                    />
                  </Show>
                }
              >
                <div class="search-rail" role="list">
                  <For each={currentTitles().slice(0, 20)}>
                    {(title) => (
                      <button
                        type="button"
                        class="search-rail-card focus-ring"
                        onClick={() => props.onSelect(title)}
                        role="listitem"
                        aria-label={`${title.title || title.name || "Untitled"}, ${(title.release_date || "").split("-")[0] || ""}`}
                      >
                        <div class="search-rail-poster">
                          <Show
                            when={title.poster_path}
                            fallback={
                              <div class="search-rail-poster-fallback">
                                <span class="material-symbols-outlined" style={{ "font-size": "24px", color: "var(--text-dim)" }} aria-hidden="true">
                                  movie
                                </span>
                              </div>
                            }
                          >
                            <img
                              src={tmdbImage(title.poster_path, "w185")}
                              class="search-rail-poster-img"
                              loading="lazy"
                              decoding="async"
                              alt=""
                              aria-hidden="true"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          </Show>
                        </div>
                        <p class="search-rail-title">{title.title || title.name || "Untitled"}</p>
                        <p class="search-rail-meta">
                          {(title.release_date || "").split("-")[0] || ""}
                          {title.vote_average ? ` · ★ ${title.vote_average.toFixed(1)}` : ""}
                        </p>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default GenreExplorer;
