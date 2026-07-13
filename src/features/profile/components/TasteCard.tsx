// src/features/profile/components/TasteCard.tsx
//
// Sprint 2C — Final Implementation.
// Curated gallery wall — every card feels different.
// No archetype panel (it lives in the Hero now).
// Section title kept: "Your Taste" with subtitle "The stories that define you."
//
// Layout (desktop):
//   ┌─────────────────────────────────────────────┐
//   │  Your Taste                                 │
//   │  The stories that define you                │
//   └─────────────────────────────────────────────┘
//   ┌────────────────────┬────────────────────────┐
//   │                    │                         │
//   │  MOVIE (large)     │  Series (medium)        │
//   │  edge-to-edge      │  poster card            │
//   │  poster hero       │                         │
//   │                    ├────────────────────────┤
//   │                    │  Director (horizontal)  │
//   └────────────────────┴────────────────────────┘
//   ┌─────────────────────────────────────────────┐
//   │  S C I - F I                                │
//   │  (genre as massive typography, no gradient)  │
//   └─────────────────────────────────────────────┘
//
// Mobile: Single column — Movie → Series → Director → Genre
//
// Design:
//   • Poster-first — images dominate, text is secondary
//   • No "Favorite Movie/Director" labels on filled cards
//   • Genre is massive Bebas Neue typography, not a gradient
//   • Empty states: dashed outline + icon + short label
//   • Green accent ONLY on empty tile CTA text

import { Show, type Component } from "solid-js";
import { PremiumHeroCard } from "~/shared/ui/premium";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { ProfileData, FavoriteDirector } from "../useProfileData";

interface TasteCardProps {
  data: ProfileData | null;
  isEditing: boolean;
  onPick: (slot: FavoriteSlot) => void;
}

export type FavoriteSlot = "movie" | "series" | "director" | "genre";

