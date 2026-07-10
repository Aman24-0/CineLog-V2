// src/features/collections/components/CollectionsGrid.tsx
import { For, Show, type Accessor } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { Collection } from "~/shared/types";

/**
 * CollectionsGrid — the user's personal folder grid.
 *
 * Renders a 3-column collage of folder cards. Each card shows a 3-poster
 * collage preview (or a folder icon for empty folders), the folder name
 * + emoji + accent color dot, and a context-menu-trigger edit button.
 *
 * Empty state: "No folders yet. Create one to organize your titles."
 */
export interface CollectionsGridProps {
  loading: Accessor<boolean>;
  userCollections: Accessor<Collection[]>;
  onEditFolder: (col: Collection) => void;
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
            <p
              class="type-body-soft"
              style={{ "text-align": "center", "max-width": "260px" }}
            >
              No folders yet. Create one to organize your titles.
            </p>
          </div>
        </Show>
      }
    >
      <div class="collections-folder-grid">
        <For each={props.userCollections()}>
          {(col) => (
            <button
              type="button"
              class={`collections-folder-card${
                col.isFavorites ? " collections-folder-favorites" : ""
              }`}
              onClick={() => navigate(`/collections/${col.id}`)}
              onContextMenu={(e) => {
                e.preventDefault();
                props.onEditFolder(col);
              }}
              aria-label={`Open ${col.name}`}
            >
              {/* Poster collage preview */}
              <Show
                when={(col.entries ?? []).length > 0}
                fallback={
                  <div class="collections-folder-icon">
                    <Show
                      when={col.isFavorites}
                      fallback={
                        <span
                          class="material-symbols-outlined"
                          style={{"font-size":"28px","color":"var(--text-soft)"}}
                          aria-hidden="true"
                        >
                          folder
                        </span>
                      }
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{"font-size":"28px","color":"#f5c518","font-variation-settings":"'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"}}
                        aria-hidden="true"
                      >
                        favorite
                      </span>
                    </Show>
                  </div>
                }
              >
                <div class="collections-folder-collage">
                  <For each={(col.entries ?? []).slice(0, 3)}>
                    {(entry) => (
                      <Show when={entry.poster_path}>
                        <img
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                          src={tmdbImage(entry.poster_path, "w92")}
                          class="collections-folder-collage-img"
                          loading="lazy"
                          decoding="async"
                          alt=""
                          aria-hidden="true"
                        />
                      </Show>
                    )}
                  </For>
                </div>
              </Show>
              <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
                <Show when={col.emoji}>
                  <span style={{ "font-size": "0.875rem" }}>{col.emoji}</span>
                </Show>
                <p class="collections-folder-name">{col.name}</p>
              </div>
              <p class="collections-folder-count">
                {col.isSmart
                  ? "Smart"
                  : `${(col.entries ?? []).length} title${
                      (col.entries ?? []).length !== 1 ? "s" : ""
                    }`}
              </p>
              <Show when={col.accentColor}>
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    "border-radius": "50%",
                    background: col.accentColor,
                    "margin-left": "4px",
                  }}
                  aria-hidden="true"
                />
              </Show>
              {/* Edit button */}
              <button
                type="button"
                class="timeline-edit-action"
                style={{ "margin-left": "auto", "margin-top": "-4px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onEditFolder(col);
                }}
                aria-label={`Edit ${col.name}`}
              >
                <span
                  class="material-symbols-outlined"
                  style={{"font-size":"14px"}}
                  aria-hidden="true"
                >
                  more_vert
                </span>
              </button>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
