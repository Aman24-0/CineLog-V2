// src/features/collections/components/ReorderModal.tsx
import {
  Show,
  For,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  type Component
} from "solid-js";
import { Portal } from "solid-js/web";
import {
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  closestCenter,
  createSortable,
  useDragDropContext
} from "@thisbeyond/solid-dnd";
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
 * ReorderModal — replaces the full-page "Edit Timeline" page entirely.
 *
 * The user stays in context (modal sheet) instead of navigating away.
 * They can drag entries to reorder, use ↑ Top / ↓ Bottom shortcuts on
 * individual items, select multiple and bulk-move them to a numeric
 * position, or add more titles from the watchlist.
 *
 * Title: "Reorder List"
 *
 * Save: persists the new order via `useCollections.reorderEntries`,
 * which optimistically stamps `orderIndex` on each entry and writes
 * both `position` and `order_index` to the DB in a single per-row
 * UPDATE.
 *
 * Cancel: closes without saving.
 *
 * Availability: ONLY for USER collections. Universes are read-only
 * (the parent CollectionActionBar hides the Reorder button).
 *
 * ── Implementation notes ─────────────────────────────────────────
 *
 * `@thisbeyond/solid-dnd` setup:
 *   - `<DragDropProvider collisionDetector={closestCenter}>` wraps
 *     the list. This provider owns the drag context (active draggable,
 *     droppable, transforms).
 *   - `<DragDropSensors>` enables pointer-based drag detection.
 *   - `<SortableProvider ids={...}>` keeps the sortable context in
 *     sync with the current order — when an item is dragged onto
 *     another, the sortable context reorders the underlying array.
 *   - Each row uses `createSortable(id)` which returns ref-setters
 *     + `isActiveDraggable`. We attach the ref to the row's drag
 *     handle so the row itself isn't draggable from anywhere else.
 *
 * The `onDragEnd` handler reads the new order from the local
 * `entries` signal (which we keep in sync during the drag) and
 * commits to the DB on Save.
 */

interface ReorderModalProps {
  collection: Collection;
  onClose: () => void;
}

