// src/shared/ui/premium/display/PremiumProfileStat.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ─────────────────────────────────────

/** Visual variant for the stat value. */
type ProfileStatVariant = "default" | "accent";

/** Size preset for density. */
type ProfileStatSize = "compact" | "default";

/** Trend direction. */
type TrendDirection = "up" | "down" | "neutral";

// ─── Token Maps ───────────────────────────────────────────────

const valueColorMap: Record<ProfileStatVariant, string> = {
  default: "text-strong",
  accent: "text-primary",
};

const sizeClasses: Record<ProfileStatSize, string> = {
  compact: "gap-1",
  default: "gap-2",
};

const valueSizeMap: Record<ProfileStatSize, string> = {
  compact: "text-lg",
  default: "text-2xl",
};

const labelSizeMap: Record<ProfileStatSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
};

const iconSizeMap: Record<ProfileStatSize, string> = {
  compact: "text-sm",
  default: "text-md",
};

const trendColorMap: Record<TrendDirection, string> = {
  up: "text-success",
  down: "text-danger",
  neutral: "text-muted",
};

const trendIconMap: Record<TrendDirection, string> = {
  up: "trending_up",
  down: "trending_down",
  neutral: "remove",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumProfileStatProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Stat value — number or formatted string. */
  value: string | number;
  /** Label describing the stat. */
  label: string;
  /** Material Symbol icon name shown above/beside value. */
  icon?: string;
  /** Trend direction. @default "neutral" */
  trend?: TrendDirection;
  /** Optional trend value text (e.g. "+12%"). */
  trendValue?: string;
  /** Visual variant. @default "default" */
  variant?: ProfileStatVariant;
  /** Size preset. @default "default" */
  size?: ProfileStatSize;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumProfileStatProps,
  "trend" | "variant" | "size"
>> = {
  trend: "neutral",
  variant: "default",
  size: "default",
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumProfileStat — profile statistics display with value, label,
 * optional icon, and trend indicator.
 *
 * @example
 * ```tsx
 * <PremiumProfileStat value={142} label="Watched" icon="movie" trend="up" trendValue="+12" variant="accent" />
 * <PremiumProfileStat value="4.2" label="Avg Rating" icon="star" size="compact" />
 * ```
 *
 * Design tokens used:
 * - Colors: --color-text-strong, --color-primary, --color-text-muted,
 *   --color-success, --color-danger
 * - Typography: --font-family-display, --font-family-label
 * - Spacing: --space-1 through --space-2
 * - Motion: --dur-fast, --ease-standard
 */
const PremiumProfileStat: Component<PremiumProfileStatProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "value", "label", "icon", "trend", "trendValue", "variant", "size",
    "class", "style",
  ]);

  const containerClass = (): string => {
    const classes = [
      "inline-flex flex-col items-center",
      sizeClasses[local.size],
    ];
    if (local.class) classes.push(local.class);
    return classes.filter(Boolean).join(" ");
  };

  return (
    <div
      {...rest}
      class={containerClass()}
      style={local.style}
      role="group"
      aria-label={`${local.label}: ${local.value}${local.trendValue ? ` (${local.trendValue})` : ""}`}
    >
      {/* Icon */}
      <Show when={local.icon}>
        <span
          class={`material-symbols-outlined text-muted ${iconSizeMap[local.size]}`}
          aria-hidden="true"
        >
          {local.icon}
        </span>
      </Show>

      {/* Value + Trend row */}
      <div class="inline-flex items-center gap-1">
        <span
          class={`font-display font-bold ${valueSizeMap[local.size]} ${valueColorMap[local.variant]} transition-colors duration-fast ease-standard`}
        >
          {local.value}
        </span>

        <Show when={local.trend !== "neutral" && local.trendValue}>
          <span
            class={`inline-flex items-center gap-0.5 ${trendColorMap[local.trend]} ${labelSizeMap[local.size]} font-label`}
            aria-label={`Trend ${local.trend}: ${local.trendValue}`}
          >
            <span
              class={`material-symbols-outlined text-2xs`}
              style={{ "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
              aria-hidden="true"
            >
              {trendIconMap[local.trend]}
            </span>
            {local.trendValue}
          </span>
        </Show>
      </div>

      {/* Label */}
      <span class={`font-label ${labelSizeMap[local.size]} text-muted uppercase tracking-ultra-wide`}>
        {local.label}
      </span>
    </div>
  );
};

export { PremiumProfileStat };
export default PremiumProfileStat;
