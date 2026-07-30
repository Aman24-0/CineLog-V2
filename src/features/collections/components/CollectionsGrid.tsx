// src/features/collections/components/CollectionsGrid.tsx
import { For, Show, type Accessor } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { Collection, CollectionEntry } from "~/shared/types";

/**
 * CollectionsGrid — the user's personal folder grid.
 *
 * v5 — clean tiles per spec:
 *   • Cards are CLICK-ONLY navigation tiles. No inline action buttons
 *     (no edit pencil, no archive shortcut, no unsubscribe). All
 *     folder/universe management happens inside the detail page via
 *     the action bar + hero pencil.
 *   • No status / SMART / CUSTOM / FAVORITE badges. The card shows
 *     only: poster collage (or backdrop), title (truncated with hover
 *     tooltip), item count ("2 Movies"), and last updated time.
 *
 * Posters use w92 size (cached by TMDB apiCache). No individual
 * fetches — all poster paths come from the collection's entries
 * which are already loaded.
 */

export interface CollectionsGridProps {
  loading: Accessor<boolean>;
  userCollections: Accessor<Collection[]>;
}

export default function CollectionsGrid(props: CollectionsGridProps) {
  const navigate = useNavigate();

  return (
    <Show
      when={!props.loading() && props.userCollections().length > 0}
      fallback={
        <Show
          when={!props.loading()}
          fallback={<div class="collections-folder-skeleton" />}
        >
          <div class="collections-empty-folders">
            <div class="collections-empty-icon" aria-hidden="true">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "40px", color: "var(--p)" }}
                aria-hidden="true"
              >
                create_new_folder
              </span>
            </div>
            <p class="collections-empty-title">No folders yet</p>
            <p class="collections-empty-desc">
              Create a folder to organize your titles.
            </p>
          </div>
        </Show>
      }
    >
      <div class="collections-folder-grid">
        <For each={props.userCollections()}>
          {(col) => (
            <CollectionCard
              col={col}
              onOpen={() => navigate(`/collections/${col.id}`)}
            />
          )}
        </For>
      </div>
    </Show>
  );
}

// ---------------------------------------------------------------------------
// CollectionCard — single clean folder tile (click-to-open only)
// ---------------------------------------------------------------------------

interface CollectionCardProps {
  col: Collection;
  onOpen: () => void;
}

