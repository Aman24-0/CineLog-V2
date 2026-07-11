// src/features/discover/components/GenreExplorer.tsx
import { For, Show, createSignal, createMemo, type Component } from "solid-js";
import { discoverMovies } from "~/core/tmdb/discover";
import { MOVIE_GENRES } from "~/core/tmdb/genres";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";

interface GenreExplorerProps {
  onSelect: (title: TMDBTitle) => void;
}

interface GenreDef {
  name: string;
  id: number;
  icon: string;
}

// Build genre list from the MOVIE_GENRES map, selecting the most popular
// genres for the explorer. Each genre has an icon for visual identity.
const GENRE_ICONS: Record<string, string> = {
  "Action": "bolt",
  "Comedy": "sentiment_very_satisfied",
  "Crime": "gavel",
  "Drama": "theater_comedy",
  "Fantasy": "auto_fix_high",
  "Horror": "ghost",
  "Animation": "animation",
  "Science Fiction": "rocket_launch",
  "Thriller": "psychology",
  "Mystery": "search",
};

const GENRES: GenreDef[] = Object.entries(MOVIE_GENRES)
  .filter(([name]) => name in GENRE_ICONS)
  .map(([name, id]) => ({
    name: name === "Science Fiction" ? "Sci-Fi" : name,
    id: Number(id),
    icon: GENRE_ICONS[name] ?? "movie",
  }));

/**
 * GenreExplorer — expandable genre carousels.
 *
 * Each genre is a pill that expands to show a horizontal carousel of
 * movies in that genre. Only fetches when the user expands a genre
 * (lazy loading). Uses cachedFetch so re-expanding is instant.
 */
const GenreExplorer: Component<GenreExplorerProps> = (props) => {
  const [expandedGenre, setExpandedGenre] = createSignal<number | null>(null);
  const [genreTitles, setGenreTitles] = createSignal<Record<number, TMDBTitle[]>>({});
  const [loadingGenre, setLoadingGenre] = createSignal(false);

  const toggleGenre = async (genreId: number) => {
    if (expandedGenre() === genreId) {
      setExpandedGenre(null);
      return;
    }

    setExpandedGenre(genreId);

    // Only fetch if we haven't already cached this genre
    if (!genreTitles()[genreId]) {
      setLoadingGenre(true);
      try {
        const titles = await discoverMovies({
          withGenres: [genreId],
          sortBy: "popularity.desc",
          voteCountGte: 100,
        });
        setGenreTitles((prev) => ({ ...prev, [genreId]: titles }));
      } catch (err) {
        console.error("[GenreExplorer] Failed to fetch genre:", err);
        setGenreTitles((prev) => ({ ...prev, [genreId]: [] }));
      } finally {
        setLoadingGenre(false);
      }
    }
  };

  const currentTitles = createMemo(() => {
    const id = expandedGenre();
    if (id === null) return [];
    return genreTitles()[id] ?? [];
  });

  return (
    <div class="genre-explorer">
      {/* Genre pills */}
      <div class="quick-filter-bar">
        <For each={GENRES}>
          {(genre) => (
            <button
              type="button"
              class="quick-filter-tab focus-ring"
              data-active={expandedGenre() === genre.id}
              onClick={() => toggleGenre(genre.id)}
              aria-label={`Browse ${genre.name} movies`}
              aria-expanded={expandedGenre() === genre.id}
            >
              <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">
                {genre.icon}
              </span>
              {genre.name}
            </button>
          )}
        </For>
      </div>

      {/* Expanded carousel */}
      <Show when={expandedGenre() !== null}>
        <div style={{ "margin-top": "var(--sp-3)" }}>
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
                <p class="type-body-soft" style={{ "text-align": "center", padding: "var(--sp-4)" }}>
                  No titles found for this genre.
                </p>
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
  );
};

export default GenreExplorer;
