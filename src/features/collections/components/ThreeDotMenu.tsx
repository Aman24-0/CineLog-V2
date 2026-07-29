// src/features/collections/components/ThreeDotMenu.tsx
import { Show, For, createSignal, onMount, onCleanup, type Component } from "solid-js";

/**
 * ThreeDotMenu — the "More actions" dropdown for the CollectionActionBar.
 *
 * Layout:
 *   - The trigger is a single icon button (⋮).
 *   - The dropdown is `position: absolute` with `right: 0; top: 100% + 8px`,
 *     so it opens below-and-aligned-right (no viewport overflow on the
 *     right edge of the page).
 *   - z-50 keeps it above sibling content but below modal overlays
 *     (which use z-999997+).
 *
 * Closing behaviour:
 *   - Click outside (via mousedown listener) closes the menu.
 *   - Selecting an item closes the menu and invokes the action.
 *   - The parent is responsible for closing the menu after a confirm
 *     dialog (e.g. Delete) — we close on click here so the menu
 *     doesn't linger behind a modal.
 *
 * This is intentionally a leaf component — it knows nothing about
 * collections, just renders a list of `{ label, icon, danger, action }`
 * items passed via props. Reusable for any "more" menu.
 */

export interface ThreeDotMenuItem {
  /** Material Symbols icon name (e.g. "archive", "delete", "content_copy"). */
  icon: string;
  /** Visible label. */
  label: string;
  /** Danger style (red text + hover). */
  danger?: boolean;
  /** Click handler. The menu closes immediately after invoking. */
  action: () => void;
}

export interface ThreeDotMenuProps {
  items: ThreeDotMenuItem[];
  /** ARIA label for the trigger button. */
  label?: string;
}

const ThreeDotMenu: Component<ThreeDotMenuProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  let wrapperRef: HTMLDivElement | undefined;

  const close = (e: MouseEvent) => {
    if (wrapperRef && !wrapperRef.contains(e.target as Node)) {
      setOpen(false);
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", close);
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", close);
  });

  return (
    <div class="three-dot-menu" ref={wrapperRef}>
      <button
        type="button"
        class="three-dot-menu-trigger focus-ring"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open());
        }}
        aria-label={props.label ?? "More actions"}
        aria-haspopup="menu"
        aria-expanded={open()}
      >
        <span class="material-symbols-outlined" aria-hidden="true">more_vert</span>
      </button>

      <Show when={open()}>
        <div class="three-dot-menu-dropdown" role="menu" aria-label={props.label ?? "More actions"}>
          <For each={props.items}>
            {(item) => (
              <button
                type="button"
                class={`three-dot-menu-item${item.danger ? " is-danger" : ""}`}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.action();
                }}
              >
                <span class="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                <span class="three-dot-menu-item-label">{item.label}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ThreeDotMenu;