function CollectionCard(props: CollectionCardProps) {
  const entries = (): CollectionEntry[] => props.col.entries ?? [];

  const movieCount = () =>
    entries().filter((e) => e.media_type === "movie").length;
  const seriesCount = () =>
    entries().filter((e) => e.media_type === "tv").length;
  const totalCount = () => entries().length;

  // Get up to 4 posters for the collage
  const posters = (): { path: string; title: string }[] => {
    return entries()
      .filter((e) => e.poster_path)
      .slice(0, 4)
      .map((e) => ({
        path: e.poster_path as string,
        title: e.title || e.name || "Untitled"
      }));
  };

  // Resolve the folder's custom backdrop (if set).
  // Priority: collection.backdrop_path → null.
  // Returns a ready-to-use URL (handles both full URLs and TMDB paths).
  const backdropUrl = (): string | null => {
    const p = props.col.backdrop_path;
    if (!p) return null;
    if (p.startsWith("http")) return p;
    return tmdbImage(p, "w500");
  };

  const hasBackdrop = () => backdropUrl() !== null;

  // Relative time (e.g. "2 days ago")
  const updatedText = (): string => {
    const updated = props.col.updatedAt;
    if (!updated) return "";
    try {
      const date = new Date(updated);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
      if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
      return `${Math.floor(diffDays / 365)}y ago`;
    } catch {
      return "";
    }
  };

  // Stats text
  const statsText = (): string => {
    const parts: string[] = [];
    if (movieCount() > 0)
      parts.push(`${movieCount()} ${movieCount() !== 1 ? "Movies" : "Movie"}`);
    if (seriesCount() > 0)
      parts.push(
        `${seriesCount()} ${seriesCount() !== 1 ? "Series" : "Series"}`
      );
    if (parts.length === 0 && totalCount() > 0)
      parts.push(`${totalCount()} Titles`);
    return parts.join(" · ");
  };

  // Accent color style
  const accentStyle = (): Record<string, string> => {
    const color = props.col.accentColor;
    if (!color) return {};
    return {
      "--card-accent": color,
      "--card-accent-glow": `${color}33`
    };
  };

  return (
    <div
      class={`collection-card${props.col.isFavorites ? " collection-card-favorites" : ""}${props.col.isSmart ? " collection-card-smart" : ""}`}
      style={accentStyle()}
      onClick={() => props.onOpen()}
      role="button"
      tabindex={0}
      aria-label={`${props.col.name}, ${statsText() || "empty collection"}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onOpen();
        }
      }}
    >
      {/* Poster collage area — OR full-bleed backdrop if set */}
      <div class="collection-card-collage-area">
        <Show when={hasBackdrop()}>
          <img
            src={backdropUrl() as string}
            class="collection-card-backdrop"
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div class="collection-card-backdrop-overlay" aria-hidden="true" />
        </Show>

        <Show
          when={!hasBackdrop() && posters().length > 0}
          fallback={
            <Show when={!hasBackdrop()}>
              <div class="collection-card-empty-art" aria-hidden="true">
                <Show
                  when={props.col.isFavorites}
                  fallback={
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "36px", color: "var(--text-dim)" }}
                      aria-hidden="true"
                    >
                      folder_open
                    </span>
                  }
                >
                  <span
                    class="material-symbols-outlined"
                    style={{
                      "font-size": "36px",
                      color: "#f5c518",
                      "font-variation-settings":
                        "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 40"
                    }}
                    aria-hidden="true"
                  >
                    favorite
                  </span>
                </Show>
                <Show when={totalCount() === 0}>
                  <span class="collection-card-empty-text">No titles yet</span>
                </Show>
              </div>
            </Show>
          }
        >
          <PosterCollage posters={posters()} />
        </Show>
      </div>

      {/* Info area */}
      <div class="collection-card-info">
        <div class="collection-card-name-row">
          <Show when={props.col.emoji}>
            <span class="collection-card-emoji">{props.col.emoji}</span>
          </Show>
          {/* title attribute provides a hover tooltip showing the full
              name — the CSS truncates with line-clamp-1, so without
              this the user couldn't read a long folder name. */}
          <p class="collection-card-name" title={props.col.name}>
            {props.col.name}
          </p>
        </div>

        <Show when={props.col.description}>
          <p class="collection-card-desc">{props.col.description}</p>
        </Show>

        <div class="collection-card-stats">
          <Show when={statsText()}>
            <span class="collection-card-stats-text">{statsText()}</span>
          </Show>
          <Show when={updatedText()}>
            <span class="collection-card-updated">{updatedText()}</span>
          </Show>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PosterCollage — adaptive poster display
// ---------------------------------------------------------------------------

function PosterCollage(props: { posters: { path: string; title: string }[] }) {
  const count = () => props.posters.length;

  return (
    <Show
      when={count() === 1}
      fallback={
        <Show
          when={count() === 2}
          fallback={
            <Show
              when={count() === 3}
              fallback={
                // 4+ posters → 2×2 grid
                <div class="collage-grid-4">
                  <For each={props.posters.slice(0, 4)}>
                    {(p) => (
                      <img
                        src={tmdbImage(p.path, "w92")}
                        class="collage-img"
                        loading="lazy"
                        decoding="async"
                        alt=""
                        aria-hidden="true"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </For>
                </div>
              }
            >
              {/* 3 posters → fan layout */}
              <div class="collage-fan-3">
                <For each={props.posters.slice(0, 3)}>
                  {(p) => (
                    <img
                      src={tmdbImage(p.path, "w92")}
                      class="collage-img"
                      loading="lazy"
                      decoding="async"
                      alt=""
                      aria-hidden="true"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                </For>
              </div>
            </Show>
          }
        >
          {/* 2 posters → side-by-side */}
          <div class="collage-grid-2">
            <For each={props.posters.slice(0, 2)}>
              {(p) => (
                <img
                  src={tmdbImage(p.path, "w92")}
                  class="collage-img"
                  loading="lazy"
                  decoding="async"
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
            </For>
          </div>
        </Show>
      }
    >
      {/* 1 poster → full display */}
      <div class="collage-single">
        <img
          src={tmdbImage(props.posters[0].path, "w185")}
          class="collage-img"
          loading="lazy"
          decoding="async"
          alt=""
          aria-hidden="true"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>
    </Show>
  );
}
