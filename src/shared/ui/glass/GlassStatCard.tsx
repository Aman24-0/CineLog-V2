// src/shared/ui/glass/GlassStatCard.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";
import { GlassCard } from "./GlassCard";

// ─── Variant & Size Types ──────────────────────────────────────

/** Stat card visual variant controlling surface color and accent treatment. */
type StatVariant = "glass" | "glass-strong" | "accent";

/** Stat card size controlling value/label scale and spacing. */
type StatSize = "compact" | "default" | "large";

/** Trend direction for the stat indicator. */
type StatTrend = "up" | "down" | "neutral";

// ─── Token Maps ────────────────────────────────────────────────

const variantClasses: Record<StatVariant, { iconColor: string }> = {
  glass: {
    iconColor: "text-text-soft"
  },
  "glass-strong": {
    iconColor: "text-text-strong"
  },
  accent: {
    iconColor: "text-primary"
  }
};

const sizeClasses: Record<
  StatSize,
  {
    padding: "compact" | "default" | "comfortable";
    value: string;
    label: string;
    icon: string;
    gap: string;
  }
> = {
  compact: {
    padding: "compact",
    value: "text-xl",
    label: "text-xs",
    icon: "text-lg",
    gap: "gap-1"
  },
  default: {
    padding: "default",
    value: "text-3xl",
    label: "text-sm",
    icon: "text-2xl",
    gap: "gap-2"
  },
  large: {
    padding: "comfortable",
    value: "text-5xl",
    label: "text-md",
    icon: "text-3xl",
    gap: "gap-3"
  }
};

// ─── Props ─────────────────────────────────────────────────────

export interface GlassStatCardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** The primary numeric value to display. */
  value: string | number;
  /** The label describing the value. */
  label: string;
  /** Visual variant. @default "glass" */
  variant?: StatVariant;
  /** Size preset. @default "default" */
  size?: StatSize;
  /** Material Symbol icon name shown in the top right. */
  icon?: string;
  /** Trend direction (shows arrow + color-coded value next to main stat). */
  trend?: StatTrend;
  /** Trend value text (e.g. "12%"). */
  trendValue?: string;
  /** Whether the card is in a loading state — renders shimmer overlay. @default false */
  loading?: boolean;
  /** Click handler for the entire card. */
  onClick?: (e: MouseEvent) => void;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<GlassStatCardProps, "variant" | "size" | "loading">
> = {
  variant: "glass",
  size: "default",
  loading: false
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassStatCard — a standardized glass card for displaying statistics.
 */
const GlassStatCard: Component<GlassStatCardProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "value",
    "label",
    "variant",
    "size",
    "icon",
    "trend",
    "trendValue",
    "loading",
    "onClick",
    "class"
  ]);

  const sizeTokens = () => sizeClasses[local.size];
  const variantTokens = () => variantClasses[local.variant];

  return (
    <GlassCard
      {...rest}
      variant={local.variant}
      padding={sizeTokens().padding}
      interactive={!!local.onClick}
      loading={local.loading}
      onClick={local.onClick}
      aria-label={`${local.label}: ${local.value}${local.trendValue ? ` (${local.trendValue} ${local.trend})` : ""}`}
      class={`flex flex-col justify-between ${local.class || ""}`}
    >
      <div class="flex w-full items-start justify-between">
        {/* Label */}
        <p
          class={`font-label uppercase tracking-widest text-text-muted ${sizeTokens().label}`}
        >
          {local.label}
        </p>

        {/* Icon */}
        <Show when={local.icon}>
          <span
            class={`material-symbols-outlined ${variantTokens().iconColor} ${sizeTokens().icon}`}
            style={{
              "font-variation-settings":
                "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24"
            }}
            aria-hidden="true"
          >
            {local.icon}
          </span>
        </Show>
      </div>

      {/* Main Value Row */}
      <div class={`flex items-baseline ${sizeTokens().gap} mt-2`}>
        <Show
          when={!local.loading}
          fallback={
            <div class="h-8 w-16 rounded-sm bg-tier-3" aria-hidden="true" />
          }
        >
          <span
            class={`font-display font-bold tracking-tight text-text-strong ${sizeTokens().value} leading-none`}
          >
            {local.value}
          </span>
        </Show>

        {/* Trend Indicator */}
        <Show when={local.trend && local.trendValue && !local.loading}>
          <div
            class={[
              "flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-sm font-semibold",
              local.trend === "up" ? "bg-success/10 text-success" : "",
              local.trend === "down" ? "bg-danger/10 text-danger" : "",
              local.trend === "neutral" ? "bg-tier-3 text-text-muted" : ""
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span
              class="material-symbols-outlined text-[14px]"
              aria-hidden="true"
            >
              {local.trend === "up"
                ? "trending_up"
                : local.trend === "down"
                  ? "trending_down"
                  : "trending_flat"}
            </span>
            <span>{local.trendValue}</span>
          </div>
        </Show>
      </div>
    </GlassCard>
  );
};

export { GlassStatCard };
export default GlassStatCard;
