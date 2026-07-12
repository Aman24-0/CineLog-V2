// src/features/profile/components/TasteCard.tsx
//
// Sprint 2C — Premium Profile Redesign.
// Asymmetric layout replacing the old 2×2 equal grid.
//   • Favorite Movie: Large hero card (PremiumHeroCard) spanning ~60% width
//   • Favorite Series: Medium card (PremiumCard) with poster
//   • Favorite Director: Medium card (PremiumCard) with portrait
//   • Favorite Genre: Compact gradient surface (PremiumGradientSurface)
//
// CSS Grid template areas:
//   "movie  movie  series"
//   "movie  movie  director"
//   "genre  genre  genre"
//
// On mobile (narrow), stacks vertically: Movie → Series → Director → Genre.
//
// Zero changes to props interface or content resolution logic.

import { Show, type Component } from "solid-js";
import { PremiumHeroCard, PremiumCard, PremiumGradientSurface } from "~/shared/ui/premium";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { ProfileData, FavoriteDirector } from "../useProfileData";

interface TasteCardProps {
  data: ProfileData | null;
  isEditing: boolean;
  /** Called when the user taps a tile to set/change a favorite. */
  onPick: (slot: FavoriteSlot) => void;
}

export type FavoriteSlot = "movie" | "series" | "director" | "genre";

