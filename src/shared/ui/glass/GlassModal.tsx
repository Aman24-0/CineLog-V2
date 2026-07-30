// src/shared/ui/glass/GlassModal.tsx
import {
  ParentComponent,
  JSX,
  Show,
  onCleanup,
  onMount,
  mergeProps,
  createEffect
} from "solid-js";
import { Portal } from "solid-js/web";

// ─── Variant Types ─────────────────────────────────────────────

/** Modal strength — controls backdrop blur and surface opacity. */
type ModalStrength = "default" | "strong";

/** Modal size — controls max-width. */
type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

// ─── Token Maps ────────────────────────────────────────────────

const strengthSurface: Record<ModalStrength, string> = {
  default: "bg-glass backdrop-blur-2xl",
  strong: "bg-glass-strong backdrop-blur-3xl"
};

const sizeMaxWidth: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-2rem)]"
};

// ─── Focus trap helpers ────────────────────────────────────────

/**
 * Selector for focusable elements inside the modal. Used by the focus
 * trap to enumerate Tab targets in DOM order. Mirrors the standard
 * WAI-ARIA focusable selector (button / link / input / select /
 * textarea / [tabindex] >= 0), with `:not([disabled])` so disabled
 * controls are skipped.
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ─── Props ─────────────────────────────────────────────────────

export interface GlassModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Called when the user dismisses the modal (backdrop tap, ESC). */
  onClose: () => void;
  /** Modal strength (controls blur + opacity). @default "strong" */
  strength?: ModalStrength;
  /** Modal size — controls max-width. @default "md" */
  size?: ModalSize;
  /** Optional title rendered in the modal header. */
  title?: string;
  /** Optional Material Symbol icon for the header. */
  icon?: string;
  /** Optional right-side header content (e.g. a close button). */
  headerRight?: JSX.Element;
  /** Whether to show the close X button in the header. @default true */
  showCloseButton?: boolean;
  /** Disable backdrop tap to close. @default false */
  disableBackdropClose?: boolean;
  /** z-index base for the modal. Backdrop = base, Modal = base + 1. @default 999990 */
  zIndexBase?: number;
  /** Optional class passthrough on the modal surface. */
  class?: string;
  /** Optional id for the modal surface (for aria-labelledby). */
  id?: string;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<
    GlassModalProps,
    | "strength"
    | "size"
    | "showCloseButton"
    | "disableBackdropClose"
    | "zIndexBase"
  >
