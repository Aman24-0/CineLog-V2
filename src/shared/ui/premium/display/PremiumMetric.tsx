// src/shared/ui/premium/display/PremiumMetric.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ─────────────────────────────────────

/** Visual variant controlling the value color. */
type MetricVariant = "default" | "accent" | "success" | "warning" | "danger";

/** Size preset. */
type MetricSize = "compact" | "default" | "large";

// ─── Token Maps ───────────────────────────────────────────────

const variantColorMap: Record<MetricVariant, string> = {
  default: "text-strong",
  accent: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const sizeValueMap: Record<MetricSize, string> = {
  compact: "text-lg",
  default: "text-3xl",
  large: "text-5xl",
};

const sizeUnitMap: Record<MetricSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
  large: "text-sm",
};

const sizeLabelMap: Record<MetricSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
  large: "text-sm",
};

const sizeGapMap: Record<MetricSize, string> = {
  compact: "gap-0.5",
  default: "gap-1",
  large: "gap-2",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumMetricProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Metric value — number or formatted string. */
  value: string | number;
  /** Label describing the metric. */
  label: string;
  /** Optional unit suffix (e.g. "hrs", "min", "%"). */
  unit?: string;
  /** Visual variant. @default "default" */
  variant?: MetricVariant;
  /** Size preset. @default "default" */
  size?: MetricSize;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumMetricProps,
  "variant" | "size"
>> = {
  variant: "default",
  size: "default",
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumMetric — metric/stat display with value, optional unit, and label.
 *
 * Value rendered in font-display; unit rendered smaller beside the value;
 * label rendered in font-label with muted color.
 *
 * @example
 * ```tsx
 * <PremiumMetric value={142} label="Total Watched" unit="titles" variant="accent" />
 * <PremiumMetric value="98%" label="Completion Rate" variant="success" size="large" />
 * <PremiumMetric value={3.5} label="Hours" unit="hrs" size="compact" />
 * ```
 *
 * Design tokens used:
 * - Colors: --color-text-strong, --color-primary, --color-success,
 *   --color-warning, --color-danger, --color-text-muted
 * - Typography: --font-family-display, --font-family-label
 * - Spacing: --space-0.5 through --space-2
 * - Motion: --dur-fast, --ease-standard
 */
const PremiumMetric: Component<PremiumMetricProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "value", "label", "unit", "variant", "size",
    "class", "style",
  ]);

  const containerClass = (): string => {
    const classes = [
      "inline-flex flex-col",
      sizeGapMap[local.size],
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
      aria-label={`${local.label}: ${local.value}${local.unit ? ` ${local.unit}` : ""}`}
    >
      {/* Value + Unit row */}
      <div class="inline-flex items-baseline gap-0.5">
        <span
          class={`font-display font-bold ${sizeValueMap[local.size]} ${variantColorMap[local.variant]} transition-colors duration-fast ease-standard`}
        >
          {local.value}
        </span>

        <Show when={local.unit}>
          <span class={`font-label font-medium ${sizeUnitMap[local.size]} text-soft`}>
            {local.unit}
          </span>
        </Show>
      </div>

      {/* Label */}
      <span class={`font-label ${sizeLabelMap[local.size]} text-muted uppercase tracking-ultra-wide`}>
        {local.label}
      </span>
    </div>
  );
};

export { PremiumMetric };
export default PremiumMetric;
