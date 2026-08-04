// src/shared/ui/glass/GlassSheet.tsx
import {
  ParentComponent,
  JSX,
  Show,
  createSignal,
  onCleanup,
  onMount,
  mergeProps,
  createEffect
} from "solid-js";
import { Portal } from "solid-js/web";

// ─── Variant Types ─────────────────────────────────────────────

/** Sheet strength — controls backdrop blur and surface opacity. */
type SheetStrength = "default" | "strong";

/** Snap point — controls how far up the sheet rises. */
type SheetSnap = "compact" | "default" | "tall" | "full";

// ─── Token Maps ────────────────────────────────────────────────

const strengthBg: Record<SheetStrength, string> = {
  default: "bg-glass backdrop-blur-2xl",
  strong: "bg-glass-strong backdrop-blur-3xl"
};

const snapHeight: Record<SheetSnap, string> = {
  compact: "max-h-[40vh]",
  default: "max-h-[70vh]",
  tall: "max-h-[88vh]",
  full: "h-[95vh]"
};

// ─── Focus trap helpers ────────────────────────────────────────

/**
 * Selector for focusable elements inside the sheet. Used by the focus
 * trap to enumerate Tab targets in DOM order. Mirrors the standard
 * WAI-ARIA focusable selector (button / link / input / select /
 * textarea / [tabindex] >= 0), with `:not([disabled])` so disabled
 * controls are skipped.
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ─── Props ─────────────────────────────────────────────────────

export interface GlassSheetProps {
  /** Whether the sheet is open. */
  open: boolean;
  /** Called when the user dismisses the sheet (backdrop tap, ESC). */
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
  Pick<
    GlassSheetProps,
    "strength" | "snap" | "showHandle" | "disableBackdropClose" | "zIndexBase"
  >