> = {
  strength: "strong",
  size: "md",
  showCloseButton: true,
  disableBackdropClose: false,
  zIndexBase: 999990
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassModal — a premium centered frosted glass modal.
 *
 * Visual language:
 *  - Backdrop: 70% black with `backdrop-blur-2xl` to dim and blur the page behind
 *  - Surface: `bg-glass-strong` + `backdrop-blur-3xl` for the strongest glass effect
 *  - Border: 1px hairline-2 with golden tint
 *  - Shadow: `shadow-elevated` + an inner top highlight + a soft gold glow
 *  - Centered with `max-w-*` size presets, full height with internal scroll
 *  - Pop-in animation on mount
 *
 * Accessibility:
 *  - role="dialog" aria-modal="true"
 *  - ESC closes the modal (unless disableBackdropClose)
 *  - Backdrop tap closes (unless disableBackdropClose)
 *  - Focus moves into the dialog when it opens (auto-focuses the
 *    close button, which is always present when showCloseButton=true)
 *  - Tab key is TRAPPED so keyboard focus cycles within the modal
 *    while it's open — focus never escapes to the page behind. This
 *    implements the WAI-ARIA "Focus Trap" pattern for dialogs.
 *  - When the modal closes, focus is restored to the element that
 *    was focused just before the modal opened (typically the trigger
 *    button), so keyboard users don't lose their place on the page.
 */
const GlassModal: ParentComponent<GlassModalProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);

  // Focus management:
  //   - `modalSurfaceRef` — the inner surface div, used to query
  //     focusable elements for auto-focus + Tab trap.
  //   - `previouslyFocused` — the element that had focus before the
  //     modal opened. Restored on close so keyboard users don't lose
  //     their place on the page.
  let modalSurfaceRef: HTMLDivElement | undefined;
  let previouslyFocused: HTMLElement | null = null;
  // `prevOpen` tracks the previous `props.open` value so the
  // createEffect below can detect open/close transitions and run
  // its save/restore logic only on edges (not every render).
  let prevOpen = false;

  // ESC key + Tab trap handler.
  //
  // ESC: closes the modal (unless disableBackdropClose).
  // Tab: traps focus inside the modal surface. When the user Tabs
  //   past the last focusable element, focus wraps to the first.
  //   Shift+Tab on the first wraps to the last. This implements the
  //   WAI-ARIA focus-trap pattern for modal dialogs and prevents
  //   keyboard users from accidentally interacting with the page
  //   behind the modal.
  onMount(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key === "Escape") {
        if (!props.disableBackdropClose) props.onClose();
        return;
      }
      if (e.key === "Tab" && modalSurfaceRef) {
        const focusables = Array.from(
          modalSurfaceRef.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter(
          (el) => el.offsetParent !== null || el === document.activeElement
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !modalSurfaceRef.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !modalSurfaceRef.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  // Auto-focus first focusable element when modal opens + restore
  // focus to the trigger when it closes.
  //
  // Open edge (false → true):
  //   1. Save the currently-focused element so we can restore it on
  //      close.
  //   2. After the Portal paints (requestAnimationFrame), focus the
  //      close button if present (best UX target — predictable
  //      location, always visible), else the first focusable element.
  //
  // Close edge (true → false):
  //   1. If we saved a previously-focused element, restore focus to
  //      it (deferred to next frame so the Show/Portal teardown has
  //      finished).
  createEffect(() => {
    const isOpen = props.open;
    if (isOpen && !prevOpen) {
      // Opening — save previously focused element (the trigger).
      if (typeof document !== "undefined") {
        previouslyFocused =
          (document.activeElement as HTMLElement | null) ?? null;
      }
      if (modalSurfaceRef) {
        requestAnimationFrame(() => {
          if (!modalSurfaceRef) return;
          // Find the close button first (best UX target), or any focusable element.
          const closeBtn = modalSurfaceRef.querySelector<HTMLButtonElement>(
            "button.modal-glass-close"
          );
          if (closeBtn) {
            closeBtn.focus();
            return;
          }
          // Fallback: first focusable element.
          const focusable =
            modalSurfaceRef.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
          if (focusable) focusable.focus();
        });
      }
    } else if (!isOpen && prevOpen) {
      // Closing — restore focus to the trigger.
      if (previouslyFocused) {
        const toFocus = previouslyFocused;
        previouslyFocused = null;
        requestAnimationFrame(() => {
          try {
            toFocus?.focus();
          } catch {
            // Element may have been unmounted — ignore.
          }
        });
      }
    }
    prevOpen = isOpen;
  });

  return (
    <Show when={props.open}>
      <Portal>
        {/* Backdrop */}
        <div
          class="animate-fade-in fixed inset-0 z-[999990] flex items-center justify-center p-4"
          style={{
            "z-index": props.zIndexBase,
            background: "rgba(0,0,0,0.70)",
            "backdrop-filter": "blur(20px) saturate(140%)",
            "-webkit-backdrop-filter": "blur(20px) saturate(140%)"
          }}
          onClick={() => {
            if (!props.disableBackdropClose) props.onClose();
          }}
          aria-hidden="true"
        />
        {/* Modal */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={props.id ? `${props.id}-title` : undefined}
          class="modal-glass animate-pop-in"
          style={{
            "z-index": props.zIndexBase + 1
          }}
        >
          <div
            ref={modalSurfaceRef}
            class={`modal-glass-surface ${strengthSurface[props.strength]} ${sizeMaxWidth[props.size]} ${props.class || ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Show
              when={
                props.title ||
                props.icon ||
                props.headerRight ||
                props.showCloseButton
              }
            >
              <div class="modal-glass-header">
                <div class="modal-glass-title-cluster">
                  <Show when={props.icon}>
                    <span
                      class="material-symbols-outlined modal-glass-icon"
                      aria-hidden="true"
                    >
                      {props.icon}
                    </span>
                  </Show>
                  <Show when={props.title}>
                    <h2
                      id={props.id ? `${props.id}-title` : undefined}
                      class="modal-glass-title"
                    >
                      {props.title}
                    </h2>
                  </Show>
                </div>
                <div class="modal-glass-header-right">
                  <Show when={props.headerRight}>{props.headerRight}</Show>
                  <Show when={props.showCloseButton}>
                    <button
                      type="button"
                      class="modal-glass-close focus-ring"
                      onClick={() => props.onClose()}
                      aria-label="Close modal"
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "20px" }}
                        aria-hidden="true"
                      >
                        close
                      </span>
                    </button>
                  </Show>
                </div>
              </div>
            </Show>

            <div class="modal-glass-body">{props.children}</div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export { GlassModal };
export default GlassModal;
