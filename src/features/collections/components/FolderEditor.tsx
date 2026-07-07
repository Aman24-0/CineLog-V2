// src/features/collections/components/FolderEditor.tsx
import { Show, createSignal, For } from "solid-js";
import { Portal } from "solid-js/web";
import { useCollections } from "../hooks/useCollections";
import type { Collection } from "~/shared/types";

interface FolderEditorProps {
  collection: Collection;
  onClose: () => void;
}

const ACCENT_COLORS = [
  "#E62429", "#0078D7", "#7B5EA7", "#FFE81F", "#4ade80",
  "#C41E3A", "#1a1a2e", "#00FF00", "#C0C0C0", "#FF6B00",
  "#9d4edd", "#06ffd4", "#FFD700", "#00c2ff", "#ff2af0"
];

const EMOJIS = ["🎬", "🌟", "🎭", "🎪", "🏆", "❤️", "🔥", "⚡", "🌙", "🎯", "🎬", "💎"];

/**
 * FolderEditor — bottom sheet for user collection customization.
 *
 * Features:
 *   - Rename
 *   - Description
 *   - Accent color picker
 *   - Emoji picker
 *   - Archive toggle
 *   - Duplicate
 *   - Delete
 */
export default function FolderEditor(props: FolderEditorProps) {
  const { renameCollection, updateCollectionMeta, duplicateCollection, deleteCollection } = useCollections();

  const [name, setName] = createSignal(props.collection.name);
  const [description, setDescription] = createSignal(props.collection.description ?? "");
  const [showEmojiPicker, setShowEmojiPicker] = createSignal(false);
  const [showColorPicker, setShowColorPicker] = createSignal(false);

  const handleRename = () => {
    const n = name().trim();
    if (n && n !== props.collection.name) {
      renameCollection(props.collection.id, n);
    }
  };

  const handleSaveDescription = () => {
    updateCollectionMeta(props.collection.id, { description: description() });
  };

  const handleAccentColor = (color: string) => {
    updateCollectionMeta(props.collection.id, { accentColor: color });
    setShowColorPicker(false);
  };

  const handleEmoji = (emoji: string) => {
    updateCollectionMeta(props.collection.id, { emoji });
    setShowEmojiPicker(false);
  };

  const handleArchive = () => {
    updateCollectionMeta(props.collection.id, { isArchived: !props.collection.isArchived });
  };

  const handleDuplicate = () => {
    duplicateCollection(props.collection.id);
    props.onClose();
  };

  const handleDelete = () => {
    deleteCollection(props.collection.id);
    props.onClose();
  };

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[999997] flex items-end justify-center animate-fade-in"
        onClick={props.onClose}
        role="dialog"
        aria-modal="true"
      >
        <div class="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)" }} aria-hidden="true" />
        <div
          class="folder-editor-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="folder-editor-header">
            <h3 class="folder-editor-title">Edit Collection</h3>
            <button type="button" class="folder-editor-close" onClick={props.onClose} aria-label="Close">
              <span class="material-symbols-outlined" style="font-size: 20px" aria-hidden="true">close</span>
            </button>
          </div>

          {/* Emoji + Name */}
          <div class="folder-editor-name-row">
            <button
              type="button"
              class="folder-editor-emoji-btn"
              onClick={() => setShowEmojiPicker(!showEmojiPicker())}
              aria-label="Choose emoji"
            >
              {props.collection.emoji || "📁"}
            </button>
            <input
              type="text"
              class="folder-editor-name-input"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              onBlur={handleRename}
              aria-label="Collection name"
            />
          </div>

          <Show when={showEmojiPicker()}>
            <div class="folder-editor-emoji-grid">
              <For each={EMOJIS}>
                {(emoji) => (
                  <button type="button" class="folder-editor-emoji-item" onClick={() => handleEmoji(emoji)}>
                    {emoji}
                  </button>
                )}
              </For>
            </div>
          </Show>

          {/* Description */}
          <div class="folder-editor-field">
            <label class="folder-editor-label">Description</label>
            <textarea
              class="folder-editor-textarea"
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              onBlur={handleSaveDescription}
              placeholder="Add a description…"
              rows={2}
            />
          </div>

          {/* Accent color */}
          <div class="folder-editor-field">
            <button
              type="button"
              class="folder-editor-section-btn"
              onClick={() => setShowColorPicker(!showColorPicker())}
            >
              <span class="folder-editor-label">Accent Color</span>
              <Show when={props.collection.accentColor} fallback={
                <span class="folder-editor-value">Default</span>
              }>
                <span
                  class="folder-editor-color-dot"
                  style={{ background: props.collection.accentColor }}
                />
              </Show>
            </button>
            <Show when={showColorPicker()}>
              <div class="folder-editor-color-grid">
                <For each={ACCENT_COLORS}>
                  {(color) => (
                    <button
                      type="button"
                      class="folder-editor-color-swatch"
                      style={{ background: color }}
                      onClick={() => handleAccentColor(color)}
                      aria-label={`Set accent color to ${color}`}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* Actions */}
          <div class="folder-editor-actions">
            <button type="button" class="folder-editor-action-btn" onClick={handleArchive}>
              <span class="material-symbols-outlined" style="font-size: 18px" aria-hidden="true">
                {props.collection.isArchived ? "unarchive" : "archive"}
              </span>
              {props.collection.isArchived ? "Unarchive" : "Archive"}
            </button>
            <button type="button" class="folder-editor-action-btn" onClick={handleDuplicate}>
              <span class="material-symbols-outlined" style="font-size: 18px" aria-hidden="true">content_copy</span>
              Duplicate
            </button>
            <Show when={!props.collection.isFavorites}>
              <button type="button" class="folder-editor-action-btn folder-editor-action-danger" onClick={handleDelete}>
                <span class="material-symbols-outlined" style="font-size: 18px" aria-hidden="true">delete</span>
                Delete
              </button>
            </Show>
          </div>
        </div>
      </div>
    </Portal>
  );
}