/**
 * TasteCard — the signature section of the Profile.
 *
 * Sprint 2C redesign uses an asymmetric layout instead of 2×2 grid:
 *   • Favorite Movie: PremiumHeroCard (large, spanning 2 cols × 2 rows)
 *   • Favorite Series: PremiumCard (medium, top-right)
 *   • Favorite Director: PremiumCard (medium, mid-right)
 *   • Favorite Genre: PremiumGradientSurface (full-width bottom row)
 *
 * Empty slots show a dashed "+" CTA. In edit mode, filled slots
 * show a "Change" overlay on hover.
 */
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
      subtitle: "Director",
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
    <div class="taste-identity">
      {/* ── Favorite Movie — large hero card ── */}
      <div
        class="taste-cell taste-cell-movie"
        style={{ "grid-area": "movie" }}
      >
        <Show
          when={movieContent()}
          fallback={
            <button
              type="button"
              class="taste-tile-empty taste-tile-empty-hero focus-ring"
              onClick={() => props.onPick("movie")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onPick("movie"); } }}
              aria-label="Set your favorite movie. Tap to choose."
            >
              <div class="taste-tile-empty-inner">
                <span class="material-symbols-outlined taste-tile-empty-icon" aria-hidden="true">movie</span>
                <p class="taste-tile-empty-label">Favorite Movie</p>
                <p class="taste-tile-empty-cta">Tap to set</p>
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
              aria-label={`Favorite Movie: ${mc().title}.${props.isEditing ? " Tap to change." : ""}`}
            >
              <PremiumHeroCard
                title={mc().title}
                subtitle={mc().subtitle}
                eyebrow="Favorite Movie"
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

      {/* ── Favorite Series — medium card ── */}
      <div
        class="taste-cell taste-cell-series"
        style={{ "grid-area": "series" }}
      >
        <Show
          when={seriesContent()}
          fallback={
            <button
              type="button"
              class="taste-tile-empty taste-tile-empty-medium focus-ring"
              onClick={() => props.onPick("series")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onPick("series"); } }}
              aria-label="Set your favorite series. Tap to choose."
            >
              <div class="taste-tile-empty-inner">
                <span class="material-symbols-outlined taste-tile-empty-icon" aria-hidden="true">tv</span>
                <p class="taste-tile-empty-label">Favorite Series</p>
                <p class="taste-tile-empty-cta">Tap to set</p>
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
              aria-label={`Favorite Series: ${sc().title}.${props.isEditing ? " Tap to change." : ""}`}
            >
              <PremiumCard variant="default" size="comfortable" hoverable border="subtle" style={{ width: "100%", position: "relative", overflow: "hidden" }}>
                <Show when={sc().imagePath}>
                  <img
                    src={tmdbImage(sc().imagePath, "w342")}
                    class="taste-card-poster-img"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                </Show>
                <div class="taste-card-poster-overlay" aria-hidden="true" />
                <div class="taste-card-poster-content">
                  <p class="taste-card-eyebrow">Favorite Series</p>
                  <p class="taste-card-title">{sc().title}</p>
                  <Show when={sc().subtitle}>
                    <p class="taste-card-subtitle">{sc().subtitle}</p>
                  </Show>
                </div>
              </PremiumCard>
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

      {/* ── Favorite Director — medium card ── */}
      <div
        class="taste-cell taste-cell-director"
        style={{ "grid-area": "director" }}
      >
        <Show
          when={directorContent()}
          fallback={
            <button
              type="button"
              class="taste-tile-empty taste-tile-empty-medium focus-ring"
              onClick={() => props.onPick("director")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onPick("director"); } }}
              aria-label="Set your favorite director. Tap to choose."
            >
              <div class="taste-tile-empty-inner">
                <span class="material-symbols-outlined taste-tile-empty-icon" aria-hidden="true">person</span>
                <p class="taste-tile-empty-label">Favorite Director</p>
                <p class="taste-tile-empty-cta">Tap to set</p>
              </div>
            </button>
          }
        >
          {(dc) => (
            <div
              class="taste-director-card-wrap focus-ring"
              role="button"
              tabindex={0}
              onClick={() => props.isEditing && props.onPick("director")}
              onKeyDown={(e) => { if (props.isEditing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); props.onPick("director"); } }}
              aria-label={`Favorite Director: ${dc().title}.${props.isEditing ? " Tap to change." : ""}`}
            >
              <PremiumCard variant="default" size="comfortable" hoverable border="subtle" style={{ width: "100%", position: "relative", overflow: "hidden" }}>
                <Show when={dc().imagePath}>
                  <img
                    src={tmdbImage(dc().imagePath, "w342")}
                    class="taste-card-portrait-img"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                </Show>
                <div class="taste-card-poster-overlay" aria-hidden="true" />
                <div class="taste-card-poster-content">
                  <p class="taste-card-eyebrow">Favorite Director</p>
                  <p class="taste-card-title">{dc().title}</p>
                  <Show when={dc().subtitle}>
                    <p class="taste-card-subtitle">{dc().subtitle}</p>
                  </Show>
                </div>
              </PremiumCard>
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

      {/* ── Favorite Genre — gradient surface ── */}
      <div
        class="taste-cell taste-cell-genre"
        style={{ "grid-area": "genre" }}
      >
        <Show
          when={genreContent()}
          fallback={
            <button
              type="button"
              class="taste-tile-empty taste-tile-empty-genre focus-ring"
              onClick={() => props.onPick("genre")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onPick("genre"); } }}
              aria-label="Set your favorite genre. Tap to choose."
            >
              <div class="taste-tile-empty-inner">
                <span class="material-symbols-outlined taste-tile-empty-icon" aria-hidden="true">palette</span>
                <p class="taste-tile-empty-label">Favorite Genre</p>
                <p class="taste-tile-empty-cta">Tap to set</p>
              </div>
            </button>
          }
        >
          {(gc) => (
            <div
              class="taste-genre-surface-wrap focus-ring"
              role="button"
              tabindex={0}
              onClick={() => props.isEditing && props.onPick("genre")}
              onKeyDown={(e) => { if (props.isEditing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); props.onPick("genre"); } }}
              aria-label={`Favorite Genre: ${gc().title}.${props.isEditing ? " Tap to change." : ""}`}
            >
              <PremiumGradientSurface
                gradient="accent"
                direction="right"
                padding="comfortable"
                radius="lg"
                interactive={props.isEditing}
                aria-label={props.isEditing ? "Change favorite genre" : undefined}
                onClick={() => props.isEditing && props.onPick("genre")}
              >
                <div class="taste-genre-content">
                  <p class="taste-genre-label">Favorite Genre</p>
                  <p class="taste-genre-name">{gc().title}</p>
                </div>
              </PremiumGradientSurface>
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
  );
};

export default TasteCard;
