// src/features/collections/components/UniverseEditPage.tsx
import { For, Show, createMemo, createSignal } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "../hooks/useCollections";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { findInVault } from "~/shared/utils/vaultMatch";
import { CURATED_COLLECTIONS } from "~/shared/data/curatedCollections";
import type { Collection, CollectionEntry, WatchlistItem } from "~/shared/types";

/**
 * UniverseEditPage — timeline editing page for a universe.
 *
 * Features:
 *   - Drag-and-drop reordering (HTML5 drag API)
 *   - Pin/Hide/Restore/Remove per entry
 *   - Add notes to entries
 *   - Insert custom entries
 *   - Reset to official order
 */
export default function UniverseEditPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const { userCollections, reorderEntries, saveOverrides } = useCollections();

  const collection = createMemo<Collection | null>(() => {
    const id = params.id;
    const curated = CURATED_COLLECTIONS.find((c) => c.id === id);
    if (curated) return curated;
    const user = userCollections().find((c) => c.id === id);
    if (user) return user;
    return null;
  });

  const [editingNote, setEditingNote] = createSignal<string | null>(null);
  const [noteText, setNoteText] = createSignal("");
  const [showAddCustom, setShowAddCustom] = createSignal(false);
  const [customTitle, setCustomTitle] = createSignal("");

  /** Local copy of entries for drag-drop manipulation */
  const [localEntries, setLocalEntries] = createSignal<CollectionEntry[] | null>(null);
  const entries = createMemo(() => localEntries() ?? (collection()?.entries ?? []));

  const isCurated = createMemo(() => collection()?.type === "curated");

  const handleDragStart = (e: DragEvent, index: number) => {
    e.dataTransfer?.setData("text/plain", String(index));
    (e.currentTarget as HTMLElement).classList.add("timeline-edit-dragging");
  };

  const handleDragEnd = (e: DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove("timeline-edit-dragging");
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer?.getData("text/plain") ?? "-1");
    if (sourceIndex < 0 || sourceIndex === targetIndex) return;

    const items = [...entries()];
    const [moved] = items.splice(sourceIndex, 1);
    items.splice(targetIndex, 0, moved);
    // Update customOrder for all items
    items.forEach((item, i) => {
      item.customOrder = i;
    });
    setLocalEntries(items);
  };

  const togglePin = (index: number) => {
    const items = [...entries()];
    items[index] = { ...items[index], isPinned: !items[index].isPinned };
    setLocalEntries(items);
  };

  const toggleHide = (index: number) => {
    const items = [...entries()];
    items[index] = { ...items[index], isHidden: !items[index].isHidden };
    setLocalEntries(items);
  };

  const startNote = (index: number) => {
    const entry = entries()[index];
    setEditingNote(String(index));
    setNoteText(entry.userNote ?? "");
  };

  const saveNote = () => {
    const idx = parseInt(editingNote() ?? "-1");
    if (idx < 0) return;
    const items = [...entries()];
    items[idx] = { ...items[idx], userNote: noteText() };
    setLocalEntries(items);
    setEditingNote(null);
  };

  const addCustomEntry = () => {
    const title = customTitle().trim();
    if (!title) return;
    const items = [...entries()];
    items.push({
      id: `custom-${Date.now()}`,
      media_type: "movie",
      title,
      isCustomEntry: true,
      customOrder: items.length
    });
    setLocalEntries(items);
    setCustomTitle("");
    setShowAddCustom(false);
  };

  const resetToOfficial = () => {
    setLocalEntries(null);
  };

  const saveChanges = async () => {
    const col = collection();
    if (!col) return;
    if (col.type === "user") {
      await reorderEntries(col.id, entries());
    } else {
      // For curated, save overrides to preferences
      const overrides: Record<string, Partial<CollectionEntry>> = {};
      entries().forEach((e) => {
        const key = `${e.media_type}/${e.id}`;
        const orig = col.entries.find((oe) => oe.id === e.id && oe.media_type === e.media_type);
        if (orig && (e.customOrder !== orig.order || e.isPinned !== orig.isPinned || e.isHidden !== orig.isHidden || e.userNote !== orig.userNote)) {
          overrides[key] = {
            customOrder: e.customOrder,
            isPinned: e.isPinned,
            isHidden: e.isHidden,
            userNote: e.userNote
          };
        }
      });
      await saveOverrides(col.id, overrides);
    }
    navigate(`/collections/${col.id}`);
  };

  const titleOf = (e: CollectionEntry) => e.title || e.name || "Untitled";

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="page-enter">
        {/* Header */}
        <div class="collections-edit-header">
          <button
            type="button"
            class="collections-back-btn"
            onClick={() => navigate(`/collections/${params.id}`)}
            aria-label="Back to universe"
          >
            <span class="material-symbols-outlined" style="font-size: 18px" aria-hidden="true">arrow_back</span>
          </button>
          <h1 class="collections-edit-title">Edit Timeline</h1>
          <div class="collections-edit-actions">
            <Show when={isCurated()}>
              <button type="button" class="btn-ghost" style={{ "font-size": "0.6875rem" }} onClick={resetToOfficial}>
                Reset
              </button>
            </Show>
            <button type="button" class="btn-primary" style={{ "font-size": "0.6875rem" }} onClick={saveChanges}>
              Save
            </button>
          </div>
        </div>

        <Show when={collection()} fallback={
          <div class="collections-detail-empty">
            <p class="type-body-soft">Collection not found.</p>
            <button class="btn-ghost" onClick={() => navigate("/collections")}>Back to Collections</button>
          </div>
        }>
          {/* Add custom entry */}
          <Show when={showAddCustom()} fallback={
            <button type="button" class="smart-builder-add-rule" onClick={() => setShowAddCustom(true)} style={{ "margin-bottom": "var(--sp-4)" }}>
              <span class="material-symbols-outlined" style="font-size: 16px" aria-hidden="true">add</span>
              Add Custom Entry
            </button>
          }>
            <div class="collections-create-bar" style={{ "margin-bottom": "var(--sp-4)" }}>
              <input
                type="text"
                class="collections-create-input"
                placeholder="Custom entry title…"
                value={customTitle()}
                onInput={(e) => setCustomTitle(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCustomEntry(); if (e.key === "Escape") setShowAddCustom(false); }}
              />
              <button class="btn-primary" onClick={addCustomEntry} disabled={!customTitle().trim()} style={{ "font-size": "0.5625rem" }}>Add</button>
              <button class="btn-ghost" onClick={() => setShowAddCustom(false)} style={{ "font-size": "0.5625rem" }}>Cancel</button>
            </div>
          </Show>

          {/* Entry list with drag handles */}
          <div class="universe-timeline" role="list">
            <For each={entries()}>
              {(entry, i) => {
                const vaultItem = createMemo(() =>
                  findInVault(watchlist(), { id: entry.id, media_type: entry.media_type })
                );
                const isHidden = createMemo(() => entry.isHidden ?? false);
                const isNoteEditing = createMemo(() => editingNote() === String(i()));

                return (
                  <div
                    class={`timeline-edit-item${isHidden() ? " timeline-edit-item-hidden" : ""}${entry.isCustomEntry ? " timeline-edit-item-custom" : ""}`}
                    role="listitem"
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, i())}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, i())}
                  >
                    {/* Drag handle */}
                    <div class="timeline-edit-drag-handle" aria-hidden="true">
                      <span class="material-symbols-outlined" style="font-size: 16px; color: var(--text-dim)" aria-hidden="true">drag_indicator</span>
                    </div>

                    {/* Poster */}
                    <div class="universe-timeline-poster">
                      <Show when={entry.poster_path} fallback={
                        <div class="universe-timeline-poster-fallback">
                          <span class="material-symbols-outlined" style="font-size: 20px; color: var(--text-dim)" aria-hidden="true">
                            {entry.isCustomEntry ? "edit_note" : "movie"}
                          </span>
                        </div>
                      }>
                        <img
                          src={tmdbImage(entry.poster_path, "w185")}
                          class="universe-timeline-poster-img"
                          loading="lazy"
                          decoding="async"
                          alt=""
                          aria-hidden="true"
                        />
                      </Show>
                    </div>

                    {/* Info */}
                    <div class="universe-timeline-info">
                      <p class="universe-timeline-title">{titleOf(entry)}</p>
                      <div class="universe-timeline-meta-row">
                        <Show when={entry.entryType}>
                          <span class="universe-timeline-entry-type">{entry.entryType}</span>
                        </Show>
                        <Show when={entry.isPinned}>
                          <span style="color: var(--p); font-size: 0.5625rem">Pinned</span>
                        </Show>
                        <Show when={isHidden()}>
                          <span style="color: var(--text-soft); font-size: 0.5625rem">Hidden</span>
                        </Show>
                      </div>
                      {/* Note editing */}
                      <Show when={isNoteEditing()} fallback={
                        <Show when={entry.userNote}>
                          <p class="universe-timeline-note">{entry.userNote}</p>
                        </Show>
                      }>
                        <div class="timeline-edit-note-input">
                          <input
                            type="text"
                            value={noteText()}
                            onInput={(e) => setNoteText(e.currentTarget.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveNote(); if (e.key === "Escape") setEditingNote(null); }}
                            placeholder="Add a note…"
                          />
                          <button type="button" class="btn-ghost" style={{ "font-size": "0.5625rem" }} onClick={saveNote}>Save</button>
                        </div>
                      </Show>
                    </div>

                    {/* Action buttons */}
                    <div class="timeline-edit-actions">
                      <button type="button" class="timeline-edit-action" onClick={() => togglePin(i())} aria-label={entry.isPinned ? "Unpin" : "Pin"}>
                        <span class="material-symbols-outlined" style={`font-size: 16px; color: ${entry.isPinned ? "var(--p)" : "var(--text-dim)"}`} aria-hidden="true">push_pin</span>
                      </button>
                      <button type="button" class="timeline-edit-action" onClick={() => toggleHide(i())} aria-label={isHidden() ? "Show" : "Hide"}>
                        <span class="material-symbols-outlined" style="font-size: 16px" aria-hidden="true">{isHidden() ? "visibility" : "visibility_off"}</span>
                      </button>
                      <button type="button" class="timeline-edit-action" onClick={() => startNote(i())} aria-label="Add note">
                        <span class="material-symbols-outlined" style="font-size: 16px" aria-hidden="true">edit_note</span>
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </PageContainer>
  );
}
