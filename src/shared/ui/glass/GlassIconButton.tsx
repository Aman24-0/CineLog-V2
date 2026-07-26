// src/shared/ui/glass/GlassIconButton.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Icon button visual variant */
type IconButtonVariant = "primary" | "secondary" | "glass" | "ghost" | "danger";

/** Icon button size */
type IconButtonSize = "compact" | "default" | "large";

// ─── Props ─────────────────────────────────────────────────────

export interface GlassIconButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant. @default "secondary" */
  variant?: IconButtonVariant;
  /** Size: compact (32px), default (44px touch target), large (52px). @default "default" */
  size?: IconButtonSize;
  /** Material Symbol icon name (required) */
  icon: string;
  /** Render icon with FILL=1 (filled style). @default false */
  iconFill?: boolean;
  /** Show loading spinner and disable interaction. @default false */
  loading?: boolean;
  /** Disable the button. @default false */
  disabled?: boolean;
  /** Accessible label (required for screen readers) */
  label: string;
  /** Selected/toggle state. @default false */
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
  glass:
    "bg-glass backdrop-blur-lg text-primary border border-glass-border hover:bg-glass-strong hover:backdrop-blur-2xl",
  ghost:
    "bg-transparent text-primary hover:bg-primary-dim",
  danger:
    "bg-danger text-on-primary hover:brightness-110",
};

// ─── Size Class Maps ───────────────────────────────────────────

const sizeClasses: Record<IconButtonSize, { btn: string; icon: string }> = {
  compact: { btn: "w-8 h-8", icon: "text-md" },
  default: { btn: "w-11 h-11", icon: "text-lg" },
  large:   { btn: "w-13 h-13", icon: "text-xl" },
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassIconButton — full-featured icon button with variants (including glass),
 * sizes, states, loading, disabled, selected, and badge support.
 */
const GlassIconButton: Component<GlassIconButtonProps> = (rawProps) => {
  const props = mergeProps(
    {
      variant: "secondary" as IconButtonVariant,
      size: "default" as IconButtonSize,
      loading: false,
      disabled: false,
      iconFill: false,
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
      "inline-flex items-center justify-center relative",
      "rounded-full transition-all duration-fast ease-spring flex-shrink-0",
      "focus-ring cursor-pointer select-none",
      "active:scale-[0.95]",
      variantClasses[local.variant],
      sizeClasses[local.size].btn,
    ];

    if (local.selected) base.push("border-2 border-primary bg-primary-dim text-primary");
    if (isDisabled()) base.push("opacity-disabled pointer-events-none cursor-not-allowed");
    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  return (
    <button
      {...rest}
      class={computedClass()}
      style={local.style}
      disabled={isDisabled()}
      aria-busy={local.loading || undefined}
      aria-disabled={isDisabled() || undefined}
      aria-pressed={local.selected || undefined}
      aria-label={local.label}
      title={local.label}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <Show
        when={!local.loading}
        fallback={
          <span
            class="animate-spin inline-block rounded-full border-2 border-current border-t-transparent"
            style={{ width: "1.2em", height: "1.2em", "border-width": "2px" }}
            aria-hidden="true"
          />
        }
      >
        <span
          class={`material-symbols-outlined ${sizeClasses[local.size].icon}`}
          style={{ "font-variation-settings": iconFontVariation() }}
          aria-hidden="true"
        >
          {local.icon}
        </span>
      </Show>

      {/* Badge */}
      <Show when={local.badge !== undefined && local.badge > 0 && !local.loading}>
        <span
          class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-[4px] font-mono text-[9px] font-bold text-on-primary shadow-glow"
          aria-hidden="true"
        >
          {local.badge! > 99 ? "99+" : local.badge}
        </span>
      </Show>
    </button>
  );
};

export { GlassIconButton };
export default GlassIconButton;