const TasteCard: Component<TasteCardProps> = (props) => {
  // ── Movie content ──
  const movieContent = () => {
    const d = props.data;
    if (!d?.profile?.favorite_movie_id || !d.favoriteMovie) return null;
    const m = d.favoriteMovie;
    return {
      title: m.title ?? m.name ?? "Untitled",
      subtitle: (m.release_date ?? "").split("-")[0] || undefined,
      imagePath: m.poster_path ?? m.backdrop_path ?? null,
    };
  };

  // ── Series content ──
  const seriesContent = () => {
    const d = props.data;
    if (!d?.profile?.favorite_series_id || !d.favoriteSeries) return null;
    const s = d.favoriteSeries;
    return {
      title: s.name ?? s.title ?? "Untitled",
      subtitle: (s.first_air_date ?? "").split("-")[0] || undefined,
      imagePath: s.poster_path ?? s.backdrop_path ?? null,
    };
  };

  // ── Director content ──
  const directorContent = () => {
    const d = props.data;
    if (!d?.profile?.favorite_director_id || !d.favoriteDirector) return null;
    const dir: FavoriteDirector = d.favoriteDirector;
    return {
      title: dir.name,
      imagePath: dir.profile_path,
    };
  };

  // ── Genre content ──
  const genreContent = () => {
    const g = props.data?.profile?.favorite_genre;
    if (!g) return null;
    return { title: g };
  };

  return (
    <div class="taste-section">
      {/* Section title — kept for orientation */}
      <div class="taste-section-header">
        <h2 class="taste-section-title">Your Taste</h2>
        <p class="taste-section-subtitle">The stories that define you</p>
      </div>

      <div class="taste-mosaic">
        {/* ── Favorite Movie — large edge-to-edge poster ── */}
        <div class="taste-cell taste-cell-movie" style={{ "grid-area": "movie" }}>
          <Show
            when={movieContent()}
            fallback={
              <button
                type="button"
                class="taste-tile-empty taste-tile-empty-hero focus-ring"
                onClick={() => props.onPick("movie")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onPick("movie"); } }}
                aria-label="Set your favorite movie"
              >
                <div class="taste-tile-empty-inner">
                  <span class="material-symbols-outlined taste-tile-empty-icon" aria-hidden="true">movie</span>
                  <p class="taste-tile-empty-cta">Film</p>
                </div>
              </button>
            }
          >
            {(mc) => (
              <div
                class="taste-movie-hero-wrap focus-ring"
                role="button"
                tabindex={0}
                onClick={() => props.isEditing && props.onPick("movie")}
                onKeyDown={(e) => { if (props.isEditing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); props.onPick("movie"); } }}
                aria-label={`${mc().title}.${props.isEditing ? " Tap to change." : ""}`}
              >
                <PremiumHeroCard
                  title={mc().title}
                  subtitle={mc().subtitle}
                  imageUrl={mc().imagePath ? tmdbImage(mc().imagePath, "w780") : undefined}
                  aspectRatio="2:3"
                  gradientStrength="heavy"
                  size="compact"
                  onClick={() => props.isEditing && props.onPick("movie")}
                />
                <Show when={props.isEditing}>
                  <div class="taste-tile-change-overlay" aria-hidden="true">
                    <span class="taste-tile-change-text">
                      <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">swap_horiz</span>
                      Change
                    </span>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </div>

        {/* ── Favorite Series — medium poster card ── */}
        <div class="taste-cell taste-cell-series" style={{ "grid-area": "series" }}>
          <Show
            when={seriesContent()}
            fallback={
              <button
                type="button"
                class="taste-tile-empty taste-tile-empty-medium focus-ring"
                onClick={() => props.onPick("series")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onPick("series"); } }}
                aria-label="Set your favorite series"
              >
                <div class="taste-tile-empty-inner">
                  <span class="material-symbols-outlined taste-tile-empty-icon" aria-hidden="true">tv</span>
                  <p class="taste-tile-empty-cta">Series</p>
                </div>
              </button>
            }
          >
            {(sc) => (
              <div
                class="taste-series-card-wrap focus-ring"
                role="button"
                tabindex={0}
                onClick={() => props.isEditing && props.onPick("series")}
                onKeyDown={(e) => { if (props.isEditing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); props.onPick("series"); } }}
                aria-label={`${sc().title}.${props.isEditing ? " Tap to change." : ""}`}
              >
                <img
                  src={tmdbImage(sc().imagePath, "w342")}
                  class="taste-card-poster-img"
                  loading="lazy"
                  decoding="async"
                  alt=""
                  aria-hidden="true"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <div class="taste-card-poster-overlay" aria-hidden="true" />
                <div class="taste-card-poster-content">
                  <p class="taste-card-title taste-card-title-series">{sc().title}</p>
                  <Show when={sc().subtitle}>
                    <p class="taste-card-subtitle">{sc().subtitle}</p>
                  </Show>
                </div>
                <Show when={props.isEditing}>
                  <div class="taste-tile-change-overlay" aria-hidden="true">
                    <span class="taste-tile-change-text">
                      <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">swap_horiz</span>
                      Change
                    </span>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </div>

        {/* ── Favorite Director — horizontal card ── */}
        <div class="taste-cell taste-cell-director" style={{ "grid-area": "director" }}>
          <Show
            when={directorContent()}
            fallback={
              <button
                type="button"
                class="taste-tile-empty taste-tile-empty-medium focus-ring"
                onClick={() => props.onPick("director")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onPick("director"); } }}
                aria-label="Set your favorite director"
              >
                <div class="taste-tile-empty-inner">
                  <span class="material-symbols-outlined taste-tile-empty-icon" aria-hidden="true">person</span>
                  <p class="taste-tile-empty-cta">Director</p>
                </div>
              </button>
            }
          >
            {(dc) => (
              <div
                class="taste-director-horiz-wrap focus-ring"
                role="button"
                tabindex={0}
                onClick={() => props.isEditing && props.onPick("director")}
                onKeyDown={(e) => { if (props.isEditing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); props.onPick("director"); } }}
                aria-label={`${dc().title}.${props.isEditing ? " Tap to change." : ""}`}
              >
                <Show when={dc().imagePath}>
                  <img
                    src={tmdbImage(dc().imagePath, "w185")}
                    class="taste-director-portrait"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                </Show>
                <div class="taste-director-info">
                  <p class="taste-director-name">{dc().title}</p>
                </div>
                <Show when={props.isEditing}>
                  <div class="taste-tile-change-overlay taste-tile-change-overlay-horiz" aria-hidden="true">
                    <span class="taste-tile-change-text">
                      <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">swap_horiz</span>
                      Change
                    </span>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </div>

        {/* ── Favorite Genre — massive typography ── */}
        <div class="taste-cell taste-cell-genre" style={{ "grid-area": "genre" }}>
          <Show
            when={genreContent()}
            fallback={
              <button
                type="button"
                class="taste-tile-empty taste-tile-empty-genre focus-ring"
                onClick={() => props.onPick("genre")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onPick("genre"); } }}
                aria-label="Set your favorite genre"
              >
                <div class="taste-tile-empty-inner">
                  <span class="material-symbols-outlined taste-tile-empty-icon" aria-hidden="true">palette</span>
                  <p class="taste-tile-empty-cta">Genre</p>
                </div>
              </button>
            }
          >
            {(gc) => (
              <div
                class="taste-genre-typography-wrap focus-ring"
                role="button"
                tabindex={0}
                onClick={() => props.isEditing && props.onPick("genre")}
                onKeyDown={(e) => { if (props.isEditing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); props.onPick("genre"); } }}
                aria-label={`Genre: ${gc().title}.${props.isEditing ? " Tap to change." : ""}`}
              >
                <p class="taste-genre-name-typography">{gc().title}</p>
                <Show when={props.isEditing}>
                  <div class="taste-tile-change-overlay" aria-hidden="true">
                    <span class="taste-tile-change-text">
                      <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">swap_horiz</span>
                      Change
                    </span>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
};

export default TasteCard;
