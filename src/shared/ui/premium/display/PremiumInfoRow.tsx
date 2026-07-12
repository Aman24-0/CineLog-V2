// src/shared/ui/premium/display/PremiumInfoRow.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Types ────────────────────────────────────────────────────

/** Visual variant. */
type InfoRowVariant = "default" | "subtle";

// ─── Token Maps ───────────────────────────────────────────────

const variantClasses: Record<InfoRowVariant, string> = {
  default: "bg-tier-2 rounded-md p-3",
  subtle: "border-b border-hairline py-2",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumInfoRowProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Label text (left side). */
  label: string;
  /** Value text (right side). */
  value: string;
  /** Material Symbol icon name shown on the left. */
  icon?: string;
  /** Render icon with FILL=1 (filled style). @default false */
  iconFill?: boolean;
  /** Visual variant. @default "default" */
  variant?: InfoRowVariant;
  /** Optional action button label (e.g. "Edit", "View"). */
  action?: string;
  /** Callback when action button is clicked. */
  onAction?: () => void;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumInfoRowProps,
  "iconFill" | "variant"
>> = {
  iconFill: false,
  variant: "default",
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumInfoRow — label-value info row with optional icon and action.
 *
 * Default variant: tier-2 background with padding.
 * Subtle variant: no background, just a bottom hairline border.
 *
 * Icon is on the left, label next to it, value right-aligned.
 * Optional action button appears at the far right.
 *
 * @example
 * ```tsx
 * <PremiumInfoRow label="Director" value="Christopher Nolan" icon="person" />
 * <PremiumInfoRow label="Rating" value="8.5" icon="star" iconFill variant="subtle" action="Edit" onAction={() => openEdit()} />
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-2, --hairline, --color-text-soft, --color-text-muted,
 *   --color-primary (action button), --color-text-strong
 * - Typography: --font-family-body, --font-family-label
 * - Spacing: --space-2 through --space-3
 * - Radius: --radius-md
 * - Motion: --dur-fast, --ease-standard
 */
const PremiumInfoRow: Component<PremiumInfoRowProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "label", "value", "icon", "iconFill", "variant", "action", "onAction",
    "class", "style",
  ]);

  const iconFontVariation = (): string =>
    local.iconFill
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";

  const handleActionKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      local.onAction?.();
    }
  };

  const rowClass = (): string => {
    const classes = [
      "flex items-center gap-2",
      variantClasses[local.variant],
      "transition-colors duration-fast ease-standard",
    ];
    if (local.class) classes.push(local.class);
    return classes.filter(Boolean).join(" ");
  };

  return (
    <div
      {...rest}
      class={rowClass()}
      style={local.style}
      role="group"
      aria-label={`${local.label}: ${local.value}`}
    >
      {/* Icon */}
      <Show when={local.icon}>
        <span
          class="material-symbols-outlined text-sm text-muted shrink-0"
          style={{ "font-variation-settings": iconFontVariation() }}
          aria-hidden="true"
        >
          {local.icon}
        </span>
      </Show>

      {/* Label */}
      <span class="font-label text-xs text-muted uppercase tracking-extra-wide shrink-0">
        {local.label}
      </span>

      {/* Spacer */}
      <span class="flex-1" />

      {/* Value */}
      <span class="font-body text-sm text-soft text-right truncate">
        {local.value}
      </span>

      {/* Action button */}
      <Show when={local.action && local.onAction}>
        <button
          type="button"
          class="ml-1 px-2 py-0.5 text-2xs font-label font-semibold text-primary bg-transparent border border-hairline rounded-sm hover:bg-tier-3 focus-ring transition-colors duration-fast ease-standard cursor-pointer"
          onClick={local.onAction}
          onKeyDown={handleActionKeyDown}
          aria-label={local.action}
        >
          {local.action}
        </button>
      </Show>
    </div>
  );
};

export { PremiumInfoRow };
export default PremiumInfoRow;
