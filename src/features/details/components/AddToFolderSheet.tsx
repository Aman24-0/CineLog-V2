// src/features/details/components/AddToFolderSheet.tsx
import { For, Show, createSignal, createMemo, onMount, onCleanup, Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useCollections } from "~/features/collections/hooks/useCollections";
import type { WatchlistItem, CollectionEntry } from "~/shared/types";

interface AddToFolderSheetProps {
  item: WatchlistItem;
  onClose: () => void;
}

/**
 * AddToFolderSheet — a premium bottom sheet for managing which user
 * collections a title belongs to.
 *
 * Opens from the ActionDock's "Folder" button (vault titles only).
 * Shows the user's collections with toggle checkboxes. Tapping a
 * collection adds/removes the title instantly (optimistic UI via
 * the useCollections hook's Firestore listener).
 *
 * Also includes a "Create new collection" inline input at the bottom
 * so the user can create a folder and add the title in one flow.
 *
 * The sheet uses the same Portal + bottom-sheet pattern as VaultFilters:
 *   - Portal at document.body level (no stacking-context issues)
   - padding-bottom for safe-area + bottom nav
   - overscroll-contain on the scroll area
   - sticky footer with Close button
 */
const AddToFolderSheet: Component<AddToFolderSheetProps> = (props) => {
  const { userCollections, isInCollection, addToCollection, removeFromCollection, createCollection } = useCollections();
  const [showCreate, setShowCreate] = createSignal(false);
  const [newName, setNewName] = createSignal("");

  onMount(() => (document.body.style.overflow = "hidden"));
  onCleanup(() => (document.body.style.overflow = ""));

  const entry = createMemo<CollectionEntry>(() => ({
    id: String(props.item.id),
    media_type: props.item.media_type,
    title: props.item.title,
    name: props.item.name,
    poster_path: props.item.poster_path,
    backdrop_path: props.item.backdrop_path,
    release_date: props.item.release_date,
    first_air_date: props.item.first_air_date
  }));

  const handleToggle = (collectionId: string) => {
    const e = entry();
    if (isInCollection(collectionId, e.id, e.media_type)) {
      removeFromCollection(collectionId, e.id, e.media_type);
    } else {
      addToCollection(collectionId, e);
    }
  };

  const handleCreate = async () => {
    const name = newName().trim();
    if (!name) return;
    await createCollection(name);
    // The new collection will appear in userCollections() via the Firestore listener.
    // We need to wait a tick for it to show up, then add the title.
    setTimeout(() => {
      const newCol = userCollections().find((c) => c.name === name);
      if (newCol) {
        addToCollection(newCol.id, entry());
      }
    }, 500);
    setNewName("");
    setShowCreate(false);
  };

  return (
    <Portal>
      <div
        class="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 z-[999999] animate-fade-in"
        style={{
          background: "rgba(0,0,0,0.75)",
          "backdrop-filter": "blur(12px)",
          "-webkit-backdrop-filter": "blur(12px)",
          "padding-bottom": "var(--nav-total-height)"
        }}
        onClick={() => props.onClose()}
        role="dialog"
        aria-modal="true"
        aria-label="Add to folder"
      >
        <div
          class="folder-sheet w-full max-w-sm rounded-t-[2rem] sm:rounded-[2rem] flex flex-col modal-sheet-enter"
          style={{
            "max-height": "calc(100dvh - var(--nav-total-height) - env(safe-area-inset-top, 0px) - var(--sp-4))",
            "min-height": "0",
            background: "var(--glass-bg-strong)",
            "backdrop-filter": "blur(28px)",
            "-webkit-backdrop-filter": "blur(28px)",
            border: "1px solid var(--hairline-2)",
            "box-shadow": "var(--shadow-elevated)"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div
            class="w-12 h-1.5 rounded-full mx-auto mt-4 mb-2 sm:hidden flex-shrink-0"
            style={{"background":"var(--hairline-2)"}}
            aria-hidden="true"
          />

          {/* Header */}
          <div class="flex justify-between items-center px-6 pt-4 pb-4 flex-shrink-0" style={{"border-bottom":"1px solid var(--hairline)"}}>
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined" style={{"color":"var(--p)","font-size":"18px"}} aria-hidden="true">folder</span>
              <h3 class="type-headline text-white" style={{ "font-size": "1rem", margin: 0 }}>
                Add to Folder
              </h3>
            </div>
            <button
              onClick={() => props.onClose()}
              class="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-soft)", border: "1px solid var(--hairline)" }}
              aria-label="Close"
            >
              <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">close</span>
            </button>
          </div>

          {/* Scrollable list */}
          <div class="flex-1 overflow-y-auto hide-scrollbar px-6 py-4 space-y-2" style={{ "overscroll-behavior": "contain" }}>
            <Show when={userCollections().length > 0} fallback={
              <p class="type-body-soft" style={{ "text-align": "center", padding: "var(--sp-6)" }}>
                No folders yet. Create one below.
              </p>
            }>
              <For each={userCollections()}>
                {(col) => {
                  const e = entry();
                  const checked = () => isInCollection(col.id, e.id, e.media_type);
                  return (
                    <button
                      type="button"
                      class={`folder-sheet-item${checked() ? " folder-sheet-item-checked" : ""}`}
                      onClick={() => handleToggle(col.id)}
                      aria-label={`${checked() ? "Remove from" : "Add to"} ${col.name}`}
                      aria-pressed={checked()}
                    >
                      <div class="folder-sheet-item-icon">
                        <Show when={col.isFavorites} fallback={
                          <span class="material-symbols-outlined" style={{"font-size":"18px","color":"var(--text-soft)"}} aria-hidden="true">folder</span>
                        }>
                          <span class="material-symbols-outlined" style={{"font-size":"18px","color":"#f5c518","font-variation-settings":"'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"}} aria-hidden="true">favorite</span>
                        </Show>
                      </div>
                      <span class="folder-sheet-item-name">{col.name}</span>
                      <span class="folder-sheet-item-count">{col.entries.length}</span>
                      <Show when={checked()}>
                        <span class="material-symbols-outlined folder-sheet-check" aria-hidden="true">check_circle</span>
                      </Show>
                    </button>
                  );
                }}
              </For>
            </Show>
          </div>

          {/* Create new collection */}
          <div class="px-6 pt-3 pb-4 flex-shrink-0" style={{"border-top":"1px solid var(--hairline)"}}>
            <Show when={showCreate()} fallback={
              <button
                type="button"
                class="folder-sheet-create-btn"
                onClick={() => setShowCreate(true)}
                aria-label="Create new collection"
              >
                <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">add</span>
                Create New Collection
              </button>
            }>
              <div class="flex gap-2">
                <input
                  type="text"
                  class="filter-input-premium"
                  style={{ flex: 1 }}
                  placeholder="Collection name…"
                  value={newName()}
                  onInput={(e) => setNewName(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
                  aria-label="New collection name"
                />
                <button class="btn-primary" onClick={handleCreate} disabled={!newName().trim()} style={{ "font-size": "0.5625rem" }}>
                  Create
                </button>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default AddToFolderSheet;
