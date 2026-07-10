// src/features/profile/components/TasteCard.tsx
import { Show, For, createSignal, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { ProfileData, FavoriteDirector } from "../useProfileData";

interface TasteCardProps {
  data: ProfileData | null;
  isEditing: boolean;
  /** Called when the user taps a tile to set/change a favorite. */
  onPick: (slot: FavoriteSlot) => void;
}

export type FavoriteSlot = "movie" | "series" | "director" | "genre";

interface TileDef {
  slot: FavoriteSlot;
  label: string;
  icon: string;
}

const TILES: TileDef[] = [
  { slot: "movie", label: "Favorite Movie", icon: "movie" },
  { slot: "series", label: "Favorite Series", icon: "tv" },
  { slot: "director", label: "Favorite Director", icon: "person" },
  { slot: "genre", label: "Favorite Genre", icon: "palette" },
];

/**
 * TasteCard — the signature section of the Profile.
 *
 * Four tiles in a 2×2 grid, composed as a single premium object (one
 * border, one shadow, hairline dividers between tiles). Each tile
 * answers one question about the user's taste:
 *
 *   • Favorite Movie   — what film defines you?
 *   • Favorite Series  — what show?
 *   • Favorite Director — whose work do you follow?
 *   • Favorite Genre   — what mood do you live in?
 *
 * Empty tiles show a dashed-border "+" CTA. In edit mode, filled tiles
 * show a "Swap" overlay on hover.
 */
const TasteCard: Component<TasteCardProps> = (props) => {
  return (
    <div class="taste-card">
      <For each={TILES}>
        {(tile) => (
          <TasteTile
            tile={tile}
            data={props.data}
            isEditing={props.isEditing}
            onPick={() => props.onPick(tile.slot)}
          />
        )}
      </For>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Single tile
// ---------------------------------------------------------------------------

interface TasteTileProps {
  tile: TileDef;
  data: ProfileData | null;
  isEditing: boolean;
  onPick: () => void;
}

const TasteTile: Component<TasteTileProps> = (props) => {
  const [imgLoaded, setImgLoaded] = createSignal(false);

  // Resolve the content for this tile from the profile data.
  const content = (): { title: string; subtitle?: string; imagePath: string | null } | null => {
    const d = props.data;
    if (!d?.profile) return null;

    switch (props.tile.slot) {
      case "movie": {
        const id = d.profile.favorite_movie_id;
        if (!id || !d.favoriteMovie) return null;
        const m = d.favoriteMovie;
        return {
          title: m.title ?? m.name ?? "Untitled",
          subtitle: (m.release_date ?? "").split("-")[0] || undefined,
          imagePath: m.poster_path ?? m.backdrop_path ?? null,
        };
      }
      case "series": {
        const id = d.profile.favorite_series_id;
        if (!id || !d.favoriteSeries) return null;
        const s = d.favoriteSeries;
        return {
          title: s.name ?? s.title ?? "Untitled",
          subtitle: (s.first_air_date ?? "").split("-")[0] || undefined,
          imagePath: s.poster_path ?? s.backdrop_path ?? null,
        };
      }
      case "director": {
        const id = d.profile.favorite_director_id;
        if (!id || !d.favoriteDirector) return null;
        const dir: FavoriteDirector = d.favoriteDirector;
        return {
          title: dir.name,
          subtitle: "Director",
          imagePath: dir.profile_path,
        };
      }
      case "genre": {
        const g = d.profile.favorite_genre;
        if (!g) return null;
        return { title: g, imagePath: null };
      }
      default:
        return null;
    }
  };

  const hasContent = () => content() !== null;

  return (
    <div
      class={`taste-tile focus-ring${hasContent() ? " taste-tile-filled" : ""}`}
      role="button"
      tabindex={0}
      onClick={() => props.onPick()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onPick();
        }
      }}
      aria-label={
        hasContent()
          ? `${props.tile.label}: ${content()!.title}. Tap to ${props.isEditing ? "change" : "view"}.`
          : `Set your ${props.tile.label.toLowerCase()}. Tap to choose.`
      }
    >
      <Show when={hasContent()} fallback={
        /* Empty tile — dashed "+" CTA */
        <div class="taste-tile-empty">
          <div class="taste-tile-empty-icon" aria-hidden="true">
            <span class="material-symbols-outlined" style={{ "font-size": "20px" }} aria-hidden="true">
              {props.tile.icon}
            </span>
          </div>
          <p class="taste-tile-empty-label">{props.tile.label}</p>
          <p class="taste-tile-empty-cta">Tap to set</p>
        </div>
      }>
        <Show when={props.tile.slot === "genre"} fallback={
          /* Poster tile — movie, series, director */
          <>
            <Show when={content()!.imagePath}>
              <img
                src={tmdbImage(content()!.imagePath, "w342")}
                class={`taste-tile-poster${imgLoaded() ? " img-loaded" : ""}`}
                loading="lazy"
                decoding="async"
                alt=""
                aria-hidden="true"
                onLoad={() => setImgLoaded(true)}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </Show>
            <div class="taste-tile-overlay" aria-hidden="true" />
            <div class="taste-tile-content">
              <p class="taste-tile-label">{props.tile.label}</p>
              <p class="taste-tile-title">{content()!.title}</p>
              <Show when={content()!.subtitle}>
                <p class="taste-tile-subtitle">{content()!.subtitle}</p>
              </Show>
            </div>
          </>
        }>
          {/* Genre tile — text-only with accent */}
          <div class="taste-tile-genre">
            <p class="taste-tile-genre-name">{content()!.title}</p>
            <p class="taste-tile-genre-label">{props.tile.label}</p>
          </div>
        </Show>

        {/* Edit-mode swap overlay */}
        <Show when={props.isEditing}>
          <div class="taste-tile-swap" aria-hidden="true">
            <span class="taste-tile-swap-icon">
              <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
                swap_horiz
              </span>
              Swap
            </span>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default TasteCard;
