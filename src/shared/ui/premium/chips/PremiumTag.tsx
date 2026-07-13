// src/shared/ui/premium/chips/PremiumTag.tsx
import { ParentComponent, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Tag visual variant */
type TagVariant = "default" | "accent" | "outline";

/** Tag size preset */
type TagSize = "compact" | "default";

/** Tag semantic color */
type TagColor = "default" | "success" | "warning" | "danger" | "info";

// ─── Token Maps ────────────────────────────────────────────────

const variantClasses: Record<TagVariant, string> = {
  default: "bg-tier-2 border-hairline text-text-body",
  accent: "bg-primary-dim border-primary text-primary",
  outline: "bg-transparent border-primary text-primary",
};

const sizeClasses: Record<TagSize, string> = {
  compact: "p-1 px-2 text-2xs gap-1",
  default: "p-2 px-3 text-xs gap-1",
};

const colorMap: Record<TagColor, string> = {
  default: "",
  success: "bg-success-bg border-success-border text-success",
  warning: "bg-warning-bg border-warning-border text-warning",
  danger: "bg-danger-bg border-danger-border text-danger",
  info: "bg-info-bg border-info-border text-info",
};

const iconSizeMap: Record<TagSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumTagProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  /** Visual variant. @default "default" */
  variant?: TagVariant;
  /** Size preset. @default "default" */
  size?: TagSize;
  /** Material Symbol icon name, rendered before children. */
  icon?: string;
  /** Semantic color override. @default "default" */
  color?: TagColor;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumTagProps, "variant" | "size" | "color">> = {
  variant: "default",
  size: "default",
  color: "default",
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumTag — a non-interactive label tag for categorization.
 *
 * Unlike PremiumChip, this is not toggleable. It is a static label
 * used for categorization, metadata display, and status indicators.
 * Supports three visual variants, two sizes, and semantic color overrides.
 *
 * Rendered as a `<span>` with no interactive role — purely presentational.
 *
 * @example
 * ```tsx
 * <PremiumTag variant="accent" icon="label">
 *   Sci-Fi
 * </PremiumTag>
 *
 * <PremiumTag color="danger" size="compact">
 *   R-Rated
 * </PremiumTag>
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-*, --hairline-*, --p-dim, --color-primary,
 *   --color-success/warning/danger/info, --color-text-body
 * - Spacing: --space-1 through --space-3
 * - Radius: --radius-pill
 * - Typography: --font-family-label, --font-size-2xs/xs
 */
const PremiumTag: ParentComponent<PremiumTagProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "variant", "size", "icon", "color", "class", "style", "children",
  ]);

  const computedClass = (): string => {
    const base = [
      "inline-flex items-center",
      "font-label font-semibold tracking-label",
      "border rounded-pill",
      "select-none",
    ];

    // Color override takes precedence
    if (local.color !== "default") {
      base.push(colorMap[local.color]);
    } else {
      base.push(variantClasses[local.variant]);
    }

    base.push(sizeClasses[local.size]);

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  return (
    <span
      {...rest}
      class={computedClass()}
      style={local.style}
      role="status"
      aria-label={typeof local.children === "string" ? local.children : undefined}
    >
      {/* Icon */}
      <Show when={local.icon}>
        <span
          class={`material-symbols-outlined ${iconSizeMap[local.size]}`}
          style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
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

export { PremiumTag };
export default PremiumTag;