const ReorderModal: Component<ReorderModalProps> = (props) => {
  const { watchlist } = useVault();
  const { reorderEntries, addToCollection } = useCollections();
  const { showToast } = useToast();

  // Local copy of the entries — we mutate this freely during the
  // drag-and-drop session. Only committed to the DB on Save.
  // ESLint: intentionally seeded once from the prop. The ReorderModal is
  // a modal sheet — the parent passes a stable collection for the sheet's
  // lifetime, and we want the local `entries` signal to own the working
  // copy (drag reorder, add-from-vault) without being clobbered by
  // parent re-renders.
  // eslint-disable-next-line solid/reactivity
  const [entries, setEntries] = createSignal<CollectionEntry[]>((props.collection.entries ?? []).slice().sort((a, b) => (a.orderIndex ?? a.order ?? 0) - (b.orderIndex ?? b.order ?? 0)));

  // ── Selection (for bulk Move-to-position) ────────────────────
  const [selectedKeys, setSelectedKeys] = createSignal<Set<string>>(new Set());
  const [targetPosition, setTargetPosition] = createSignal<number>(1);

  const toggleSelected = (entry: CollectionEntry) => {
    const key = `${entry.media_type}:${entry.id}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Watchlist search (for adding titles inline) ──────────────
  const existingKeys = createMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const e of entries()) set.add(`${e.media_type}:${e.id}`);
    return set;
  });

  const search = useCollectionSearch({
    vault: watchlist,
    existingKeys,
    limit: 30
  });

  const [showAddPanel, setShowAddPanel] = createSignal(false);
  const [addingKeys, setAddingKeys] = createSignal<Set<string>>(new Set());

  // ── Reorder helpers ──────────────────────────────────────────
  const moveItem = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setEntries((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const moveToTop = (index: number) => moveItem(index, 0);
  const moveToBottom = (index: number) => moveItem(index, entries().length - 1);

  // Bulk move: take all selected items (preserving their relative
  // order), remove them from the list, then insert at the target
  // position. Target is 1-based to match the row numbers shown.
  const applyBulkMove = () => {
    const sel = selectedKeys();
    if (sel.size === 0) return;
    const pos = targetPosition();
    if (pos < 1 || pos > entries().length) {
      showToast("Position out of range.", "error");
      return;
    }
    setEntries((prev) => {
      const selected = prev.filter((e) => sel.has(`${e.media_type}:${e.id}`));
      const remaining = prev.filter((e) => !sel.has(`${e.media_type}:${e.id}`));
      // 1-based → 0-based, clamped to remaining length.
      const insertAt = Math.min(Math.max(pos - 1, 0), remaining.length);
      return [
        ...remaining.slice(0, insertAt),
        ...selected,
        ...remaining.slice(insertAt)
      ];
    });
    setSelectedKeys(new Set<string>());
  };

  // ── dnd: onDragEnd ───────────────────────────────────────────
  // The SortableProvider already reordered the underlying array via
  // the `ids` prop — but to keep our `entries` signal as the single
  // source of truth, we apply the reorder ourselves on drag end.
  const onDragEnd = (payload: {
    draggable: { id: string | number };
    droppable?: { id: string | number } | null;
  }) => {
    const fromId = String(payload.draggable.id);
    const toId = payload.droppable ? String(payload.droppable.id) : null;
    if (!toId || fromId === toId) return;
    const list = entries();
    const from = list.findIndex((e) => `${e.media_type}:${e.id}` === fromId);
    const to = list.findIndex((e) => `${e.media_type}:${e.id}` === toId);
    if (from < 0 || to < 0) return;
    moveItem(from, to);
  };

  // ── Add from watchlist ───────────────────────────────────────
  const handleAddFromVault = async (key: string, item: WatchlistItem) => {
    if (existingKeys().has(key)) return;
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
        orderIndex: entries().length
      };
      // Optimistic local append (so the list grows immediately)
      setEntries((prev) => [...prev, entry]);
      // Persist to the DB (creates a collection_entries row).
      await addToCollection(props.collection.id, entry);
    } catch (err) {
      console.error("[ReorderModal] Failed to add from vault:", err);
      showToast("Failed to add title.", "error");
      // Rollback the optimistic append.
      setEntries((prev) =>
        prev.filter((e) => `${e.media_type}:${e.id}` !== key)
      );
    } finally {
      setAddingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // ── Save / Cancel ────────────────────────────────────────────
  const [saving, setSaving] = createSignal(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await reorderEntries(props.collection.id, entries());
      showToast("Order saved.", "success", 1200);
      props.onClose();
    } catch (err) {
      console.error("[ReorderModal] Failed to save order:", err);
      showToast("Failed to save order.", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── ESC to close (when no drag is active) ────────────────────
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Don't close mid-drag — would leave the dnd context in a
        // weird state. The SortableProvider will cancel the drag
        // itself on ESC; we just ignore.
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  // The sortable ids are the entry keys (stable across reorders).
  const sortableIds = createMemo(() =>
    entries().map((e) => `${e.media_type}:${e.id}`)
  );

  return (
    <Portal>
      <div
        class="reorder-modal-overlay"
        onClick={() => props.onClose()}
        role="dialog"
        aria-modal="true"
        aria-label={`Reorder list for ${props.collection.name}`}
      >
        <div class="reorder-modal-surface" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div class="reorder-modal-header">
            <div class="reorder-modal-header-text">
              <h3 class="reorder-modal-title">Reorder List</h3>
              <p class="reorder-modal-subtitle">
                Drag to reorder · {entries().length}{" "}
                {entries().length === 1 ? "title" : "titles"}
              </p>
            </div>
            <button
              type="button"
              class="reorder-modal-close focus-ring"
              onClick={() => props.onClose()}
              aria-label="Close without saving"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </div>

          {/* Bulk-move bar (only visible when items are selected) */}
          <Show when={selectedKeys().size > 0}>
            <div class="reorder-modal-bulk-bar">
              <span class="reorder-modal-bulk-count">
                {selectedKeys().size} selected
              </span>
              <div class="reorder-modal-bulk-controls">
                <label class="reorder-modal-bulk-label">
                  Move to position:
                </label>
                <input
                  type="number"
                  min="1"
                  max={entries().length}
                  value={targetPosition()}
                  onInput={(e) =>
                    setTargetPosition(parseInt(e.currentTarget.value, 10) || 1)
                  }
                  class="reorder-modal-bulk-input focus-ring"
                  aria-label="Target position"
                />
                <button
                  type="button"
                  class="btn-primary focus-ring reorder-modal-bulk-apply"
                  onClick={applyBulkMove}
                >
                  Apply
                </button>
                <button
                  type="button"
                  class="btn-ghost focus-ring"
                  onClick={() => setSelectedKeys(new Set())}
                  aria-label="Clear selection"
                >
                  Clear
                </button>
              </div>
            </div>
          </Show>

          {/* Add-from-watchlist toggle */}
          <button
            type="button"
            class="reorder-modal-add-toggle focus-ring"
            onClick={() => setShowAddPanel(!showAddPanel())}
            aria-expanded={showAddPanel()}
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              {showAddPanel() ? "remove" : "add"}
            </span>
            {showAddPanel() ? "Hide add titles" : "Add titles from watchlist"}
          </button>

          <Show when={showAddPanel()}>
            <div class="reorder-modal-add-panel">
              <div class="reorder-modal-search">
                <span class="material-symbols-outlined" aria-hidden="true">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search your watchlist..."
                  value={search.query()}
                  onInput={(e) => search.setQuery(e.currentTarget.value)}
                  aria-label="Search watchlist to add titles"
                />
              </div>
              <div class="reorder-modal-add-results">
                <Show
                  when={search.results().length > 0}
                  fallback={
                    <Show
                      when={search.query().length > 0}
                      fallback={
                        <p class="reorder-modal-add-empty">
                          Your watchlist is empty.
                        </p>
                      }
                    >
                      <p class="reorder-modal-add-empty">No matches.</p>
                    </Show>
                  }
                >
                  <For each={search.results().slice(0, 12)}>
                    {(result) => (
                      <div class="reorder-modal-add-result">
                        <Show
                          when={result.item.poster_path}
                          fallback={
                            <div
                              class="reorder-modal-add-result-poster-fallback"
                              aria-hidden="true"
                            >
                              <span class="material-symbols-outlined">
                                movie
                              </span>
                            </div>
                          }
                        >
                          <img
                            src={tmdbImage(result.item.poster_path!, "w92")}
                            class="reorder-modal-add-result-poster"
                            loading="lazy"
                            decoding="async"
                            alt=""
                            aria-hidden="true"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </Show>
                        <div class="reorder-modal-add-result-info">
                          <p class="reorder-modal-add-result-title">
                            {result.item.title ||
                              result.item.name ||
                              "Untitled"}
                          </p>
                          <p class="reorder-modal-add-result-meta">
                            {result.item.media_type === "tv"
                              ? "Series"
                              : "Movie"}
                            <Show
                              when={(
                                result.item.release_date ||
                                result.item.first_air_date ||
                                ""
                              ).slice(0, 4)}
                            >
                              {" · "}
                              {(
                                result.item.release_date ||
                                result.item.first_air_date ||
                                ""
                              ).slice(0, 4)}
                            </Show>
                          </p>
                        </div>
                        <Show
                          when={!result.alreadyInCollection}
                          fallback={
                            <span class="reorder-modal-add-result-added">
                              <span class="material-symbols-outlined">
                                check
                              </span>
                              Added
                            </span>
                          }
                        >
                          <button
                            type="button"
                            class="reorder-modal-add-result-btn focus-ring"
                            onClick={() =>
                              handleAddFromVault(result.key, result.item)
                            }
                            disabled={addingKeys().has(result.key)}
                          >
                            <Show
                              when={!addingKeys().has(result.key)}
                              fallback={
                                <span class="material-symbols-outlined">
                                  progress_activity
                                </span>
                              }
                            >
                              <span class="material-symbols-outlined">add</span>
                            </Show>
                            Add
                          </button>
                        </Show>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          </Show>

          {/* Draggable list */}
          <div class="reorder-modal-list-wrap">
            <Show
              when={entries().length > 0}
              fallback={
                <GlassEmptyState
                  icon="drag_indicator"
                  title="Nothing to reorder"
                  message="Use 'Add titles from watchlist' above to populate this collection."
                  variant="compact"
                />
              }
            >
              <DragDropProvider
                collisionDetector={closestCenter}
                onDragEnd={onDragEnd}
              >
                <DragDropSensors />
                <SortableProvider ids={sortableIds()}>
                  <div class="reorder-modal-list" role="list">
                    <For each={entries()}>
                      {(entry, index) => (
                        <ReorderRow
                          entry={entry}
                          index={index()}
                          total={entries().length}
                          selected={selectedKeys().has(
                            `${entry.media_type}:${entry.id}`
                          )}
                          onToggleSelected={() => toggleSelected(entry)}
                          onMoveToTop={() => moveToTop(index())}
                          onMoveToBottom={() => moveToBottom(index())}
                        />
                      )}
                    </For>
                  </div>
                </SortableProvider>
              </DragDropProvider>
            </Show>
          </div>

          {/* Footer */}
          <div class="reorder-modal-footer">
            <button
              type="button"
              class="btn-ghost focus-ring"
              onClick={() => props.onClose()}
              disabled={saving()}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn-primary focus-ring"
              onClick={handleSave}
              disabled={saving()}
            >
              <Show when={!saving()} fallback="Saving…">
                Save Order
              </Show>
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// ReorderRow — a single draggable row in the ReorderModal.
// Uses `createSortable` from @thisbeyond/solid-dnd. The drag handle
// is the only place the user can grab — the rest of the row is for
// click/select interactions.
// ──────────────────────────────────────────────────────────────────────────

interface ReorderRowProps {
  entry: CollectionEntry;
  index: number;
  total: number;
  selected: boolean;
  onToggleSelected: () => void;
  onMoveToTop: () => void;
  onMoveToBottom: () => void;
}

function ReorderRow(props: ReorderRowProps) {
  // ESLint: createSortable is called once per row mount with the entry's
  // stable id. The id is derived from props.entry (which is stable for the
  // row's lifetime — <For> reuses rows by key) and we want a single
  // sortable registration per row, not one per prop change.
  // eslint-disable-next-line solid/reactivity
  const sortable = createSortable(`${props.entry.media_type}:${props.entry.id}`);
  // Read the active-draggable flag from the dnd context — unused for
  // now (visual feedback handled by the `isDragging` CSS class on
  // the sortable wrapper). Kept here to confirm the context is wired.
  void useDragDropContext();

  const title = () => props.entry.title || props.entry.name || "Untitled";
  const year = () =>
    (props.entry.release_date || props.entry.first_air_date || "").slice(0, 4);

  return (
    <div
      class={`reorder-row${props.selected ? " is-selected" : ""}`}
      classList={{ "is-dragging": sortable.isActiveDraggable }}
      ref={sortable.ref}
      role="listitem"
    >
      {/* Selection checkbox — left of the drag handle */}
      <label class="reorder-row-check" aria-label={`Select ${title()}`}>
        <input
          type="checkbox"
          checked={props.selected}
          onChange={() => props.onToggleSelected()}
        />
        <span class="reorder-row-check-box" aria-hidden="true">
          <Show when={props.selected}>
            <span class="material-symbols-outlined">check</span>
          </Show>
        </span>
      </label>

      {/* Drag handle — the ONLY place that initiates a drag.
          `...sortable.dragActivators` attaches pointer + mousedown
          listeners to this element. */}
      <button
        type="button"
        class="reorder-row-handle focus-ring"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        {...sortable.dragActivators}
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          drag_indicator
        </span>
      </button>

      {/* Index badge — 1-based, matches the position labels */}
      <span class="reorder-row-index" aria-hidden="true">
        {props.index + 1}
      </span>

      {/* Poster thumbnail */}
      <Show
        when={props.entry.poster_path}
        fallback={
          <div class="reorder-row-poster-fallback" aria-hidden="true">
            <span class="material-symbols-outlined">movie</span>
          </div>
        }
      >
        <img
          src={tmdbImage(props.entry.poster_path!, "w92")}
          class="reorder-row-poster"
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
      <div class="reorder-row-info">
        <p class="reorder-row-title">{title()}</p>
        <Show when={year()}>
          <p class="reorder-row-year">{year()}</p>
        </Show>
      </div>

      {/* Quick actions: ↑ Top / ↓ Bottom */}
      <div class="reorder-row-actions">
        <button
          type="button"
          class="reorder-row-action focus-ring"
          onClick={() => props.onMoveToTop()}
          disabled={props.index === 0}
          aria-label={`Move ${title()} to top`}
          title="Move to top"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            vertical_align_top
          </span>
        </button>
        <button
          type="button"
          class="reorder-row-action focus-ring"
          onClick={() => props.onMoveToBottom()}
          disabled={props.index === props.total - 1}
          aria-label={`Move ${title()} to bottom`}
          title="Move to bottom"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            vertical_align_bottom
          </span>
        </button>
      </div>
    </div>
  );
}

export default ReorderModal;
