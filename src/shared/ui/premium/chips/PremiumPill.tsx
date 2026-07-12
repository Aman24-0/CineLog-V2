// src/shared/ui/premium/chips/PremiumPill.tsx
import { ParentComponent, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Pill visual variant */
type PillVariant = "default" | "accent" | "glass";

/** Pill size preset */
type PillSize = "compact" | "default" | "large";

// ─── Token Maps ────────────────────────────────────────────────

const variantClasses: Record<PillVariant, string> = {
  default: "bg-tier-2",
  accent: "bg-primary-dim",
  glass: "bg-glass backdrop-blur-lg border-glass-border",
};

const sizeClasses: Record<PillSize, string> = {
  compact: "p-1 px-2 text-2xs gap-1",
  default: "p-2 px-3 text-xs gap-2",
  large: "p-3 px-5 text-sm gap-2",
};

const iconSizeMap: Record<PillSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
  large: "text-sm",
};

const dotSizeMap: Record<PillSize, string> = {
  compact: "w-1 h-1",
  default: "w-2 h-2",
  large: "w-2 h-2",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumPillProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  /** Visual variant. @default "default" */
  variant?: PillVariant;
  /** Size preset. @default "default" */
  size?: PillSize;
  /** Material Symbol icon name, rendered before children. */
  icon?: string;
  /** Render icon with FILL=1 (filled style). @default false */
  iconFill?: boolean;
  /** Show a small colored dot indicator before text. @default false */
  dot?: boolean;
  /** CSS color for the dot indicator (e.g. "var(--color-success)"). */
  dotColor?: string;
  /** Whether the pill is interactive/clickable. @default false */
  interactive?: boolean;
  /** Whether the interactive pill is selected/toggled. @default false */
  selected?: boolean;
  /** Whether the interactive pill is disabled. @default false */
  disabled?: boolean;
  /** Click handler for interactive pills. */
  onClick?: (e: MouseEvent) => void;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<
    PremiumPillProps,
    "variant" | "size" | "iconFill" | "dot" | "dotColor" | "interactive" | "selected" | "disabled"
  >
> = {
  variant: "default",
  size: "default",
  iconFill: false,
  dot: false,
  dotColor: "var(--p)",
  interactive: false,
  selected: false,
  disabled: false,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumPill — a pill-shaped container for labels, tags, and status indicators.
 *
 * Supports three visual variants (default, accent, glass), three sizes
 * (compact, default, large), optional icon, optional colored dot, and
 * interactive mode with toggle selection. Fully accessible with proper
 * ARIA attributes, keyboard navigation, focus rings, and
 * prefers-reduced-motion support.
 *
 * **Variant behavior:**
 * - `default` — tier-2 bg, rounded-pill
 * - `accent`  — accent-tinted bg (--p-dim), rounded-pill
 * - `glass`   — glass-bg with backdrop blur, rounded-pill
 *
 * **Interactive** pills become clickable with toggle selection,
 * `role="switch"`, `aria-pressed`, and keyboard activation.
 *
 * @example
 * ```tsx
 * <PremiumPill variant="accent" icon="movie" dot dotColor="var(--color-success)">
 *   Completed
 * </PremiumPill>
 *
 * <PremiumPill interactive selected={isOn()} onClick={toggle}>
 *   Toggle
 * </PremiumPill>
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-*, --p-dim, --glass-bg, --glass-border, --p
 * - Spacing: --space-1 through --space-5
 * - Radius: --radius-pill
 * - Blur: --blur-lg
 * - Motion: --dur-fast, --ease-spring
 * - Opacity: --opacity-disabled
 */
const PremiumPill: ParentComponent<PremiumPillProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "variant", "size", "icon", "iconFill", "dot", "dotColor",
    "interactive", "selected", "disabled", "onClick",
    "class", "style", "children",
  ]);

  const iconFontVariation = (): string =>
    local.iconFill
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";

  const handleClick = (e: MouseEvent) => {
    if (local.disabled || !local.interactive) return;
    local.onClick?.(e);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (local.disabled || !local.interactive) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  };

  const computedClass = (): string => {
    const base = [
      "inline-flex items-center",
      "font-label font-semibold tracking-label",
      "rounded-pill",
      "select-none",
      variantClasses[local.variant],
      sizeClasses[local.size],
    ];

    // Interactive styling
    if (local.interactive && !local.disabled) {
      base.push(
        "cursor-pointer",
        "focus-ring",
        "transition-all duration-fast ease-spring",
      );
      if (local.selected) {
        base.push("bg-primary-dim text-primary border border-primary");
      }
    }

    // Disabled state
    if (local.interactive && local.disabled) {
      base.push("opacity-disabled cursor-not-allowed pointer-events-none");
    }

    // Text color for non-glass, non-selected
    if (!local.selected && local.variant !== "glass") {
      base.push("text-text-body");
    }
    if (local.variant === "glass") {
      base.push("text-text-strong");
    }

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  const dotStyle = (): JSX.CSSProperties => ({
    "background-color": local.dotColor,
    width: "var(--space-2)",
    height: "var(--space-2)",
  });

  return (
    <span
      {...rest}
      class={computedClass()}
      style={local.style}
      role={local.interactive ? "switch" : undefined}
      tabindex={local.interactive && !local.disabled ? 0 : undefined}
      aria-pressed={local.interactive ? local.selected || undefined : undefined}
      aria-disabled={local.interactive && local.disabled ? true : undefined}
      onClick={handleClick}
      onKeyDown={local.interactive ? handleKeyDown : undefined}
    >
      {/* Colored dot */}
      <Show when={local.dot}>
        <span
          class={`rounded-full ${dotSizeMap[local.size]} flex-shrink-0`}
          style={dotStyle()}
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

      {/* Label content */}
      <Show when={local.children}>
        <span class="inline-flex items-center">{local.children}</span>
      </Show>
    </span>
  );
};

export { PremiumPill };
export default PremiumPill;
