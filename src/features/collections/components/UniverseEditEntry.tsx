// src/features/collections/components/UniverseEditEntry.tsx
import { Show, createMemo, type Accessor } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { findInVault } from "~/shared/utils/vaultMatch";
import type { CollectionEntry, WatchlistItem } from "~/shared/types";

/**
 * UniverseEditEntry — a single row in the UniverseEditPage timeline.
 *
 * Extracted from UniverseEditPage.tsx to keep that file under the
 * 250-line limit. Each row has:
 *   - Drag handle (HTML5 drag API)
 *   - Poster (or fallback icon for custom entries)
 *   - Title + entry-type + pinned/hidden badges
 *   - Inline note editor (toggleable)
 *   - Pin / Hide / Note action buttons
 */
export interface UniverseEditEntryProps {
  entry: CollectionEntry;
  index: Accessor<number>;
  vault: Accessor<WatchlistItem[]>;
  editingNote: Accessor<string | null>;
  noteText: Accessor<string>;
  onDragStart: (e: DragEvent, index: number) => void;
  onDragEnd: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent, index: number) => void;
  onTogglePin: (index: number) => void;
  onToggleHide: (index: number) => void;
  onStartNote: (index: number) => void;
  onSaveNote: () => void;
  onNoteTextChange: (v: string) => void;
  onCancelNote: () => void;
}

const titleOf = (e: CollectionEntry) => e.title || e.name || "Untitled";

export default function UniverseEditEntry(props: UniverseEditEntryProps) {
  const vaultItem = createMemo(() =>
    findInVault(props.vault(), { id: props.entry.id, media_type: props.entry.media_type }),
  );
  const isHidden = createMemo(() => props.entry.isHidden ?? false);
  const isNoteEditing = createMemo(() => props.editingNote() === String(props.index()));

  return (
    <div
      class={`timeline-edit-item${isHidden() ? " timeline-edit-item-hidden" : ""}${props.entry.isCustomEntry ? " timeline-edit-item-custom" : ""}`}
      role="listitem"
      draggable={true}
      onDragStart={(e) => props.onDragStart(e, props.index())}
      onDragEnd={props.onDragEnd}
      onDragOver={props.onDragOver}
      onDrop={(e) => props.onDrop(e, props.index())}
    >
      {/* Drag handle */}
      <div class="timeline-edit-drag-handle" aria-hidden="true">
        <span class="material-symbols-outlined" style={{"font-size":"16px","color":"var(--text-dim)"}} aria-hidden="true">drag_indicator</span>
      </div>

      {/* Poster */}
      <div class="universe-timeline-poster">
        <Show when={props.entry.poster_path} fallback={
          <div class="universe-timeline-poster-fallback">
            <span class="material-symbols-outlined" style={{"font-size":"20px","color":"var(--text-dim)"}} aria-hidden="true">
              {props.entry.isCustomEntry ? "edit_note" : "movie"}
            </span>
          </div>
        }>
          <img
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            src={tmdbImage(props.entry.poster_path, "w185")}
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
        <p class="universe-timeline-title">{titleOf(props.entry)}</p>
        <div class="universe-timeline-meta-row">
          <Show when={props.entry.entryType}>
            <span class="universe-timeline-entry-type">{props.entry.entryType}</span>
          </Show>
          <Show when={props.entry.isPinned}>
            <span style={{"color":"var(--p)","font-size":"0.5625rem"}}>Pinned</span>
          </Show>
          <Show when={isHidden()}>
            <span style={{"color":"var(--text-soft)","font-size":"0.5625rem"}}>Hidden</span>
          </Show>
        </div>
        {/* Note editing */}
        <Show when={isNoteEditing()} fallback={
          <Show when={props.entry.userNote}>
            <p class="universe-timeline-note">{props.entry.userNote}</p>
          </Show>
        }>
          <div class="timeline-edit-note-input">
            <input
              type="text"
              value={props.noteText()}
              onInput={(e) => props.onNoteTextChange(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter") props.onSaveNote(); if (e.key === "Escape") props.onCancelNote(); }}
              placeholder="Add a note…"
            />
            <button type="button" class="btn-ghost" style={{ "font-size": "0.5625rem" }} onClick={props.onSaveNote}>Save</button>
          </div>
        </Show>
      </div>

      {/* Action buttons */}
      <div class="timeline-edit-actions">
        <button type="button" class="timeline-edit-action" onClick={() => props.onTogglePin(props.index())} aria-label={props.entry.isPinned ? "Unpin" : "Pin"}>
          <span class="material-symbols-outlined" style={`font-size: 16px; color: ${props.entry.isPinned ? "var(--p)" : "var(--text-dim)"}`} aria-hidden="true">push_pin</span>
        </button>
        <button type="button" class="timeline-edit-action" onClick={() => props.onToggleHide(props.index())} aria-label={isHidden() ? "Show" : "Hide"}>
          <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">{isHidden() ? "visibility" : "visibility_off"}</span>
        </button>
        <button type="button" class="timeline-edit-action" onClick={() => props.onStartNote(props.index())} aria-label="Add note">
          <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">edit_note</span>
        </button>
      </div>

      {/* Reference vaultItem to keep the reactive dependency (used for
          future vault-aware badges). */}
      <span hidden>{vaultItem() ? "in-vault" : ""}</span>
    </div>
  );
}
