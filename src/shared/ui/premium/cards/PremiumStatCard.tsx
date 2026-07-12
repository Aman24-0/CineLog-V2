// src/shared/ui/premium/cards/PremiumStatCard.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Stat card visual variant controlling surface color and accent treatment. */
type StatVariant = "default" | "accent" | "success" | "warning" | "danger";

/** Stat card size controlling value/label scale and spacing. */
type StatSize = "compact" | "default" | "large";

/** Trend direction for the stat indicator. */
type StatTrend = "up" | "down" | "neutral";

// ─── Token Maps ────────────────────────────────────────────────

const variantClasses: Record<StatVariant, { bg: string; iconColor: string; border?: string }> = {
  default: {
    bg: "bg-tier-2",
    iconColor: "text-soft",
  },
  accent: {
    bg: "bg-tier-2",
    iconColor: "text-primary",
    border: "border border-primary",
  },
  success: {
    bg: "bg-success-bg",
    iconColor: "text-success",
    border: "border border-success-border",
  },
  warning: {
    bg: "bg-warning-bg",
    iconColor: "text-warning",
    border: "border border-warning-border",
  },
  danger: {
    bg: "bg-danger-bg",
    iconColor: "text-danger",
    border: "border border-danger-border",
  },
};

const sizeClasses: Record<StatSize, { value: string; label: string; icon: string; gap: string; padding: string }> = {
  compact: {
    value: "text-xl font-display text-strong",
    label: "text-2xs font-label text-muted uppercase tracking-eyebrow",
    icon: "text-md",
    gap: "gap-1",
    padding: "p-3",
  },
  default: {
    value: "text-3xl font-display text-strong",
    label: "text-xs font-label text-muted uppercase tracking-eyebrow",
    icon: "text-xl",
    gap: "gap-2",
    padding: "p-4",
  },
  large: {
    value: "text-5xl font-display text-strong",
    label: "text-sm font-label text-muted uppercase tracking-eyebrow",
    icon: "text-2xl",
    gap: "gap-3",
    padding: "p-6",
  },
};

const trendIconMap: Record<StatTrend, string> = {
  up: "trending_up",
  down: "trending_down",
  neutral: "trending_flat",
};

