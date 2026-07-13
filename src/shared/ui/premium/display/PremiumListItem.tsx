// src/shared/ui/premium/display/PremiumListItem.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Types ────────────────────────────────────────────────────

/** Visual variant. */
type ListItemVariant = "default" | "subtle";

/** Size/density preset. */
type ListItemSize = "compact" | "default" | "comfortable";

// ─── Token Maps ───────────────────────────────────────────────

const variantClasses: Record<ListItemVariant, string> = {
  default: "bg-tier-2 rounded-md",
  subtle: "bg-transparent border-b border-hairline",
};

const sizeClasses: Record<ListItemSize, string> = {
  compact: "p-2 gap-1.5",
  default: "p-3 gap-2",
  comfortable: "p-4 gap-3",
};

const imageSizeMap: Record<ListItemSize, string> = {
  compact: "w-8 h-8",
  default: "w-11 h-11",
  comfortable: "w-14 h-14",
};

const titleSizeMap: Record<ListItemSize, string> = {
  compact: "text-xs",
  default: "text-sm",
  comfortable: "text-md",
};

const subtitleSizeMap: Record<ListItemSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
  comfortable: "text-sm",
};

const iconSizeMap: Record<ListItemSize, string> = {
  compact: "text-md",
  default: "text-lg",
  comfortable: "text-xl",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumListItemProps extends JSX.HTMLAttributes<HTMLDivElement> {
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
  /** Visual variant. @default "default" */
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

const defaultProps: Required<Pick<PremiumListItemProps,
  "iconFill" | "variant" | "size" | "interactive" | "selected" | "disabled"
>> = {
  iconFill: false,
  variant: "default",
  size: "default",
  interactive: false,
  selected: false,
  disabled: false,
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumListItem — list item with image/icon, title, subtitle, and
 * trailing content. Supports interactive, selected, and disabled states.
 *
 * Default variant: tier-2 bg with rounded corners.
 * Subtle variant: transparent bg with bottom border.
 * Selected: accent bg tint.
 * Interactive: hover effects, click, and keyboard activation.
 *
 * @example
 * ```tsx
 * <PremiumListItem
 *   title="Inception"
 *   subtitle="2010 · Sci-Fi"
 *   imageUrl="/poster.jpg"
 *   trailing={<PremiumStatusBadge status="completed" dotOnly />}
 *   interactive
 *   onClick={() => navigate()}
 * />
 * <PremiumListItem
 *   title="Add to Watchlist"
 *   icon="add"
 *   interactive
 *   variant="subtle"
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-2, --hairline, --color-text-strong, --color-text-soft,
 *   --color-text-muted, --color-primary, --color-primary-dim
 * - Typography: --font-family-body
 * - Spacing: --space-2 through --space-4
 * - Radius: --radius-md
 * - Motion: --dur-fast, --ease-standard
 * - Opacity: --opacity-disabled
 */
const PremiumListItem: Component<PremiumListItemProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "title", "subtitle", "icon", "iconFill", "imageUrl", "imageAlt",
    "trailing", "variant", "size", "interactive", "selected", "disabled",
    "onClick", "class", "style",
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
    if (local.disabled || !local.interactive) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  };

  const itemClass = (): string => {
    const classes = [
      "flex items-center",
      variantClasses[local.variant],
      sizeClasses[local.size],
    ];

    if (local.interactive && !local.disabled) {
      classes.push(
        "cursor-pointer",
        "focus-ring",
        "transition-[background-color,border-color,transform]",
        "duration-fast",
        "ease-standard",
        "hover:bg-tier-3",
        "active:scale-[0.99]",
        "active:duration-micro",
      );
    }

    if (local.selected) {
      classes.push("bg-primary-dim border-primary");
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
      role={local.interactive ? "button" : "listitem"}
      tabindex={local.interactive && !local.disabled ? 0 : undefined}
      aria-disabled={local.disabled || undefined}
      aria-selected={local.selected || undefined}
      aria-label={local.interactive ? local.title : undefined}
      onClick={local.interactive ? handleClick : undefined}
      onKeyDown={local.interactive ? handleKeyDown : undefined}
    >
      {/* Image (takes precedence over icon) */}
      <Show when={local.imageUrl} fallback={
        <Show when={local.icon}>
          <span
            class={`material-symbols-outlined text-muted shrink-0 ${iconSizeMap[local.size]}`}
            style={{ "font-variation-settings": iconFontVariation() }}
            aria-hidden="true"
          >
            {local.icon}
          </span>
        </Show>
      }>
        <img
          src={local.imageUrl}
          alt={local.imageAlt ?? ""}
          class={`${imageSizeMap[local.size]} rounded-sm object-cover shrink-0`}
          draggable="false"
        />
      </Show>

      {/* Text content */}
      <div class="flex-1 min-w-0">
        <p class={`font-body font-medium text-strong truncate ${titleSizeMap[local.size]}`}>
          {local.title}
        </p>
        <Show when={local.subtitle}>
          <p class={`font-body text-muted truncate ${subtitleSizeMap[local.size]}`}>
            {local.subtitle}
          </p>
        </Show>
      </div>

      {/* Trailing content */}
      <Show when={local.trailing}>
        <div class="shrink-0 ml-auto">
          {local.trailing}
        </div>
      </Show>
    </div>
  );
};

export { PremiumListItem };
export default PremiumListItem;
