// src/shared/ui/glass/GlassListItem.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Types ────────────────────────────────────────────────────

/** Visual variant. */
type ListItemVariant = "glass" | "subtle" | "accent";

/** Size/density preset. */
type ListItemSize = "compact" | "default" | "comfortable";

// ─── Token Maps ───────────────────────────────────────────────

const variantClasses: Record<ListItemVariant, string> = {
  glass: "bg-glass backdrop-blur-lg border border-glass-border rounded-md",
  subtle: "bg-transparent border-b border-hairline",
  accent: "bg-primary-dim border border-primary rounded-md shadow-glow"
};

const sizeClasses: Record<ListItemSize, string> = {
  compact: "p-2 gap-1.5",
  default: "p-3 gap-2",
  comfortable: "p-4 gap-3"
};

const imageSizeMap: Record<ListItemSize, string> = {
  compact: "w-8 h-8",
  default: "w-11 h-11",
  comfortable: "w-14 h-14"
};

const titleSizeMap: Record<ListItemSize, string> = {
  compact: "text-xs",
  default: "text-sm",
  comfortable: "text-md"
};

const subtitleSizeMap: Record<ListItemSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
  comfortable: "text-sm"
};

const iconSizeMap: Record<ListItemSize, string> = {
  compact: "text-md",
  default: "text-lg",
  comfortable: "text-xl"
};

// ─── Props ────────────────────────────────────────────────────

export interface GlassListItemProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Title text. */
  title: string;
  /** Optional subtitle text. */
  subtitle?: string;
  /** Material Symbol icon name (shown on the left when no image). */
  icon?: string;
  /** Render icon with FILL=1 (filled style). @default false */
  iconFill?: boolean;
  /** Thumbnail image URL (takes precedence over icon). */
  imageUrl?: string;
  /** Alt text for the thumbnail image. */
  imageAlt?: string;
  /** Custom trailing content (right side). */
  trailing?: JSX.Element;
  /** Visual variant. @default "glass" */
  variant?: ListItemVariant;
  /** Size preset. @default "default" */
  size?: ListItemSize;
  /** Whether the item is interactive (hover, click, keyboard). @default false */
  interactive?: boolean;
  /** Whether the item is in a selected state. @default false */
  selected?: boolean;
  /** Whether the item is disabled. @default false */
  disabled?: boolean;
  /** Click handler. */
  onClick?: (e: MouseEvent) => void;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<
  Pick<
    GlassListItemProps,
    "iconFill" | "variant" | "size" | "interactive" | "selected" | "disabled"
  >
> = {
  iconFill: false,
  variant: "glass",
  size: "default",
  interactive: false,
  selected: false,
  disabled: false
};

// ─── Component ────────────────────────────────────────────────

/**
 * GlassListItem — list item with image/icon, title, subtitle, and
 * trailing content. Supports interactive, selected, and disabled states.
 * Replaces PremiumListItem with glass styling defaults.
 */
const GlassListItem: Component<GlassListItemProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "title",
    "subtitle",
    "icon",
    "iconFill",
    "imageUrl",
    "imageAlt",
    "trailing",
    "variant",
    "size",
    "interactive",
    "selected",
    "disabled",
    "onClick",
    "class",
    "style"
  ]);

  const iconFontVariation = (): string =>
    local.iconFill
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";

  const isInteractive = () => local.interactive;

  const handleClick = (e: MouseEvent) => {
    if (local.disabled) return;
    local.onClick?.(e);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (local.disabled || !isInteractive()) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  };

  const itemClass = (): string => {
    const classes = [
      "flex items-center",
      variantClasses[local.selected ? "accent" : local.variant],
      sizeClasses[local.size]
    ];

    if (isInteractive() && !local.disabled) {
      classes.push(
        "cursor-pointer",
        "focus-ring",
        "transition-all duration-fast ease-standard",
        local.variant === "glass"
          ? "hover:bg-glass-strong hover:backdrop-blur-2xl"
          : "hover:bg-tier-3",
        "active:scale-[0.99]"
      );
    }

    if (local.disabled) {
      classes.push("opacity-disabled pointer-events-none cursor-not-allowed");
    }

    if (local.class) classes.push(local.class);

    return classes.filter(Boolean).join(" ");
  };

  return (
    <div
      {...rest}
      class={itemClass()}
      style={local.style}
      role={isInteractive() ? "button" : "listitem"}
      tabindex={isInteractive() && !local.disabled ? 0 : undefined}
      aria-disabled={local.disabled || undefined}
      aria-selected={local.selected || undefined}
      aria-label={isInteractive() ? local.title : undefined}
      onClick={isInteractive() ? handleClick : undefined}
      onKeyDown={isInteractive() ? handleKeyDown : undefined}
    >
      {/* Image (takes precedence over icon) */}
      <Show
        when={local.imageUrl}
        fallback={
          <Show when={local.icon}>
            <span
              class={`material-symbols-outlined text-muted shrink-0 ${iconSizeMap[local.size]}`}
              style={{ "font-variation-settings": iconFontVariation() }}
              aria-hidden="true"
            >
              {local.icon}
            </span>
          </Show>
        }
      >
        <img
          src={local.imageUrl}
          alt={local.imageAlt ?? ""}
          class={`${imageSizeMap[local.size]} shrink-0 rounded-sm object-cover`}
          loading="lazy"
          decoding="async"
          width={
            local.size === "compact" ? 32 : local.size === "default" ? 44 : 56
          }
          height={
            local.size === "compact" ? 32 : local.size === "default" ? 44 : 56
          }
          draggable="false"
        />
      </Show>

      {/* Text content */}
      <div class="min-w-0 flex-1">
        <p
          class={`text-strong truncate font-body font-medium ${titleSizeMap[local.size]}`}
        >
          {local.title}
        </p>
        <Show when={local.subtitle}>
          <p
            class={`text-muted truncate font-body ${subtitleSizeMap[local.size]}`}
          >
            {local.subtitle}
          </p>
        </Show>
      </div>

      {/* Trailing content */}
      <Show when={local.trailing}>
        <div class="ml-auto shrink-0">{local.trailing}</div>
      </Show>
    </div>
  );
};

export { GlassListItem };
export default GlassListItem;
