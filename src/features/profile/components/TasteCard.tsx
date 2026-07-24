// src/features/profile/components/TasteCard.tsx
//
// Taste section — favorites with different visual weight.
//
// Layout (mobile):
//   Movie    — full-width poster, 280px height
//   Series   — poster card, 140px height
//   Director — name + portrait + film count
//   Genre    — large Bebas Neue typography + breakdown bar
//
// Design:
//   • Different visual weight per category — movie dominates
//   • Genre breakdown bar shows top genre distribution
//   • No "Favorite X" labels on filled cards
//   • Green accent: dominant genre segment in breakdown bar
//   • Empty states: dashed outline + icon + short label

import { Show, createMemo, type Component, type Accessor } from "solid-js";
import { GlassPosterCard } from "~/shared/ui/glass";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { normalizeGenres } from "~/shared/utils/genres";
import type { ProfileData, FavoriteDirector } from "../useProfileData";
import type { StatsData } from "../useStats";
import { generateFavoriteReason } from "../utils/storyGenerator";

interface TasteCardProps {
  data: ProfileData | null;
  isEditing: boolean;
  onPick: (slot: FavoriteSlot) => void;
  stats: Accessor<StatsData | null>;
}

export type FavoriteSlot = "movie" | "series" | "director" | "genre";

const TasteCard: Component<TasteCardProps> = (props) => {
  // ── Movie content ──
  const movieContent = () => {
    const d = props.data;
    if (!d?.profile?.favorite_movie_id || !d.favoriteMovie) return null;
    const m = d.favoriteMovie;
    const year = (m.release_date ?? "").split("-")[0] || undefined;
    const genres = normalizeGenres(m.genres ?? []);
    const reason = generateFavoriteReason("movie", { title: m.title, genres, year }).reason;
    return {
      title: m.title ?? m.name ?? "Untitled",
      subtitle: year,
      reason,
      imagePath: m.poster_path ?? m.backdrop_path ?? null,
    };
  };

  // ── Series content ──
  const seriesContent = () => {
    const d = props.data;
    if (!d?.profile?.favorite_series_id || !d.favoriteSeries) return null;
    const s = d.favoriteSeries;
    const year = (s.first_air_date ?? "").split("-")[0] || undefined;
    const genres = normalizeGenres(s.genres ?? []);
    const reason = generateFavoriteReason("series", { title: s.name, genres, year }).reason;
    return {
      title: s.name ?? s.title ?? "Untitled",
      subtitle: year,
      reason,
      imagePath: s.poster_path ?? s.backdrop_path ?? null,
    };
  };

  // ── Director content ──
  const directorContent = () => {
    const d = props.data;
    if (!d?.profile?.favorite_director_id || !d.favoriteDirector) return null;
    const dir: FavoriteDirector = d.favoriteDirector;
    const reason = generateFavoriteReason("director", { directorName: dir.name }).reason;
    return {
      title: dir.name,
      reason,
      imagePath: dir.profile_path,
    };
  };

  // ── Genre content ──
  const genreContent = () => {
    const g = props.data?.profile?.favorite_genre;
    if (!g) return null;
    const reason = generateFavoriteReason("genre", { genreName: g }).reason;
    return { title: g, reason };
  };

  // ── Genre breakdown bar data ──
  const genreBreakdown = createMemo(() => {
    const s = props.stats();
    if (!s || s.topGenres.length === 0) return [];
    const top = s.topGenres.slice(0, 4);
    const topPct = top.reduce((sum, g) => sum + g.pct, 0);
    const otherPct = 100 - topPct;
    const segments = top.map((g) => ({
      name: g.name,
      pct: g.pct,
      isDominant: g === top[0],
    }));
    if (otherPct > 0) {
      segments.push({ name: "Other", pct: otherPct, isDominant: false });
    }
    return segments;
  });

  // ── Favorite genre count from watchlist ──
  const favoriteGenreCount = createMemo(() => {
    const s = props.stats();
    const genre = props.data?.profile?.favorite_genre;
    if (!s || !genre) return null;
    const match = s.topGenres.find((g) =>
      g.name.toLowerCase().includes(genre.toLowerCase()) ||
      genre.toLowerCase().includes(g.name.toLowerCase())
    );
    return match?.count ?? null;
  });

  return (
    <div class="taste-section">
      {/* Section title */}
      <div class="taste-section-header">
        <h2 class="taste-section-title">Your Taste</h2>
        <p class="taste-section-subtitle">The stories that define you</p>
      </div>

      <div class="taste-mosaic">
        {/* ── Favorite Movie — full-width poster ── */}
        <div class="taste-cell taste-cell-movie">
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
                <GlassPosterCard
                  title={mc().title}
                  meta={mc().subtitle}
                  imageUrl={mc().imagePath ? tmdbImage(mc().imagePath, "w780") : undefined}



                  onClick={() => props.isEditing && props.onPick("movie")}
                />
                {/* Personal reason — very small elegant subtitle */}
                <Show when={mc().reason}>
                  <p class="taste-movie-reason">{mc().reason}</p>
                </Show>
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

        {/* ── Favorite Series — poster card ── */}
        <div class="taste-cell taste-cell-series">
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
                  <Show when={sc().reason}>
                    <p class="taste-card-reason">{sc().reason}</p>
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

        {/* ── Favorite Director — name + portrait + count ── */}
        <div class="taste-cell taste-cell-director">
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
                  <Show when={dc().reason}>
                    <p class="taste-director-reason">{dc().reason}</p>
                  </Show>
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

        {/* ── Favorite Genre — large typography + breakdown bar ── */}
        <div class="taste-cell taste-cell-genre">
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
                <Show when={favoriteGenreCount()}>
                  <p class="taste-genre-count">{favoriteGenreCount()} titles</p>
                </Show>
                <Show when={gc().reason}>
                  <p class="taste-genre-reason">{gc().reason}</p>
                </Show>
              </div>
            )}
          </Show>

          {/* Genre breakdown bar — shows top genre distribution */}
          <Show when={genreBreakdown().length >= 2}>
            <div class="taste-genre-breakdown" role="img" aria-label="Genre distribution">
              <For each={genreBreakdown()}>
                {(seg) => (
                  <div
                    class={`taste-genre-breakdown-segment ${seg.isDominant ? "taste-genre-breakdown-dominant" : ""}`}
                    style={{ width: `${seg.pct}%` }}
                    title={`${seg.name}: ${seg.pct}%`}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

// Need For import
import { For } from "solid-js";

export default TasteCard;
