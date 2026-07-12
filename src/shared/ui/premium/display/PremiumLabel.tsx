// src/shared/ui/premium/display/PremiumLabel.tsx
import { ParentComponent, JSX, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ─────────────────────────────────────

/** Label visual variant. */
type LabelVariant = "eyebrow" | "caption" | "overline" | "subtitle";

/** Label color. */
type LabelColor = "default" | "accent" | "muted" | "dim" | "soft";

/** Label size. */
type LabelSize = "default" | "small" | "large";

// ─── Token Maps ───────────────────────────────────────────────

const variantClasses: Record<LabelVariant, string> = {
  eyebrow: "font-label font-semibold uppercase tracking-ultra-wide",
  caption: "font-label text-muted",
  overline: "font-label font-medium uppercase tracking-extra-wide",
  subtitle: "font-body font-medium",
};

const variantColorClasses: Record<LabelVariant, LabelColor> = {
  eyebrow: "accent",
  caption: "muted",
  overline: "dim",
  subtitle: "soft",
};

const colorMap: Record<string, string> = {
  default: "text-strong",
  accent: "text-primary",
  muted: "text-muted",
  dim: "text-dim",
  soft: "text-soft",
};

const sizeMap: Record<LabelSize, string> = {
  small: "text-2xs",
  default: "text-xs",
  large: "text-sm",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumLabelProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  /** Visual variant. @default "caption" */
  variant?: LabelVariant;
  /** Text color override. When omitted, color is derived from variant. */
  color?: LabelColor;
  /** Size preset. @default "default" */
  size?: LabelSize;
  /** Force uppercase rendering. @default false */
  uppercase?: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumLabelProps,
  "variant" | "size" | "uppercase"
>> = {
  variant: "caption",
  size: "default",
  uppercase: false,
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumLabel — label/eyebrow text with multiple variants for hierarchy.
 *
 * Variants:
 * - **eyebrow**: font-label, accent color, uppercase, tracking-ultra-wide
 * - **caption**: font-label, muted color, small
 * - **overline**: font-label, dim color, uppercase, tracking-extra-wide
 * - **subtitle**: font-body, soft color
 *
 * @example
 * ```tsx
 * <PremiumLabel variant="eyebrow">Now Playing</PremiumLabel>
 * <PremiumLabel variant="caption" size="small">Last updated 2h ago</PremiumLabel>
 * <PremiumLabel variant="overline">Section Title</PremiumLabel>
 * <PremiumLabel variant="subtitle">A long descriptive subtitle</PremiumLabel>
 * <PremiumLabel variant="eyebrow" color="muted" uppercase>Muted Eyebrow</PremiumLabel>
 * ```
 *
 * Design tokens used:
 * - Colors: --color-text-strong, --color-primary, --color-text-muted,
 *   --color-text-dim, --color-text-soft
 * - Typography: --font-family-label, --font-family-body
 * - Tracking: --letter-spacing-ultra-wide, --letter-spacing-extra-wide
 * - Motion: --dur-fast, --ease-standard
 */
const PremiumLabel: ParentComponent<PremiumLabelProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "variant", "color", "size", "uppercase",
    "class", "style", "children",
  ]);

  /** Resolve color — explicit override takes precedence, then variant default. */
  const resolvedColor = (): string => {
    const key = local.color ?? variantColorClasses[local.variant];
    return colorMap[key] ?? "text-strong";
  };

  const labelClass = (): string => {
    const classes = [
      "inline-block transition-colors duration-fast ease-standard",
      variantClasses[local.variant],
      resolvedColor(),
      sizeMap[local.size],
    ];

    if (local.uppercase) classes.push("uppercase");

    if (local.class) classes.push(local.class);

    return classes.filter(Boolean).join(" ");
  };

  return (
    <span
      {...rest}
      class={labelClass()}
      style={local.style}
    >
      {local.children}
    </span>
  );
};

export { PremiumLabel };
export default PremiumLabel;
