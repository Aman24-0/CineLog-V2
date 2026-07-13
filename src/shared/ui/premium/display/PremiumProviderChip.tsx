// src/shared/ui/premium/display/PremiumProviderChip.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Types ────────────────────────────────────────────────────

/** Size preset. */
type ProviderChipSize = "compact" | "default";

/** Visual variant. */
type ProviderChipVariant = "default" | "accent";

// ─── Token Maps ───────────────────────────────────────────────

const sizeClasses: Record<ProviderChipSize, string> = {
  compact: "px-1.5 py-0.5 text-2xs gap-0.5",
  default: "px-2 py-1 text-xs gap-1",
};

const variantBgMap: Record<ProviderChipVariant, string> = {
  default: "bg-tier-2 border-hairline",
  accent: "bg-collection-ott border-collection-ott",
};

const variantTextMap: Record<ProviderChipVariant, string> = {
  default: "text-soft",
  accent: "text-collection-ott",
};

const iconSizeMap: Record<ProviderChipSize, string> = {
  compact: "w-3 h-3",
  default: "w-4 h-4",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumProviderChipProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  /** Provider display name (e.g. "Netflix", "HBO Max"). */
  name: string;
  /** Optional provider icon/logo URL. */
  icon?: string;
  /** Size preset. @default "default" */
  size?: ProviderChipSize;
  /** Visual variant. @default "default" */
  variant?: ProviderChipVariant;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumProviderChipProps,
  "size" | "variant"
>> = {
  size: "default",
  variant: "default",
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumProviderChip — streaming provider chip with name and optional icon.
 *
 * @example
 * ```tsx
 * <PremiumProviderChip name="Netflix" icon="/icons/netflix.svg" />
 * <PremiumProviderChip name="HBO Max" size="compact" variant="accent" />
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-2, --hairline, --color-text-soft, --color-collection-ott
 * - Typography: --font-family-label
 * - Spacing: --space-0.5 through --space-2
 * - Radius: --radius-pill
 * - Motion: --dur-fast, --ease-standard
 */
const PremiumProviderChip: Component<PremiumProviderChipProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "name", "icon", "size", "variant",
    "class", "style",
  ]);

  const chipClass = (): string => {
    const classes = [
      "inline-flex items-center rounded-pill border font-label font-medium",
      sizeClasses[local.size],
      variantBgMap[local.variant],
      variantTextMap[local.variant],
      "transition-colors duration-fast ease-standard",
    ];
    if (local.class) classes.push(local.class);
    return classes.filter(Boolean).join(" ");
  };

  return (
    <span
      {...rest}
      class={chipClass()}
      style={local.style}
      role="group"
      aria-label={`Provider: ${local.name}`}
    >
      {/* Provider icon */}
      <Show when={local.icon}>
        <img
          src={local.icon}
          alt=""
          class={`${iconSizeMap[local.size]} rounded-sm object-contain`}
          aria-hidden="true"
          draggable="false"
        />
      </Show>

      {/* Provider name */}
      <span>{local.name}</span>
    </span>
  );
};

export { PremiumProviderChip };
export default PremiumProviderChip;
