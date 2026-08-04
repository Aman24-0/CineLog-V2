// src/features/collections/components/AddTitlesModal.tsx
import { Show, For, createMemo, createSignal, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "../hooks/useCollections";
import { useCollectionSearch } from "../hooks/useCollectionSearch";
import { useToast } from "~/shared/hooks/useToast";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { GlassEmptyState } from "~/shared/ui/glass";
import type {
  Collection,
  CollectionEntry,
  WatchlistItem
} from "~/shared/types";

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
    limit: 60
  });

  // Track which keys are currently being added (for the per-row spinner).
  const [addingKeys, setAddingKeys] = createSignal<Set<string>>(new Set());

  // Phase 6.2 Task 2a — multi-select for bulk add.
  // selectedKeys holds the set of result rows the user has checked.
  // Bulk add iterates this set and calls addToCollection for each.
  const [selectedKeys, setSelectedKeys] = createSignal<Set<string>>(
    new Set()
  );
  const [isBulkAdding, setIsBulkAdding] = createSignal(false);

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set<string>(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    const all = new Set<string>();
    for (const r of search.results()) {
      if (!r.alreadyInCollection) all.add(r.key);
    }
    setSelectedKeys(all);
  };

  const deselectAll = () => setSelectedKeys(new Set<string>());

  const handleAdd = async (key: string, item: WatchlistItem) => {
    if (existingKeys().has(key)) return; // already in collection
    setAddingKeys((prev) => new Set<string>(prev).add(key));

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
        orderIndex: (props.collection.entries ?? []).length
      };
      await addToCollection(props.collection.id, entry);
      // After a successful add, remove the key from the selected set
      // (the row will now show "Added" so it's no longer selectable).
      setSelectedKeys((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set<string>(prev);
        next.delete(key);
        return next;
      });
    } catch (err) {
      console.error("[AddTitlesModal] Failed to add:", err);
      showToast("Failed to add title.", "error");
    } finally {
      setAddingKeys((prev) => {
        const next = new Set<string>(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // Bulk add — iterates the selected keys, resolves each back to its
  // WatchlistItem from the search results, and calls handleAdd for each.
  // Sequential to preserve the optimistic-update pattern in addToCollection
  // (each call updates the local entries signal immediately).
  const handleBulkAdd = async () => {
    const selected = selectedKeys();
    if (selected.size === 0) return;
    // Build a key → item map from the current search results so we can
    // resolve each selected key to its WatchlistItem.
    const resultMap = new Map<string, WatchlistItem>();
    for (const r of search.results()) {
      resultMap.set(r.key, r.item);
    }
    const toAdd: { key: string; item: WatchlistItem }[] = [];
    for (const key of selected) {
      const item = resultMap.get(key);
      if (item) toAdd.push({ key, item });
    }
    if (toAdd.length === 0) return;
    setIsBulkAdding(true);
    let success = 0;
    let fail = 0;
    for (const { key, item } of toAdd) {
      try {
        await handleAdd(key, item);
        success++;
      } catch {
        fail++;
      }
    }
    setIsBulkAdding(false);
    if (success > 0) {
      showToast(
        `Added ${success} title${success === 1 ? "" : "s"} to ${props.collection.name}.`,
        "success"
      );
    }
    if (fail > 0) {
      showToast(
        `Failed to add ${fail} title${fail === 1 ? "" : "s"}.`,
        "error"
      );
    }
    // Clear selection after bulk add (successful adds have already been
    // removed from the set inside handleAdd; this clears any that failed).
    deselectAll();
  };

  return (
    <Portal>
      <div
        class="add-titles-modal-overlay"
        onClick={() => props.onClose()}
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
              onClick={() => props.onClose()}
              aria-label="Close"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </div>

          {/* Search input */}
          <div class="add-titles-modal-search">
            <span class="material-symbols-outlined" aria-hidden="true">
              search
            </span>
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
                <span class="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
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
                {(result) => {
                  const isSelected = () =>
                    selectedKeys().has(result.key);
                  return (
                    <div class="add-titles-result">
                      {/* Phase 6.2 Task 2a — checkbox for multi-select.
                          Only renders for results NOT already in the
                          collection (already-added rows show "Added"
                          and can't be re-added). */}
                      <Show when={!result.alreadyInCollection}>
                        <button
                          type="button"
                          class="add-titles-result-select focus-ring"
                          aria-label={
                            isSelected()
                              ? `Deselect ${result.item.title || result.item.name}`
                              : `Select ${result.item.title || result.item.name}`
                          }
                          aria-pressed={isSelected()}
                          onClick={() => toggleSelect(result.key)}
                          style={{
                            display: "flex",
                            "align-items": "center",
                            "justify-content": "center",
                            width: "28px",
                            height: "28px",
                            "border-radius": "9999px",
                            border: `2px solid ${isSelected() ? "var(--p)" : "var(--hairline-2)"}`,
                            background: isSelected() ? "var(--p)" : "transparent",
                            color: "var(--active-text)",
                            cursor: "pointer",
                            "flex-shrink": "0"
                          }}
                        >
                          <Show when={isSelected()}>
                            <span
                              class="material-symbols-outlined"
                              aria-hidden="true"
                              style={{ "font-size": "16px" }}
                            >
                              check
                            </span>
                          </Show>
                        </button>
                      </Show>

                      {/* Poster thumbnail (40×60) */}
                      <Show
                        when={result.item.poster_path}
                        fallback={
                          <div
                            class="add-titles-result-poster-fallback"
                            aria-hidden="true"
                          >
                            <span
                              class="material-symbols-outlined"
                              aria-hidden="true"
                            >
                              movie
                            </span>
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
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </Show>

                      {/* Title + year */}
                      <div class="add-titles-result-info">
                        <p class="add-titles-result-title">
                          {result.item.title || result.item.name || "Untitled"}
                        </p>
                        <p class="add-titles-result-meta">
                          <span>
                            {result.item.media_type === "tv" ? "Series" : "Movie"}
                          </span>
                          <Show
                            when={(
                              result.item.release_date ||
                              result.item.first_air_date ||
                              ""
                            ).slice(0, 4)}
                          >
                            <span>
                              {" "}
                              ·{" "}
                              {(
                                result.item.release_date ||
                                result.item.first_air_date ||
                                ""
                              ).slice(0, 4)}
                            </span>
                          </Show>
                        </p>
                      </div>

                      {/* Add button — single-row add (still available
                          alongside the bulk-add footer button). */}
                      <Show
                        when={!result.alreadyInCollection}
                        fallback={
                          <span
                            class="add-titles-result-added"
                            aria-label="Already in collection"
                          >
                            <span
                              class="material-symbols-outlined"
                              aria-hidden="true"
                            >
                              check
                            </span>
                            Added
                          </span>
                        }
                      >
                        <button
                          type="button"
                          class="add-titles-result-add-btn focus-ring"
                          onClick={() => handleAdd(result.key, result.item)}
                          disabled={addingKeys().has(result.key) || isBulkAdding()}
                          aria-label={`Add ${result.item.title || result.item.name} to ${props.collection.name}`}
                        >
                          <Show
                            when={!addingKeys().has(result.key)}
                            fallback={
                              <span
                                class="material-symbols-outlined add-titles-result-add-spinner"
                                aria-hidden="true"
                              >
                                progress_activity
                              </span>
                            }
                          >
                            <span
                              class="material-symbols-outlined"
                              aria-hidden="true"
                            >
                              add
                            </span>
                          </Show>
                          <span>Add</span>
                        </button>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>

          {/* Phase 6.2 Task 2a — bulk-add action bar.
              Shows: select all / deselect all, selected count, and a
              bulk "Add N" button. Hidden when no results are shown. */}
          <Show when={search.results().length > 0}>
            <div
              class="add-titles-modal-bulk-bar"
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--sp-2)",
                padding: "var(--sp-2) var(--sp-4)",
                "border-top": "1px solid var(--hairline)",
                "background": "var(--glass-bg-strong)"
              }}
            >
              <button
                type="button"
                class="collection-action-bar-btn focus-ring"
                onClick={() =>
                  selectedKeys().size > 0 ? deselectAll() : selectAllVisible()
                }
                disabled={isBulkAdding()}
                aria-label={
                  selectedKeys().size > 0 ? "Deselect all" : "Select all results"
                }
                style={{
                  "font-size": "0.6875rem",
                  opacity: isBulkAdding() ? "0.5" : "1"
                }}
              >
                <span class="material-symbols-outlined" aria-hidden="true" style={{ "font-size": "16px" }}>
                  {selectedKeys().size > 0 ? "deselect" : "select_all"}
                </span>
                <span class="collection-action-bar-btn-label">
                  {selectedKeys().size > 0 ? "Deselect all" : "Select all"}
                </span>
              </button>
              <span
                class="type-meta"
                style={{
                  "font-size": "0.75rem",
                  color: "var(--text-soft)",
                  "white-space": "nowrap"
                }}
                aria-live="polite"
              >
                {selectedKeys().size} selected
              </span>
              <div style={{ flex: "1" }} />
              <button
                type="button"
                class="btn-primary focus-ring"
                onClick={() => void handleBulkAdd()}
                disabled={selectedKeys().size === 0 || isBulkAdding()}
                aria-label={`Add ${selectedKeys().size} selected titles to ${props.collection.name}`}
                style={{
                  "font-size": "0.6875rem",
                  opacity:
                    selectedKeys().size === 0 || isBulkAdding() ? "0.5" : "1"
                }}
              >
                <Show
                  when={!isBulkAdding()}
                  fallback={
                    <span
                      class="material-symbols-outlined"
                      aria-hidden="true"
                      style={{
                        "font-size": "16px",
                        animation: "cinelog-spin 0.9s linear infinite"
                      }}
                    >
                      progress_activity
                    </span>
                  }
                >
                  <span class="material-symbols-outlined" aria-hidden="true" style={{ "font-size": "16px" }}>
                    playlist_add
                  </span>
                </Show>
                <span>
                  {isBulkAdding()
                    ? "Adding..."
                    : `Add ${selectedKeys().size || ""}`}
                </span>
              </button>
            </div>
          </Show>

          {/* Footer */}
          <div class="add-titles-modal-footer">
            <button
              type="button"
              class="btn-primary focus-ring"
              onClick={() => props.onClose()}
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
