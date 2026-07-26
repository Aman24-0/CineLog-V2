// src/shared/ui/glass/GlassSheet.tsx
import { ParentComponent, JSX, Show, onCleanup, onMount, splitProps, mergeProps, createEffect } from "solid-js";
import { Portal } from "solid-js/web";

// ─── Variant Types ─────────────────────────────────────────────

/** Sheet strength — controls backdrop blur and surface opacity. */
type SheetStrength = "default" | "strong";

/** Snap point — controls how far up the sheet rises. */
type SheetSnap = "compact" | "default" | "tall" | "full";

// ─── Token Maps ────────────────────────────────────────────────

const strengthBg: Record<SheetStrength, string> = {
  default: "bg-glass backdrop-blur-2xl",
  strong: "bg-glass-strong backdrop-blur-3xl",
};

const snapHeight: Record<SheetSnap, string> = {
  compact: "max-h-[40vh]",
  default: "max-h-[70vh]",
  tall: "max-h-[88vh]",
  full: "h-[95vh]",
};

// ─── Props ─────────────────────────────────────────────────────

export interface GlassSheetProps {
  /** Whether the sheet is open. */
  open: boolean;
  /** Called when the user dismisses the sheet (backdrop tap, ESC, swipe down). */
  onClose: () => void;
  /** Sheet strength (controls blur + opacity). @default "strong" */
  strength?: SheetStrength;
  /** Snap point — controls the sheet's max height. @default "default" */
  snap?: SheetSnap;
  /** Optional title rendered in the sheet header. */
  title?: string;
  /** Optional Material Symbol icon for the header. */
  icon?: string;
  /** Optional right-side header content (e.g. a close button). */
  headerRight?: JSX.Element;
  /** Whether to show the drag handle at the top. @default true */
  showHandle?: boolean;
  /** Disable backdrop tap to close. @default false */
  disableBackdropClose?: boolean;
  /** z-index base for the sheet. Backdrop = base, Sheet = base + 1. @default 999990 */
  zIndexBase?: number;
  /** Optional class passthrough on the sheet surface. */
  class?: string;
  /** Optional id for the sheet surface (for aria-labelledby). */
  id?: string;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<GlassSheetProps, "strength" | "snap" | "showHandle" | "disableBackdropClose" | "zIndexBase">
> = {
  strength: "strong",
  snap: "default",
  showHandle: true,
  disableBackdropClose: false,
  zIndexBase: 999990,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassSheet — a premium frosted bottom sheet.
 *
 * Visual language:
 *  - Backdrop: 60% black with `backdrop-blur-xl` to dim and blur the page behind
 *  - Surface: `bg-glass-strong` + `backdrop-blur-3xl` for the strongest glass effect
 *  - Border: 1px hairline-2 with `border-t` accent for the "rising" feel
 *  - Shadow: `shadow-elevated` + an inner top highlight to simulate light from above
 *  - Drag handle: a 36×4 pill at the top, always visible by default
 *  - Slide-up animation on mount, slide-down on close
 *
 * Accessibility:
 *  - role="dialog" aria-modal="true"
 *  - ESC closes the sheet (unless disableBackdropClose)
 *  - Backdrop tap closes (unless disableBackdropClose)
 *  - Focus moves into the sheet when it opens (auto-focuses
 *    the first focusable element, typically the close button)
 */
const GlassSheet: ParentComponent<GlassSheetProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);

  // Focus management: auto-focus the first focusable element
  // inside the sheet when it opens.
  let sheetSurfaceRef: HTMLDivElement | undefined;

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

  // Auto-focus first focusable element when sheet opens
  createEffect(() => {
    if (props.open && sheetSurfaceRef) {
      requestAnimationFrame(() => {
        if (!sheetSurfaceRef) return;
        const focusable = sheetSurfaceRef.querySelector<HTMLElement>(
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
          class="fixed inset-0 z-[999990] animate-fade-in"
          style={{
            "z-index": props.zIndexBase,
            background: "rgba(0,0,0,0.55)",
            "backdrop-filter": "blur(14px) saturate(120%)",
            "-webkit-backdrop-filter": "blur(14px) saturate(120%)",
          }}
          onClick={() => {
            if (!props.disableBackdropClose) props.onClose();
          }}
          aria-hidden="true"
        />
        {/* Sheet */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={props.id ? `${props.id}-title` : undefined}
          class="sheet-glass animate-slide-up"
          style={{
            "z-index": props.zIndexBase + 1,
            ...({
              "--sheet-snap": snapHeight[props.snap],
            } as JSX.CSSProperties),
          }}
        >
          <div
            ref={sheetSurfaceRef}
            class={`sheet-glass-surface ${strengthBg[props.strength]} ${props.class || ""}`}
          >
            <Show when={props.showHandle}>
              <div class="sheet-glass-handle" aria-hidden="true" />
            </Show>

            <Show when={props.title || props.icon || props.headerRight}>
              <div class="sheet-glass-header">
                <div class="sheet-glass-title-cluster">
                  <Show when={props.icon}>
                    <span
                      class="material-symbols-outlined sheet-glass-icon"
                      aria-hidden="true"
                    >
                      {props.icon}
                    </span>
                  </Show>
                  <Show when={props.title}>
                    <h2
                      id={props.id ? `${props.id}-title` : undefined}
                      class="sheet-glass-title"
                    >
                      {props.title}
                    </h2>
                  </Show>
                </div>
                <Show when={props.headerRight}>
                  <div class="sheet-glass-header-right">{props.headerRight}</div>
                </Show>
              </div>
            </Show>

            <div class="sheet-glass-body">{props.children}</div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export { GlassSheet };
export default GlassSheet;
