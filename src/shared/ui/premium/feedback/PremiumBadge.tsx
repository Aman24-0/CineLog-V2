// src/shared/ui/premium/feedback/PremiumBadge.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Badge visual variant */
type BadgeVariant = "default" | "accent" | "glow" | "success" | "warning" | "danger" | "info";

/** Badge size preset */
type BadgeSize = "compact" | "default" | "large";

/** Badge position for overlaying on a parent element */
type BadgePosition = "default" | "top-right" | "top-left";

// ─── Token Maps ────────────────────────────────────────────────

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-tier-2 border-hairline text-text-body",
  accent: "bg-glass text-primary border-glass-border",
  glow: "bg-primary text-on-primary shadow-glow",
  success: "bg-success text-on-primary",
  warning: "bg-warning text-on-primary",
  danger: "bg-danger text-on-primary",
  info: "bg-info text-on-primary",
};

const sizeClasses: Record<BadgeSize, string> = {
  compact: "p-1 text-2xs gap-1 min-w-4 h-4",
  default: "p-2 px-3 text-xs gap-1 min-w-5 h-5",
  large: "p-2 px-4 text-sm gap-2 min-w-6 h-6",
};

const iconSizeMap: Record<BadgeSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
  large: "text-sm",
};

const positionClasses: Record<BadgePosition, string> = {
  default: "",
  "top-right": "absolute -top-1 -right-1 z-badge",
  "top-left": "absolute -top-1 -left-1 z-badge",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumBadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  /** Visual variant. @default "default" */
  variant?: BadgeVariant;
  /** Size preset. @default "default" */
  size?: BadgeSize;
  /** Material Symbol icon name, rendered before children. */
  icon?: string;
  /** Render icon with FILL=1 (filled style). @default false */
  iconFill?: boolean;
  /** Show a small colored dot indicator. @default false */
  dot?: boolean;
  /** Notification count number. */
  count?: number;
  /** Max count before showing "N+" (e.g. 99 → "99+"). @default 99 */
  maxCount?: number;
  /** Position for overlaying on a parent element. @default "default" */
  position?: BadgePosition;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<PremiumBadgeProps, "variant" | "size" | "iconFill" | "dot" | "maxCount" | "position">
> = {
  variant: "default",
  size: "default",
  iconFill: false,
  dot: false,
  maxCount: 99,
  position: "default",
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumBadge — a badge indicator for counts, statuses, and overlay markers.
 *
 * Supports seven visual variants (default, accent, glow, success, warning,
 * danger, info), three sizes, optional icon, dot indicator, notification
 * count with max-count truncation, and absolute positioning for overlaying
 * on parent elements.
 *
 * **Count display:** When `count` is provided, the number is displayed.
 * If count exceeds `maxCount`, it shows "{maxCount}+" (e.g. "99+").
 *
 * **Position:** Set to "top-right" or "top-left" for absolute positioning
 * on a parent element (parent must have `position: relative`).
 *
 * **Font:** Uses font-label with uppercase for text badges.
 *
 * @example
 * ```tsx
 * <PremiumBadge variant="glow" count={5} />
 *
 * <PremiumBadge variant="danger" position="top-right" count={120} maxCount={99} />
 *
 * <PremiumBadge variant="success" icon="check_circle" iconFill>
 *   Verified
 * </PremiumBadge>
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-*, --hairline-*, --p, --p-glow, --on-primary, --glass-bg,
 *   --glass-border, --color-success/warning/danger/info
 * - Spacing: --space-1 through --space-4
 * - Radius: --radius-pill
 * - Shadows: --shadow-glow
 * - Typography: --font-family-label, --font-size-2xs/xs/sm
 * - Z-index: --z-badge
 */
const PremiumBadge: Component<PremiumBadgeProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "variant", "size", "icon", "iconFill", "dot", "count", "maxCount",
    "position", "class", "style", "children",
  ]);

  const iconFontVariation = (): string =>
    local.iconFill
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";

  /** Format count display: number or "N+" if exceeds max */
  const displayCount = (): string | null => {
    if (local.count === undefined || local.count === null) return null;
    if (local.count > local.maxCount) return `${local.maxCount}+`;
    return String(local.count);
  };

  const computedClass = (): string => {
    const base = [
      "inline-flex items-center justify-center",
      "font-label font-semibold tracking-label uppercase",
      "border rounded-pill",
      "select-none whitespace-nowrap",
      variantClasses[local.variant],
      sizeClasses[local.size],
      positionClasses[local.position],
    ];

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  return (
    <span
      {...rest}
      class={computedClass()}
      style={local.style}
      role="status"
      aria-label={
        local.count !== undefined && local.count !== null
          ? `${local.count} notifications`
          : undefined
      }
    >
      {/* Dot indicator */}
      <Show when={local.dot}>
        <span
          class="rounded-full w-1 h-1 bg-primary flex-shrink-0"
          aria-hidden="true"
        />
      </Show>

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

      {/* Count */}
      <Show when={displayCount() !== null}>
        <span>{displayCount()}</span>
      </Show>

      {/* Text children */}
      <Show when={local.children && displayCount() === null}>
        <span class="inline-flex items-center">{local.children}</span>
      </Show>
    </span>
  );
};

export { PremiumBadge };
export default PremiumBadge;
