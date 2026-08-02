// src/features/collections/components/CollectionActionBar.tsx
import { Show, type Component } from "solid-js";
import ThreeDotMenu, { type ThreeDotMenuItem } from "./ThreeDotMenu";
import type { Collection } from "~/shared/types";

/**
 * CollectionActionBar — Row 1 of the collection detail page's
 * action area (above the sort/filter/search Row 2).
 *
 * LAYOUT (single row, wraps on narrow screens):
 *
 *   USER COLLECTIONS:
 *     [+ Add Titles] [↕ Reorder] [Share]                [⋮ More]
 *                     ↑ only when Manual Order is active
 *
 *   SUBSCRIBED UNIVERSES (read-only):
 *     [Share] [Unsubscribe]
 *
 * Per the spec:
 *   - Universes have NO Add / Edit / Delete / Archive / Reorder.
 *   - The More dropdown is positioned absolutely (no overflow).
 *     It contains: Archive, Delete (with confirmation), Duplicate.
 *
 * The Edit action is intentionally ABSENT here — the hero's pencil
 * icon (bottom-right of the backdrop) opens the FolderEditor. This
 * avoids the previous double-CTA where both the action bar AND the
 * dock had "Edit" buttons that opened the same modal.
 */
export interface CollectionActionBarProps {
  collection: Collection;
  /** True when the user has selected "Manual Order" sort — the
   *  Reorder button is only shown in that case. */
  showReorder?: boolean;
  // ── User collection actions ──
  onAddTitles?: () => void;
  onReorder?: () => void;
  onShare?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  // ── Universe actions ──
  onUnsubscribe?: () => void;
}

const CollectionActionBar: Component<CollectionActionBarProps> = (props) => {
  const isUniverse = () => props.collection.type === "curated";

  const moreItems = (): ThreeDotMenuItem[] => {
    if (isUniverse()) return [];
    const items: ThreeDotMenuItem[] = [];
    if (props.onDuplicate) {
      items.push({
        icon: "content_copy",
        label: "Duplicate",
        action: () => props.onDuplicate?.()
      });
    }
    if (props.collection.isArchived) {
      if (props.onUnarchive) {
        items.push({
          icon: "unarchive",
          label: "Unarchive",
          action: () => props.onUnarchive?.()
        });
      }
    } else if (props.onArchive) {
      items.push({
        icon: "archive",
        label: "Archive",
        action: () => props.onArchive?.()
      });
    }
    if (props.onDelete) {
      items.push({
        icon: "delete",
        label: "Delete",
        danger: true,
        action: () => props.onDelete?.()
      });
    }
    return items;
  };

  return (
    <div class="collection-action-bar">
      <Show when={!isUniverse()}>
        <button
          type="button"
          class="collection-action-bar-btn is-primary focus-ring"
          onClick={() => props.onAddTitles?.()}
          aria-label="Add titles from your watchlist"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            add
          </span>
          <span class="collection-action-bar-btn-label">Add Titles</span>
        </button>

        <Show when={props.showReorder}>
          <button
            type="button"
            class="collection-action-bar-btn focus-ring"
            onClick={() => props.onReorder?.()}
            aria-label="Reorder list"
            title="Reorder list"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              reorder
            </span>
            <span class="collection-action-bar-btn-label">Reorder</span>
          </button>
        </Show>
      </Show>

      {/* Share — available on both user collections and universes */}
      <button
        type="button"
        class="collection-action-bar-btn focus-ring"
        onClick={() => props.onShare?.()}
        aria-label="Share collection"
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          share
        </span>
        <span class="collection-action-bar-btn-label">Share</span>
      </button>

      <Show when={isUniverse()}>
        <button
          type="button"
          class="collection-action-bar-btn is-danger focus-ring"
          onClick={() => props.onUnsubscribe?.()}
          aria-label={`Unsubscribe from ${props.collection.name}`}
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            remove_circle
          </span>
          <span class="collection-action-bar-btn-label">Unsubscribe</span>
        </button>
      </Show>

      {/* Spacer pushes the More menu to the right edge */}
      <div class="collection-action-bar-spacer" />

      <Show when={!isUniverse() && moreItems().length > 0}>
        <ThreeDotMenu items={moreItems()} label="More collection actions" />
      </Show>
    </div>
  );
};

export default CollectionActionBar;
