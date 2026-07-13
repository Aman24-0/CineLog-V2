// src/shared/ui/premium/chips/PremiumChip.tsx
import { ParentComponent, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Chip visual variant */
type ChipVariant = "default" | "accent" | "outline" | "filled";

/** Chip size preset */
type ChipSize = "compact" | "default";

/** Chip status / semantic color */
type ChipColor =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "watching"
  | "completed"
  | "planned"
  | "paused"
  | "dropped";

// ─── Token Maps ────────────────────────────────────────────────

const variantClasses: Record<ChipVariant, string> = {
  default: "bg-tier-2 border-hairline text-text-body",
  accent: "text-primary",
  outline: "bg-transparent border-primary text-primary",
  filled: "bg-primary text-on-primary",
};

const selectedVariantClasses: Record<ChipVariant, string> = {
  default: "bg-primary-dim border-primary text-primary",
  accent: "bg-primary-dim border-primary text-primary",
  outline: "bg-primary-dim border-primary text-primary",
  filled: "bg-primary text-on-primary",
};

const sizeClasses: Record<ChipSize, string> = {
  compact: "p-1 px-2 text-2xs gap-1",
  default: "p-2 px-3 text-xs gap-1",
};

const colorBgMap: Record<ChipColor, string> = {
  default: "",
  success: "bg-success-bg border-success-border text-success",
  warning: "bg-warning-bg border-warning-border text-warning",
  danger: "bg-danger-bg border-danger-border text-danger",
  info: "bg-info-bg border-info-border text-info",
  watching: "bg-watching-bg border-watching text-watching",
  completed: "bg-completed-bg border-completed text-completed",
  planned: "bg-planned-bg border-planned text-planned",
  paused: "bg-paused-bg border-paused text-paused",
  dropped: "bg-dropped-bg border-dropped text-dropped",
};

const iconSizeMap: Record<ChipSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumChipProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant. @default "default" */
  variant?: ChipVariant;
  /** Size preset. @default "default" */
  size?: ChipSize;
  /** Whether the chip is selected/toggled on. @default false */
  selected?: boolean;
  /** Whether the chip is disabled. @default false */
  disabled?: boolean;
  /** Material Symbol icon name, rendered before children. */
  icon?: string;
  /** Render icon with FILL=1 (filled style). @default false */
  iconFill?: boolean;
  /** Show a remove/X button on the right. @default false */
  removable?: boolean;
  /** Callback when the remove button is clicked. */
  onRemove?: (e: MouseEvent) => void;
  /** Callback when the chip is clicked (toggle). */
  onClick?: (e: MouseEvent) => void;
  /** Semantic status color override — takes precedence over variant bg. @default "default" */
  color?: ChipColor;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<
    PremiumChipProps,
    "variant" | "size" | "selected" | "disabled" | "iconFill" | "removable" | "color"
  >
> = {
  variant: "default",
  size: "default",
  selected: false,
  disabled: false,
  iconFill: false,
  removable: false,
  color: "default",
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumChip — a toggle/selectable chip with variants, sizes, and status colors.
 *
 * Supports four visual variants (default, accent, outline, filled), two sizes
 * (compact, default), toggle selection state, removable action, and semantic
 * status colors. Fully accessible with `aria-pressed`, keyboard activation,
 * focus rings, and `prefers-reduced-motion` support.
 *
 * **Variant behavior:**
 * - `default` — tier-2 bg, hairline border; selected → accent bg + accent text
 * - `accent`  — accent-tinted bg (--p-dim), accent text
 * - `outline` — transparent bg, accent border, accent text
 * - `filled`  — accent bg (--p), dark text (--on-primary)
 *
 * **Color** overrides the background/text when set to a non-"default" value,
 * applying status-specific bg/border/text tokens.
 *
 * @example
 * ```tsx
 * <PremiumChip variant="accent" selected={isActive()} onClick={toggle}>
 *   Action
 * </PremiumChip>
 *
 * <PremiumChip color="watching" icon="play_circle" removable onRemove={remove}>
 *   Watching
 * </PremiumChip>
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-*, --hairline-*, --p, --p-dim, --p-glow, --on-primary,
 *   --color-success/warning/danger/info, --color-status-*
 * - Spacing: --space-1 through --space-3
 * - Radius: --radius-pill
 * - Motion: --dur-fast, --ease-spring
 * - Opacity: --opacity-disabled
 */
const PremiumChip: ParentComponent<PremiumChipProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "variant", "size", "selected", "disabled", "icon", "iconFill",
    "removable", "onRemove", "onClick", "color", "class", "style", "children",
  ]);

  const iconFontVariation = (): string =>
    local.iconFill
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";

  const handleClick = (e: MouseEvent) => {
    if (local.disabled) return;
    local.onClick?.(e);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (local.disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLButtonElement).click();
    }
  };

  const handleRemoveClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (local.disabled) return;
    local.onRemove?.(e);
  };

  const handleRemoveKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRemoveClick(e as unknown as MouseEvent);
    }
  };

  const computedClass = (): string => {
    const base = [
      "inline-flex items-center",
      "font-label font-semibold tracking-label",
      "border rounded-pill",
      "transition-all duration-fast ease-spring",
      "focus-ring",
      "select-none",
    ];

    // Variant or color bg
    if (local.color !== "default") {
      base.push(colorBgMap[local.color]);
    } else if (local.selected) {
      base.push(selectedVariantClasses[local.variant]);
    } else {
      base.push(variantClasses[local.variant]);
    }

    base.push(sizeClasses[local.size]);

    if (local.disabled) {
      base.push("opacity-disabled pointer-events-none cursor-not-allowed");
    } else {
      base.push("cursor-pointer");
    }

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  return (
    <button
      {...rest}
      class={computedClass()}
      style={local.style}
      role="switch"
      aria-pressed={local.selected || undefined}
      aria-disabled={local.disabled || undefined}
      disabled={local.disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Icon */}
      <Show when={local.icon}>
        <span
          class={`material-symbols-outlined ${iconSizeMap[local.size]}`}
          style={{ "font-variation-settings": iconFontVariation() }}
          aria-hidden="true"
        >
          {local.icon}
        </span>
      </Show>

      {/* Label */}
      <Show when={local.children}>
        <span class="inline-flex items-center">{local.children}</span>
      </Show>

      {/* Remove button */}
      <Show when={local.removable}>
        <span
          class={`material-symbols-outlined ${iconSizeMap[local.size]} opacity-muted hover:opacity-full transition-opacity duration-micro`}
          style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
          role="button"
          tabindex={local.disabled ? -1 : 0}
          aria-label="Remove"
          onClick={handleRemoveClick}
          onKeyDown={handleRemoveKeyDown}
        >
          close
        </span>
      </Show>
    </button>
  );
};

export { PremiumChip };
export default PremiumChip;
