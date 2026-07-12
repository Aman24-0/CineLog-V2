// src/shared/ui/premium/buttons/PremiumIconButton.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Icon button visual variant */
type IconButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** Icon button size */
type IconButtonSize = "compact" | "default" | "large";

// ─── Props ─────────────────────────────────────────────────────

interface PremiumIconButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant */
  variant?: IconButtonVariant;
  /** Size: compact (32px), default (44px touch target), large (52px) */
  size?: IconButtonSize;
  /** Material Symbol icon name (required) */
  icon: string;
  /** Render icon with FILL=1 (filled style) */
  iconFill?: boolean;
  /** Show loading spinner and disable interaction */
  loading?: boolean;
  /** Disable the button */
  disabled?: boolean;
  /** Accessible label (required for screen readers) */
  label: string;
  /** Selected/toggle state — accent border + dim background */
  selected?: boolean;
  /** Notification badge count (shown in top-right corner) */
  badge?: number;
}

// ─── Variant Class Maps ────────────────────────────────────────

const variantClasses: Record<IconButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary shadow-glow hover:brightness-110",
  secondary:
    "bg-tier-2 text-primary border border-hairline-2 hover:bg-tier-3",
  ghost:
    "bg-transparent text-primary hover:bg-primary-dim",
  danger:
    "bg-danger text-on-primary hover:brightness-110",
};

// ─── Size Maps ─────────────────────────────────────────────────

const sizeClasses: Record<IconButtonSize, string> = {
  compact: "w-8 h-8 text-sm",
  default:  "w-11 h-11 text-md",
  large:    "w-13 h-13 text-lg",
};

const sizePx: Record<IconButtonSize, string> = {
  compact: "32px",
  default:  "44px",
  large:    "52px",
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumIconButton — compact circular icon-only button with
 * optional notification badge, loading state, and selected state.
 *
 * @example
 * ```tsx
 * <PremiumIconButton
 *   variant="ghost"
 *   icon="favorite"
 *   iconFill={liked()}
 *   label="Like this movie"
 *   selected={liked()}
 *   badge={3}
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --color-primary, --color-on-primary, --tier-*,
 *   --color-danger, --hairline-2, --color-primary-dim
 * - Spacing: --space-* (w-8, w-11, w-13)
 * - Radius: --radius-full
 * - Shadows: --shadow-glow
 * - Motion: --dur-fast, --ease-spring
 * - Opacity: --opacity-disabled
 * - Z-index: --z-badge
 */
const PremiumIconButton: Component<PremiumIconButtonProps> = (rawProps) => {
  const props = mergeProps(
    {
      variant: "ghost" as IconButtonVariant,
      size: "default" as IconButtonSize,
      iconFill: false,
      loading: false,
      disabled: false,
      selected: false,
    },
    rawProps,
  );

  const [local, rest] = splitProps(props, [
    "variant", "size", "icon", "iconFill", "loading", "disabled",
    "label", "selected", "badge", "class", "style", "onClick",
  ]);

  const isDisabled = (): boolean => local.disabled || local.loading;

  const iconFontVariation = (): string =>
    local.iconFill
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";

  const handleClick = (e: MouseEvent) => {
    if (isDisabled()) return;
    (local.onClick as ((e: MouseEvent) => void) | undefined)?.(e);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isDisabled()) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLButtonElement).click();
    }
  };

  const computedClass = (): string => {
    const base = [
      "relative inline-flex items-center justify-center",
      "rounded-full transition-all duration-fast ease-spring",
      "focus-ring cursor-pointer select-none",
      "active:scale-[0.93]",
      variantClasses[local.variant],
      sizeClasses[local.size],
    ];

    if (local.selected) base.push("border-2 border-primary bg-primary-dim");
    if (isDisabled()) base.push("opacity-disabled pointer-events-none cursor-not-allowed");

    return base.join(" ");
  };

  return (
    <button
      {...rest}
      class={`${computedClass()}${local.class ? ` ${local.class}` : ""}`}
      style={{
        width: sizePx[local.size],
        height: sizePx[local.size],
        ...(typeof local.style === "object" ? local.style : {}),
      }}
      disabled={isDisabled()}
      aria-label={local.label}
      aria-busy={local.loading || undefined}
      aria-disabled={isDisabled() || undefined}
      aria-pressed={local.selected || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Loading spinner replaces icon */}
      <Show
        when={!local.loading}
        fallback={
          <span
            class="animate-spin inline-block rounded-full border-2 border-current border-t-transparent"
            style={{
              width: "var(--space-4)",
              height: "var(--space-4)",
            }}
            aria-hidden="true"
          />
        }
      >
        <span
          class="material-symbols-outlined"
          style={{ "font-variation-settings": iconFontVariation() }}
          aria-hidden="true"
        >
          {local.icon}
        </span>
      </Show>

      {/* Notification badge */}
      <Show when={local.badge !== undefined && local.badge > 0}>
        <span
          class="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-danger text-on-primary font-semibold z-badge"
          style={{
            "min-width": "var(--space-4)",
            height: "var(--space-4)",
            "font-size": "var(--font-size-2xs)",
            padding: "0 var(--space-1)",
          }}
          aria-label={`${local.badge} notifications`}
        >
          {local.badge!}
        </span>
      </Show>
    </button>
  );
};

export { PremiumIconButton };
export default PremiumIconButton;
