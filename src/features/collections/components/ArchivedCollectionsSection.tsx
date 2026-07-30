// src/features/collections/components/ArchivedCollectionsSection.tsx
import { For, Show, type Accessor, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { Collection } from "~/shared/types";

/**
 * ArchivedCollectionsSection — renders the user's archived collections
 * in a separate dimmed grid. Only shown when the "Show Archived" toggle
 * on the Collections page is active.
 *
 * Each card is dimmed (`.is-archived` CSS class), shows an "Archived"
 * overlay badge, and exposes ONLY an "Unarchive" button — no edit,
 * no delete. Clicking the card body still opens the collection detail
 * page (read-only viewing is allowed).
 *
 * Unarchive → calls `onUnarchive(col.id)` which sets `archived_at = NULL`.
 */
export interface ArchivedCollectionsSectionProps {
  collections: Accessor<Collection[]>;
  onUnarchive: (collectionId: string) => void | Promise<void>;
}

const ArchivedCollectionsSection: Component<ArchivedCollectionsSectionProps> = (
  props
) => {
  const navigate = useNavigate();

  return (
    <Show when={props.collections().length > 0}>
      <section class="archived-collections-section">
        <div class="archived-collections-label">
          <span class="material-symbols-outlined" aria-hidden="true">
            archive
          </span>
          Archived · {props.collections().length}
        </div>

        <div class="collections-folder-grid">
          <For each={props.collections()}>
            {(col) => (
              <ArchivedCard
                col={col}
                onOpen={() => navigate(`/collections/${col.id}`)}
                onUnarchive={() => props.onUnarchive(col.id)}
              />
            )}
          </For>
        </div>
      </section>
    </Show>
  );
};

interface ArchivedCardProps {
  col: Collection;
  onOpen: () => void;
  onUnarchive: () => void | Promise<void>;
}

function ArchivedCard(props: ArchivedCardProps) {
  const poster = () => {
    const entries = props.col.entries ?? [];
    const withPoster = entries.find((e) => e.poster_path);
    return (
      withPoster?.poster_path ??
      props.col.poster_path ??
      props.col.backdrop_path ??
      null
    );
  };

  return (
    <div
      class="collection-card is-archived"
      onClick={() => props.onOpen()}
      role="button"
      tabindex={0}
      aria-label={`${props.col.name} (archived)`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onOpen();
        }
      }}
    >
      <div class="collection-card-collage-area">
        <Show
          when={poster()}
          fallback={
            <div class="collection-card-empty-art" aria-hidden="true">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "36px", color: "var(--text-dim)" }}
                aria-hidden="true"
              >
                folder_open
              </span>
            </div>
          }
        >
          <img
            src={tmdbImage(poster()!, "w500")}
            class="collage-img"
            style={{ width: "100%", height: "100%", "object-fit": "cover" }}
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </Show>

        <span class="collection-card-archived-badge">
          <span class="material-symbols-outlined" aria-hidden="true">
            archive
          </span>
          Archived
        </span>
      </div>

      <div class="collection-card-info">
        <p class="collection-card-name">{props.col.name}</p>
        <div class="collection-card-stats">
          <span class="collection-card-stats-text">
            {(props.col.entries ?? []).length}{" "}
            {(props.col.entries ?? []).length !== 1 ? "titles" : "title"}
          </span>
        </div>
      </div>

      <button
        type="button"
        class="collection-card-unarchive-btn focus-ring"
        onClick={(e) => {
          e.stopPropagation();
          void props.onUnarchive();
        }}
        aria-label={`Unarchive ${props.col.name}`}
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          unarchive
        </span>
        Unarchive
      </button>
    </div>
  );
}

export default ArchivedCollectionsSection;
