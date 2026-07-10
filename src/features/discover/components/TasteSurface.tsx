// src/features/discover/components/TasteSurface.tsx
import { For, Show, Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TasteSurface as TasteSurfaceType, TMDBTitle, WatchlistItem } from "~/shared/types";
import RelationshipPill from "./RelationshipPill";

interface TasteSurfaceProps {
  surface: TasteSurfaceType;
  vault: WatchlistItem[];
  onOpenTitle: (title: TMDBTitle) => void;
  onAddToVault: (title: TMDBTitle) => void;
}

/**
 * TasteSurface — a vault-derived shelf in Fold 2.
 *
 * Each surface is framed as "Because you…" — the intent sentence is the
 * hook. The shelf is a horizontal rail of posters (scroll-snap), using
 * the same visual rhythm as the Vault's VaultShelf.
 *
 * The shelf inherits the accent-bar label pattern from the Dashboard /
 * Details section system, so Discover feels of-a-piece with the rest
 * of the app.
 *
 * The RelationshipPill on every card makes the shelf feel *aware* of
 * the user's vault — even though these titles are NOT in the vault,
 * the pill shows the relationship ("Add" by default, but if a title
 * IS in the vault, it shows the status).
 */
const TasteSurface: Component<TasteSurfaceProps> = (props) => {
  const titleOf = (t: TMDBTitle) => t.title || t.name || "Untitled";
  const yearOf = (t: TMDBTitle) =>
    (t.release_date || t.first_air_date || "").split("-")[0] || "";
  const imdbOf = (t: TMDBTitle) =>
    t.vote_average ? t.vote_average.toFixed(1) : null;

  return (
    <section class="taste-surface animate-fade-up" aria-label={props.surface.intent}>
      {/* Header — accent-bar label pattern (inherited from DashboardSection) */}
      <div class="taste-surface-header">
        <div class="taste-surface-title-cluster">
          <h3 class="taste-surface-title">
            <span class="material-symbols-outlined taste-surface-icon" aria-hidden="true">
              {props.surface.icon}
            </span>
            {props.surface.intent}
          </h3>
          <span class="taste-surface-subtitle">{props.surface.subtitle}</span>
        </div>
      </div>

      {/* Horizontal rail — scroll-snap, like VaultShelf */}
      <div class="taste-surface-rail" role="list">
        <For each={props.surface.items}>
          {(t) => (
            <button
              type="button"
              class="taste-surface-card"
              role="listitem"
              onClick={() => props.onOpenTitle(t)}
              aria-label={`${titleOf(t)}${yearOf(t) ? `, ${yearOf(t)}` : ""} — open details`}
            >
              {/* Poster */}
              <div class="taste-surface-poster">
                <Show
                  when={t.poster_path || t.backdrop_path}
                  fallback={
                    <div class="taste-surface-poster-fallback" aria-hidden="true">
                      <span class="material-symbols-outlined" style="font-size: 28px; color: var(--text-dim)">movie</span>
                    </div>
                  }
                >
                  <img
                    src={tmdbImage(t.poster_path || t.backdrop_path, "w342")}
                    class="taste-surface-poster-img"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                  />
                </Show>

                {/* Relationship pill — top-right */}
                <div class="taste-surface-pill">
                  <RelationshipPill item={t} vault={props.vault} compact />
                </div>
              </div>

              {/* Info — title + meta */}
              <div class="taste-surface-info">
                <p class="taste-surface-card-title">{titleOf(t)}</p>
                <p class="taste-surface-card-meta">
                  {yearOf(t) ? `${yearOf(t)} · ` : ""}
                  {t.media_type === "tv" ? "Series" : "Movie"}
                  <Show when={imdbOf(t)}>
                    {" · "}<span style="color: #f5c518">★ {imdbOf(t)}</span>
                  </Show>
                </p>
              </div>
            </button>
          )}
        </For>
      </div>
    </section>
  );
};

export default TasteSurface;
