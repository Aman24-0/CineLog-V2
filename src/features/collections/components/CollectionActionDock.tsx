// src/features/collections/components/CollectionActionDock.tsx
import { Show, createSignal, onCleanup, onMount, For, type Component } from "solid-js";
import type { Collection } from "~/shared/types";

/**
 * CollectionActionDock — contextual action bar above the entry list.
 *
 * USER COLLECTIONS:
 *   [Add Titles] [Edit] [Share] [More ⋮]
 *     More menu: Archive, Delete
 *
 * SUBSCRIBED UNIVERSES (read-only):
 *   [Share] [Unsubscribe]
 *     No Add / Edit / Delete / Archive — the admin owns the universe.
 *
 * The "More" menu is a custom dropdown (same pattern as SortControl /
 * GlassSelect) — NOT a native <select> — so it matches the dark glass
 * theme on mobile.
 */
export interface CollectionActionDockProps {
  collection: Collection;
  onAddTitles?: () => void;
  onEdit?: () => void;
  onShare?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onUnsubscribe?: () => void;
}

const CollectionActionDock: Component<CollectionActionDockProps> = (props) => {
  const isUniverse = () => props.collection.type === "curated";

  const [moreOpen, setMoreOpen] = createSignal(false);
  let moreRef: HTMLDivElement | undefined;

  const closeMore = (e: MouseEvent) => {
    if (moreRef && !moreRef.contains(e.target as Node)) {
      setMoreOpen(false);
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", closeMore);
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", closeMore);
  });

  const handleShare = () => {
    if (props.onShare) {
      props.onShare();
      return;
    }
    // Default: copy the URL to clipboard.
    const url = typeof window !== "undefined"
      ? `${window.location.origin}/collections/${props.collection.id}`
      : "";
    if (url && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  return (
    <div class="collection-action-dock">
      <Show when={!isUniverse()}>
        <button
          type="button"
          class="collection-action-dock-btn collection-action-dock-btn-primary focus-ring"
          onClick={() => props.onAddTitles?.()}
          aria-label="Add titles to this collection"
        >
          <span class="material-symbols-outlined" aria-hidden="true">add</span>
          Add Titles
        </button>
        <button
          type="button"
          class="collection-action-dock-btn focus-ring"
          onClick={() => props.onEdit?.()}
          aria-label="Edit collection"
        >
          <span class="material-symbols-outlined" aria-hidden="true">edit</span>
          Edit
        </button>
      </Show>

      {/* Share — available on both user collections and universes */}
      <button
        type="button"
        class="collection-action-dock-btn focus-ring"
        onClick={handleShare}
        aria-label="Share collection"
      >
        <span class="material-symbols-outlined" aria-hidden="true">share</span>
        Share
      </button>

      <Show when={isUniverse()}>
        <button
          type="button"
          class="collection-action-dock-btn focus-ring"
          onClick={() => props.onUnsubscribe?.()}
          aria-label={`Unsubscribe from ${props.collection.name}`}
          title="Unsubscribe"
        >
          <span class="material-symbols-outlined" aria-hidden="true" style={{ color: "#f87171" }}>remove_circle</span>
          Unsubscribe
        </button>
      </Show>

      <Show when={!isUniverse()}>
        {/* More dropdown */}
        <div class="collection-action-dock-more" ref={moreRef}>
          <button
            type="button"
            class="collection-action-dock-btn focus-ring"
            onClick={() => setMoreOpen(!moreOpen())}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={moreOpen()}
          >
            <span class="material-symbols-outlined" aria-hidden="true">more_vert</span>
          </button>
          <Show when={moreOpen()}>
            <div class="collection-action-dock-more-menu" role="menu">
              <For each={[
                {
                  label: "Archive",
                  icon: "archive",
                  danger: false,
                  action: () => { props.onArchive?.(); setMoreOpen(false); },
                },
                {
                  label: "Delete",
                  icon: "delete",
                  danger: true,
                  action: () => { props.onDelete?.(); setMoreOpen(false); },
                },
              ]}>
                {(item) => (
                  <button
                    type="button"
                    class={`collection-action-dock-more-menu-item${item.danger ? " danger" : ""}`}
                    role="menuitem"
                    onClick={item.action}
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                    {item.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default CollectionActionDock;