const trendColorMap: Record<StatTrend, string> = {
  up: "text-success",
  down: "text-danger",
  neutral: "text-muted",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumStatCardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** The primary stat value. */
  value: string | number;
  /** Label describing the stat. */
  label: string;
  /** Material Symbol icon name. */
  icon?: string;
  /** Render icon with FILL=1 (filled style). @default false */
  iconFill?: boolean;
  /** Visual variant. @default "default" */
  variant?: StatVariant;
  /** Size preset. @default "default" */
  size?: StatSize;
  /** Trend direction indicator. @default undefined (hidden) */
  trend?: StatTrend;
  /** Trend value text (e.g., "+12%"). */
  trendValue?: string;
  /** Whether the card is in a loading state — renders skeleton. @default false */
  loading?: boolean;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumStatCardProps,
  "variant" | "size" | "iconFill" | "loading"
>> & { trend?: StatTrend; trendValue?: string; icon?: string } = {
  variant: "default",
  size: "default",
  iconFill: false,
  loading: false,
  trend: undefined,
  trendValue: undefined,
  icon: undefined,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumStatCard — a stat display card with icon, value, label, and trend.
 *
 * Renders a compact stat card with a prominent value in font-display, a label
 * in font-label with muted color, an optional icon, and an optional trend
 * indicator with directional arrow.
 *
 * **Variants:**
 * - `default` — tier-2 surface with soft icon color
 * - `accent` — tier-2 surface with accent-tinted background (--p-dim),
 *   accent icon color (--p), and accent border
 * - `success` — success-bg surface with success icon/border
 * - `warning` — warning-bg surface with warning icon/border
 * - `danger` — danger-bg surface with danger icon/border
 *
 * **Trend** shows a directional arrow icon (up/down/flat) with the trendValue
 * text, colored according to direction (success for up, danger for down, muted
 * for neutral).
 *
 * **Loading** state renders a skeleton with shimmer animation.
 *
 * All transitions respect `prefers-reduced-motion` via global baseline.
 *
 * @example
 * ```tsx
 * <PremiumStatCard
 *   value={142}
 *   label="Movies Watched"
 *   icon="movie"
 *   variant="accent"
 *   trend="up"
 *   trendValue="+12%"
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-2, --p, --p-dim, --success-*, --warning-*, --danger-*
 * - Typography: --font-display, --font-label, --font-size-*
 * - Spacing: --space-3 through --space-6
 * - Radius: --radius-lg
 * - Shadows: --shadow-card
 * - Letter spacing: --letter-spacing-eyebrow
 */
const PremiumStatCard: Component<PremiumStatCardProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "value", "label", "icon", "iconFill", "variant", "size",
    "trend", "trendValue", "loading", "class", "style",
  ]);

  const sizeTokens = () => sizeClasses[local.size];
  const variantTokens = () => variantClasses[local.variant];

  /** Icon font variation for filled/unfilled. */
  const iconFontVariation = (): string =>
    local.iconFill
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";

  /** Accent variant inline style for --p-dim background. */
  const accentStyle = (): JSX.CSSProperties => {
    if (local.variant === "accent") {
      return {
        background: "var(--p-dim)",
        "border-color": "var(--p)",
        color: "var(--p)",
        ...((local.style as Record<string, string>) || {}),
      };
    }
    return (local.style as JSX.CSSProperties) || undefined;
  };

  /** Card classes. */
  const cardClasses = (): string => {
    const classes: string[] = [
      "relative",
      "overflow-hidden",
      "rounded-lg",
      "shadow-card",
      variantTokens().bg,
      sizeTokens().padding,
      sizeTokens().gap,
      "flex flex-col",
    ];

    if (variantTokens().border) {
      classes.push(variantTokens().border!);
    }

    if (local.class) classes.push(local.class);

    return classes.filter(Boolean).join(" ");
  };

  return (
    <div
      {...rest}
      class={cardClasses()}
      style={accentStyle()}
      role="figure"
      aria-label={`${local.label}: ${local.value}${local.trendValue ? `, ${local.trendValue}` : ""}`}
    >
      <Show
        when={!local.loading}
        fallback={
          /* Loading skeleton */
          <div class="flex flex-col gap-2">
            <div
              class="h-4 w-8 rounded-sm bg-tier-3"
              style={{ animation: "shimmer 1.8s ease-in-out infinite", background: "linear-gradient(90deg, transparent, var(--tier-3), transparent)", "background-size": "200% 100%" }}
              aria-hidden="true"
            />
            <div
              class="h-8 w-3/4 rounded-sm bg-tier-3"
              style={{ animation: "shimmer 1.8s ease-in-out infinite 0.2s", background: "linear-gradient(90deg, transparent, var(--tier-3), transparent)", "background-size": "200% 100%" }}
              aria-hidden="true"
            />
            <div
              class="h-3 w-1/2 rounded-sm bg-tier-3"
              style={{ animation: "shimmer 1.8s ease-in-out infinite 0.4s", background: "linear-gradient(90deg, transparent, var(--tier-3), transparent)", "background-size": "200% 100%" }}
              aria-hidden="true"
            />
          </div>
        }
      >
        {/* Icon */}
        <Show when={local.icon}>
          <span
            class={`material-symbols-outlined ${sizeTokens().icon} ${variantTokens().iconColor}`}
            style={{ "font-variation-settings": iconFontVariation() }}
            aria-hidden="true"
          >
            {local.icon}
          </span>
        </Show>

        {/* Value */}
        <span class={sizeTokens().value}>
          {local.value}
        </span>

        {/* Label */}
        <span class={sizeTokens().label}>
          {local.label}
        </span>

        {/* Trend indicator */}
        <Show when={local.trend}>
          <div class="flex items-center gap-1 mt-1">
            <span
              class={`material-symbols-outlined text-xs ${trendColorMap[local.trend!]}`}
              aria-hidden="true"
            >
              {trendIconMap[local.trend!]}
            </span>
            <Show when={local.trendValue}>
              <span class={`text-2xs font-label ${trendColorMap[local.trend!]}`}>
                {local.trendValue}
              </span>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export { PremiumStatCard };
export default PremiumStatCard;
