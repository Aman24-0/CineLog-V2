// src/features/collections/components/AddTitlesModal.tsx
import { Show, For, createMemo, createSignal, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "../hooks/useCollections";
import { useCollectionSearch } from "../hooks/useCollectionSearch";
import { useToast } from "~/shared/hooks/useToast";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { GlassEmptyState } from "~/shared/ui/glass";
import type { Collection, CollectionEntry, WatchlistItem } from "~/shared/types";

/**
 * AddTitlesModal — adds titles from the user's watchlist (vault) to
 * a collection.
 *
 * Per spec:
 *   - Search ONLY searches the user's watchlist (vault). No direct
 *     TMDB search — every collection entry must be backed by a vault
 *     item, so the user must have added it to their watchlist first.
 *   - Each result shows poster thumbnail, title, year, and an
 *     [ + Add ] button.
 *   - NO "Custom Entry" button anywhere. Custom entries were removed
 *     from the entire codebase (the old UniverseEditPage that allowed
 *     them has been deleted).
 *   - For SUBSCRIBED UNIVERSES this modal is NOT accessible — the
 *     parent CollectionActionBar hides the Add Titles button for
 *     universes. This component is user-collection-only by contract.
 *
 * Adding a vault item to the collection:
 *   - Builds a CollectionEntry from the WatchlistItem (id, media_type,
 *     title, poster, dates).
 *   - Calls `useCollections.addToCollection` which optimistically
 *     appends to the local signal and persists via
 *     `addEntryToCollectionByTmdbId` (resolves vault UUID, then inserts
 *     a `collection_entries` row).
 */
export interface AddTitlesModalProps {
  collection: Collection;
  onClose: () => void;
}

const AddTitlesModal: Component<AddTitlesModalProps> = (props) => {
  const { watchlist } = useVault();
  const { addToCollection } = useCollections();
  const { showToast } = useToast();

  // Build the existing-keys set so we can mark already-added titles.
  const existingKeys = createMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const e of props.collection.entries ?? []) {
      set.add(`${e.media_type}:${e.id}`);
    }
    return set;
  });

  const search = useCollectionSearch({
    vault: watchlist,
    existingKeys,
    limit: 60,
  });

  // Track which keys are currently being added (for the per-row spinner).
  const [addingKeys, setAddingKeys] = createSignal<Set<string>>(new Set());

  const handleAdd = async (key: string, item: WatchlistItem) => {
    if (existingKeys().has(key)) return; // already in collection
    setAddingKeys((prev) => new Set(prev).add(key));

    try {
      const entry: CollectionEntry = {
        id: String(item.id),
        media_type: item.media_type,
        title: item.title,
        name: item.name,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        release_date: item.release_date,
        first_air_date: item.first_air_date,
        // orderIndex will be stamped by the parent on next render —
        // the entries array determines it implicitly.
        orderIndex: (props.collection.entries ?? []).length,
      };
      await addToCollection(props.collection.id, entry);
    } catch (err) {
      console.error("[AddTitlesModal] Failed to add:", err);
      showToast("Failed to add title.", "error");
    } finally {
      setAddingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <Portal>
      <div
        class="add-titles-modal-overlay"
        onClick={props.onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`Add titles to ${props.collection.name}`}
      >
        <div
          class="add-titles-modal-surface"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="add-titles-modal-header">
            <div class="add-titles-modal-header-text">
              <h3 class="add-titles-modal-title">Add Titles</h3>
              <p class="add-titles-modal-subtitle">
                From your watchlist → <span>{props.collection.name}</span>
              </p>
            </div>
            <button
              type="button"
              class="add-titles-modal-close focus-ring"
              onClick={props.onClose}
              aria-label="Close"
            >
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>

          {/* Search input */}
          <div class="add-titles-modal-search">
            <span class="material-symbols-outlined" aria-hidden="true">search</span>
            <input
              type="text"
              placeholder="Search your watchlist by title, cast, director, genre..."
              value={search.query()}
              onInput={(e) => search.setQuery(e.currentTarget.value)}
              aria-label="Search your watchlist"
              autofocus
            />
            <Show when={search.query().length > 0}>
              <button
                type="button"
                class="add-titles-modal-search-clear focus-ring"
                onClick={() => search.reset()}
                aria-label="Clear search"
              >
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </Show>
          </div>

          {/* Results */}
          <div class="add-titles-modal-results">
            <Show
              when={search.results().length > 0}
              fallback={
                <Show
                  when={search.query().length > 0}
                  fallback={
                    <GlassEmptyState
                      icon="video_library"
                      title="Your watchlist is empty"
                      message="Add movies or series to your watchlist first — collection entries come from the vault, not directly from TMDB."
                      variant="compact"
                    />
                  }
                >
                  <GlassEmptyState
                    icon="search_off"
                    title="No matches in your watchlist"
                    message="Try a different title, cast member, director, or genre."
                    variant="compact"
                  />
                </Show>
              }
            >
              <For each={search.results()}>
                {(result) => (
                  <div class="add-titles-result">
                    {/* Poster thumbnail (40×60) */}
                    <Show
                      when={result.item.poster_path}
                      fallback={
                        <div class="add-titles-result-poster-fallback" aria-hidden="true">
                          <span class="material-symbols-outlined" aria-hidden="true">movie</span>
                        </div>
                      }
                    >
                      <img
                        src={tmdbImage(result.item.poster_path!, "w92")}
                        class="add-titles-result-poster"
                        loading="lazy"
                        decoding="async"
                        alt=""
                        aria-hidden="true"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    </Show>

                    {/* Title + year */}
                    <div class="add-titles-result-info">
                      <p class="add-titles-result-title">
                        {result.item.title || result.item.name || "Untitled"}
                      </p>
                      <p class="add-titles-result-meta">
                        <span>{result.item.media_type === "tv" ? "Series" : "Movie"}</span>
                        <Show when={(result.item.release_date || result.item.first_air_date || "").slice(0, 4)}>
                          <span> · {(result.item.release_date || result.item.first_air_date || "").slice(0, 4)}</span>
                        </Show>
                      </p>
                    </div>

                    {/* Add button */}
                    <Show
                      when={!result.alreadyInCollection}
                      fallback={
                        <span class="add-titles-result-added" aria-label="Already in collection">
                          <span class="material-symbols-outlined" aria-hidden="true">check</span>
                          Added
                        </span>
                      }
                    >
                      <button
                        type="button"
                        class="add-titles-result-add-btn focus-ring"
                        onClick={() => handleAdd(result.key, result.item)}
                        disabled={addingKeys().has(result.key)}
                        aria-label={`Add ${result.item.title || result.item.name} to ${props.collection.name}`}
                      >
                        <Show
                          when={!addingKeys().has(result.key)}
                          fallback={
                            <span class="material-symbols-outlined add-titles-result-add-spinner" aria-hidden="true">
                              progress_activity
                            </span>
                          }
                        >
                          <span class="material-symbols-outlined" aria-hidden="true">add</span>
                        </Show>
                        <span>Add</span>
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </div>

          {/* Footer */}
          <div class="add-titles-modal-footer">
            <button
              type="button"
              class="btn-primary focus-ring"
              onClick={props.onClose}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default AddTitlesModal;
