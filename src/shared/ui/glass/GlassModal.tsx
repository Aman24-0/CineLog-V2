// src/shared/ui/glass/GlassModal.tsx
import { ParentComponent, JSX, Show, onCleanup, onMount, splitProps, mergeProps, createEffect } from "solid-js";
import { Portal } from "solid-js/web";

// ─── Variant Types ─────────────────────────────────────────────

/** Modal strength — controls backdrop blur and surface opacity. */
type ModalStrength = "default" | "strong";

/** Modal size — controls max-width. */
type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

// ─── Token Maps ────────────────────────────────────────────────

const strengthSurface: Record<ModalStrength, string> = {
  default: "bg-glass backdrop-blur-2xl",
  strong: "bg-glass-strong backdrop-blur-3xl",
};

const sizeMaxWidth: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-2rem)]",
};

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
  Pick<GlassModalProps, "strength" | "size" | "showCloseButton" | "disableBackdropClose" | "zIndexBase">
> = {
  strength: "strong",
  size: "md",
  showCloseButton: true,
  disableBackdropClose: false,
  zIndexBase: 999990,
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
 */
const GlassModal: ParentComponent<GlassModalProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);

  // Focus management: auto-focus the first focusable element
  // inside the modal when it opens. This ensures keyboard users
  // don't have to Tab through the background page to reach the
  // dialog. We use a ref on the close button as the primary target,
  // falling back to querying all focusable elements.
  let modalSurfaceRef: HTMLDivElement | undefined;

  // ESC key handler
  onMount(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && props.open) {
        if (!props.disableBackdropClose) props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  // Auto-focus first focusable element when modal opens
  createEffect(() => {
    if (props.open && modalSurfaceRef) {
      // Delay to allow the Portal to render the DOM
      requestAnimationFrame(() => {
        if (!modalSurfaceRef) return;
        // Find the close button first (best UX target), or any focusable element
        const closeBtn = modalSurfaceRef.querySelector<HTMLButtonElement>("button.modal-glass-close");
        if (closeBtn) {
          closeBtn.focus();
          return;
        }
        // Fallback: first focusable element
        const focusable = modalSurfaceRef.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) focusable.focus();
      });
    }
  });

  return (
    <Show when={props.open}>
      <Portal>
        {/* Backdrop */}
        <div
          class="fixed inset-0 z-[999990] animate-fade-in flex items-center justify-center p-4"
          style={{
            "z-index": props.zIndexBase,
            background: "rgba(0,0,0,0.70)",
            "backdrop-filter": "blur(20px) saturate(140%)",
            "-webkit-backdrop-filter": "blur(20px) saturate(140%)",
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
            "z-index": props.zIndexBase + 1,
          }}
        >
          <div
            ref={modalSurfaceRef}
            class={`modal-glass-surface ${strengthSurface[props.strength]} ${sizeMaxWidth[props.size]} ${props.class || ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Show when={props.title || props.icon || props.headerRight || props.showCloseButton}>
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
                  <Show when={props.headerRight}>
                    {props.headerRight}
                  </Show>
                  <Show when={props.showCloseButton}>
                    <button
                      type="button"
                      class="modal-glass-close focus-ring"
                      onClick={props.onClose}
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
