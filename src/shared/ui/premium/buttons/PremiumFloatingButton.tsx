// src/shared/ui/premium/buttons/PremiumFloatingButton.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** FAB visual variant */
type FabVariant = "primary" | "secondary";

/** FAB size */
type FabSize = "default" | "large";

/** FAB position */
type FabPosition = "bottom-right" | "bottom-center" | "bottom-left";

// ─── Props ─────────────────────────────────────────────────────

interface PremiumFloatingButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant: primary (accent fill + glow) or secondary (glass surface) */
  variant?: FabVariant;
  /** Size preset */
  size?: FabSize;
  /** Material Symbol icon name */
  icon?: string;
  /** Text label (shown when extended=true) */
  label?: string;
  /** Position on screen */
  position?: FabPosition;
  /** Show label next to icon (extended FAB) */
  extended?: boolean;
  /** Disable the button */
  disabled?: boolean;
}

// ─── Variant Class Maps ────────────────────────────────────────

const variantClasses: Record<FabVariant, string> = {
  primary:
    "bg-primary text-on-primary shadow-glow hover:brightness-110",
  secondary:
    "bg-glass-strong text-text-strong border border-glass-border backdrop-blur-lg hover:bg-glass",
};

// ─── Size Maps ─────────────────────────────────────────────────

const sizePx: Record<FabSize, string> = {
  default: "56px",
  large:   "72px",
};

const iconSizeClass: Record<FabSize, string> = {
  default: "text-xl",
  large:   "text-2xl",
};

// ─── Position Maps ─────────────────────────────────────────────

const positionStyles: Record<FabPosition, JSX.CSSProperties> = {
  "bottom-right": {
    position: "fixed",
    bottom: "calc(var(--nav-total-height) + var(--space-4))",
    right: "var(--space-4)",
  },
  "bottom-center": {
    position: "fixed",
    bottom: "calc(var(--nav-total-height) + var(--space-4))",
    left: "50%",
    transform: "translateX(-50%)",
  },
  "bottom-left": {
    position: "fixed",
    bottom: "calc(var(--nav-total-height) + var(--space-4))",
    left: "var(--space-4)",
  },
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumFloatingButton — a floating action button (FAB) with
 * primary (accent + glow) or secondary (glass) variants, positioning,
 * and extended label support.
 *
 * @example
 * ```tsx
 * <PremiumFloatingButton
 *   variant="primary"
 *   icon="add"
 *   label="Add Movie"
 *   extended
 *   position="bottom-right"
 *   onClick={handleAdd}
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --color-primary, --color-on-primary, --glass-bg-strong,
 *   --glass-border, --color-text-strong
 * - Spacing: --space-4
 * - Radius: --radius-xl
 * - Shadows: --shadow-glow
 * - Z-index: --z-sticky
 * - Motion: --dur-modal, --ease-smooth, animate-pop-in
 * - Blur: --blur-lg
 */
const PremiumFloatingButton: Component<PremiumFloatingButtonProps> = (rawProps) => {
  const props = mergeProps(
    {
      variant: "primary" as FabVariant,
      size: "default" as FabSize,
      position: "bottom-right" as FabPosition,
      extended: false,
      disabled: false,
    },
    rawProps,
  );

  const [local, rest] = splitProps(props, [
    "variant", "size", "icon", "label", "position", "extended",
    "disabled", "class", "style", "onClick",
  ]);

  const handleClick = (e: MouseEvent) => {
    if (local.disabled) return;
    (local.onClick as ((e: MouseEvent) => void) | undefined)?.(e);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (local.disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLButtonElement).click();
    }
  };

  const computedClass = (): string => {
    const base = [
      "inline-flex items-center justify-center",
      "rounded-xl transition-all duration-modal ease-smooth",
      "focus-ring cursor-pointer select-none",
      "animate-pop-in",
      "z-sticky",
      variantClasses[local.variant],
    ];

    if (local.extended) {
      base.push("gap-2 px-6");
      base.push("h-14"); // standard extended FAB height
    }

    if (local.disabled) base.push("opacity-disabled pointer-events-none cursor-not-allowed");

    return base.join(" ");
  };

  const computedStyle = (): JSX.CSSProperties => {
    const pos = positionStyles[local.position];
    const sizeStyle: JSX.CSSProperties = local.extended
      ? {}
      : { width: sizePx[local.size], height: sizePx[local.size] };

    const userStyle = typeof local.style === "object" ? local.style : {};

    return { ...pos, ...sizeStyle, ...userStyle };
  };

  return (
    <button
      {...rest}
      class={`${computedClass()}${local.class ? ` ${local.class}` : ""}`}
      style={computedStyle()}
      disabled={local.disabled}
      aria-label={local.label || local.icon || "Floating action"}
      aria-disabled={local.disabled || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <Show when={local.icon}>
        <span
          class={`material-symbols-outlined ${iconSizeClass[local.size]}`}
          aria-hidden="true"
        >
          {local.icon}
        </span>
      </Show>

      <Show when={local.extended && local.label}>
        <span class="font-label font-semibold tracking-label text-sm whitespace-nowrap">
          {local.label}
        </span>
      </Show>
    </button>
  );
};

export { PremiumFloatingButton };
export default PremiumFloatingButton;