> = {
  strength: "strong",
  snap: "default",
  showHandle: true,
  disableBackdropClose: false,
  zIndexBase: 999990
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
 *  - Slide-up entrance animation on mount (see CSS @keyframes sheet-slide-up)
 *  - Slide-down exit animation on close (see CSS @keyframes sheet-slide-down,
 *    applied via the `.sheet-glass-closing` class during the close transition)
 *
 * NOTE ON SWIPE-TO-DISMISS:
 *   This component does NOT currently implement a swipe-down gesture. The
 *   drag handle is decorative (visual cue only). Closing the sheet is done
 *   via backdrop tap, ESC, or the optional header close button. A swipe-
 *   down handler could be added later (touchstart → touchmove with a
 *   threshold → onClose) but is intentionally omitted now to keep the
 *   component small and avoid the touch-scroll conflicts that arise when
 *   the body has its own scrollable content.
 *
 * EXIT ANIMATION:
 *   When `open` transitions from true → false, the sheet plays a
 *   `sheet-slide-down` animation (the inverse of `sheet-slide-up`) before
 *   unmounting. This is implemented by:
 *     1. Tracking `prevOpen` in a closure (same pattern as the focus-restore
 *        effect).
 *     2. When the open→close edge is detected, set `closing(true)` so the
 *        JSX swaps the class from `animate-slide-up` to `sheet-glass-closing`.
 *     3. After the animation duration (var(--dur-modal, 320ms) + 10ms buffer),
 *        set `closing(false)` so the next render actually unmounts via the
 *        outer <Show when={props.open}>. The <Show> condition is OR'd with
 *        `closing()` so the sheet stays mounted during the animation.
 *
 * Accessibility:
 *  - role="dialog" aria-modal="true"
 *  - ESC closes the sheet (unless disableBackdropClose)
 *  - Backdrop tap closes (unless disableBackdropClose)
 *  - Focus moves into the sheet when it opens (auto-focuses
 *    the first focusable element, typically the close button)
 *  - Tab key is TRAPPED so keyboard focus cycles within the sheet
 *    while it's open — focus never escapes to the page behind.
 *  - When the sheet closes, focus is restored to the element that
 *    was focused just before the sheet opened (typically the trigger).
 */
const GlassSheet: ParentComponent<GlassSheetProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);

  // `closing` signal — set to true when `props.open` transitions from
  // true → false so the sheet can play its exit animation before
  // unmounting. Reset to false after the animation duration so the
  // <Show> condition below actually unmounts the Portal content.
  const [closing, setClosing] = createSignal(false);

  // Focus management:
  //   - `sheetSurfaceRef` — the inner surface div, used to query
  //     focusable elements for auto-focus + Tab trap.
  //   - `previouslyFocused` — the element that had focus before the
  //     sheet opened. Restored on close so keyboard users don't lose
  //     their place on the page.
  let sheetSurfaceRef: HTMLDivElement | undefined;
  let previouslyFocused: HTMLElement | null = null;
  // `prevOpen` tracks the previous `props.open` value so the
  // createEffect below can detect open/close transitions and run
  // its save/restore logic only on edges (not every render).
  let prevOpen = false;

  // ESC key + Tab trap handler.
  //
  // ESC: closes the sheet (unless disableBackdropClose).
  // Tab: traps focus inside the sheet surface. When the user Tabs
  //   past the last focusable element, focus wraps to the first.
  //   Shift+Tab on the first wraps to the last. This implements the
  //   WAI-ARIA focus-trap pattern for modal dialogs and prevents
  //   keyboard users from accidentally interacting with the page
  //   behind the sheet.
  onMount(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key === "Escape") {
        if (!props.disableBackdropClose) props.onClose();
        return;
      }
      if (e.key === "Tab" && sheetSurfaceRef) {
        const focusables = Array.from(
          sheetSurfaceRef.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter(
          (el) => el.offsetParent !== null || el === document.activeElement
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !sheetSurfaceRef.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !sheetSurfaceRef.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  // Auto-focus first focusable element when sheet opens + restore
  // focus to the trigger when it closes. Also drives the exit-animation
  // state: when `open` flips from true → false, set `closing(true)` so
  // the JSX swaps to the slide-down class, then clear it after the
  // animation duration so the outer <Show> unmounts.
  createEffect(() => {
    const isOpen = props.open;
    if (isOpen && !prevOpen) {
      // Opening — reset closing flag (in case a previous close was
      // interrupted by re-opening mid-animation) and clear any pending
      // closing timer.
      setClosing(false);
      // Save previously focused element (the trigger).
      if (typeof document !== "undefined") {
        previouslyFocused =
          (document.activeElement as HTMLElement | null) ?? null;
      }
      if (sheetSurfaceRef) {
        requestAnimationFrame(() => {
          if (!sheetSurfaceRef) return;
          const focusable =
            sheetSurfaceRef.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
          if (focusable) focusable.focus();
        });
      }
    } else if (!isOpen && prevOpen) {
      // Closing — kick off the exit animation by setting `closing(true)`.
      // The <Show> condition below is `props.open || closing()` so the
      // sheet stays mounted while the animation plays. After
      // var(--dur-modal, 320ms) + 10ms buffer, clear `closing` so the
      // <Show> finally unmounts. We also restore focus to the trigger
      // immediately (don't wait for the animation to finish — focus
      // should move out of the sheet BEFORE it slides out of view).
      setClosing(true);
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
      // Read the CSS variable for the animation duration. Fall back to
      // 320ms if unset (matches the default in glass-system.css).
      let durMs = 320;
      if (typeof window !== "undefined") {
        const raw = window
          .getComputedStyle(document.documentElement)
          .getPropertyValue("--dur-modal")
          .trim();
        if (raw) {
          const parsed = parseFloat(raw);
          if (!Number.isNaN(parsed) && parsed > 0) durMs = parsed;
        }
      }
      const timer = setTimeout(() => setClosing(false), durMs + 10);
      // If the sheet re-opens before the timer fires, clear it so we
      // don't accidentally unmount the freshly-opened sheet.
      onCleanup(() => clearTimeout(timer));
    }
    prevOpen = isOpen;
  });

  // `mounted` = open OR closing — keeps the Portal content alive while
  // the exit animation plays. Once `closing` flips back to false (after
  // the timer above), the <Show> unmounts for real.
  const mounted = () => props.open || closing();

  return (
    <Show when={mounted()}>
      <Portal>
        {/* Backdrop — fades out during the exit animation via the
            `sheet-backdrop-closing` class. The entrance animation is
            the same `animate-fade-in` as before. */}
        <div
          class={`fixed inset-0 z-[999990] ${closing() ? "sheet-backdrop-closing" : "animate-fade-in"}`}
          style={{
            "z-index": props.zIndexBase,
            background: "rgba(0,0,0,0.55)",
            "backdrop-filter": "blur(14px) saturate(120%)",
            "-webkit-backdrop-filter": "blur(14px) saturate(120%)"
          }}
          onClick={() => {
            if (!props.disableBackdropClose) props.onClose();
          }}
          aria-hidden="true"
        />
        {/* Sheet — swaps to `sheet-glass-closing` (slide-down) when
            `closing()` is true. The default class is `sheet-glass
            animate-slide-up` (slide-up entrance). */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={props.id ? `${props.id}-title` : undefined}
          class={`sheet-glass ${closing() ? "sheet-glass-closing" : "animate-slide-up"}`}
          style={{
            "z-index": props.zIndexBase + 1,
            ...({
              "--sheet-snap": snapHeight[props.snap]
            } as JSX.CSSProperties)
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
                  <div class="sheet-glass-header-right">
                    {props.headerRight}
                  </div>
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
