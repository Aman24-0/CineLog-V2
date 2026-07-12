// src/shared/ui/premium/surfaces/PremiumOverlay.tsx
import { Component, JSX, splitProps, mergeProps, Show, onCleanup } from "solid-js";

// ─── Variant Types ─────────────────────────────────────────────

/** Overlay opacity strength. */
type OverlayStrength = "light" | "default" | "heavy";

/** Backdrop blur intensity. */
type OverlayBlur = "none" | "sm" | "md" | "lg";

// ─── Token Maps ────────────────────────────────────────────────

const strengthOpacityMap: Record<OverlayStrength, number> = {
  light: 0.3,
  default: 0.5,
  heavy: 0.7,
};

const blurMap: Record<OverlayBlur, string> = {
  none: "",
  sm: "backdrop-blur-sm",   // --blur-sm (8px)
  md: "backdrop-blur-md",   // --blur-md (12px)
  lg: "backdrop-blur-lg",   // --blur-lg (20px)
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumOverlayProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Whether the overlay is visible. When false, the overlay is not rendered. @default false */
  visible?: boolean;
  /** Overlay opacity strength: light (30%), default (50%), heavy (70%). @default "default" */
  strength?: OverlayStrength;
  /** Backdrop blur intensity. @default "none" */
  blur?: OverlayBlur;
  /** Called when the overlay is clicked (for dismiss behavior). */
  onClose?: () => void;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumOverlayProps,
  "visible" | "strength" | "blur"
>> = {
  visible: false,
  strength: "default",
  blur: "none",
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumOverlay — a full-screen overlay/backdrop for modal-like contexts.
 *
 * Renders a fixed-position overlay covering the entire viewport with
 * configurable opacity and optional backdrop blur. Designed as a
 * non-modal backdrop layer (not a dialog), providing visual isolation
 * for sheets, drawers, and overlay panels.
 *
 * **Strength variants:**
 * - `light` — 30% opacity; subtle dimming for inline overlays
 * - `default` — 50% opacity; standard modal backdrop
 * - `heavy` — 70% opacity; deep focus for critical/confirmation dialogs
 *
 * **Blur** applies backdrop-filter using the project's blur tokens:
 * - `none` — no blur (default for performance)
 * - `sm` — 8px blur for gentle depth
 * - `md` — 12px blur for moderate isolation
 * - `lg` — 20px blur for strong frosted effect
 *
 * **Click to close** — when `onClose` is provided, clicking the overlay
 * triggers the callback. This is the standard dismiss pattern for
 * non-modal overlays.
 *
 * **Accessibility:**
 * - `role="presentation"` — this is a non-interactive backdrop, not a dialog
 * - `aria-hidden="true"` — the overlay itself is not announced
 * - No focus trap (use a proper modal component for that)
 * - When visible, body scroll is locked to prevent background scrolling
 *
 * **Animation:**
 * - Fade-in with `duration-base` (--dur-base = 220ms) timing
 * - Respects `prefers-reduced-motion` via global baseline
 *
 * **Z-index** uses `z-modal` (--z-modal = 100) for correct layering
 * above sticky elements but below toasts.
 *
 * @example
 * ```tsx
 * // Standard modal backdrop
 * <PremiumOverlay visible={showSheet} onClose={() => setSheetOpen(false)} />
 *
 * // Heavy backdrop with blur for confirmation dialogs
 * <PremiumOverlay visible={showConfirm} strength="heavy" blur="md" onClose={dismiss} />
 *
 * // Light overlay for inline context
 * <PremiumOverlay visible={showTooltip} strength="light" />
 * ```
 */
const PremiumOverlay: Component<PremiumOverlayProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "visible", "strength", "blur", "onClose", "class", "style",
  ]);

  /** Lock body scroll when overlay is visible. */
  const handleBodyScroll = () => {
    if (local.visible) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
  };

  // Run scroll lock effect reactively
  handleBodyScroll();

  // Cleanup on unmount
  onCleanup(() => {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  });

  /** Click handler for dismiss behavior. */
  const handleClick = (e: MouseEvent) => {
    // Only trigger if the click target is the overlay itself, not a child
    if (e.target === e.currentTarget) {
      local.onClose?.();
    }
  };

  /** Keyboard handler: Escape key triggers onClose. */
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      local.onClose?.();
    }
  };

  return (
    <Show when={local.visible}>
      <div
        {...rest}
        class={[
          "fixed",
          "inset-0",
          "z-modal",
          blurMap[local.blur],
          "animate-fade-in",
          local.class,
        ].filter(Boolean).join(" ")}
        style={(() => {
          const base: JSX.CSSProperties = {
            "background-color": "var(--void)",
            opacity: strengthOpacityMap[local.strength],
          };
          if (local.style && typeof local.style === "object") {
            Object.assign(base, local.style);
          }
          return base;
        })()}
        role="presentation"
        aria-hidden="true"
        onClick={local.onClose ? handleClick : undefined}
        onKeyDown={local.onClose ? handleKeyDown : undefined}
      />
    </Show>
  );
};

export { PremiumOverlay };
export default PremiumOverlay;
