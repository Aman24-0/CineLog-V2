// src/shared/ui/premium/feedback/PremiumEmptyState.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant Types ─────────────────────────────────────────────

/** Empty state size variant */
type EmptyStateVariant = "default" | "compact" | "large";

// ─── Token Maps ────────────────────────────────────────────────

const variantSpacing: Record<EmptyStateVariant, string> = {
  compact: "gap-3 p-4",
  default: "gap-5 p-8",
  large: "gap-8 p-12",
};

const iconContainerSize: Record<EmptyStateVariant, string> = {
  compact: "w-10 h-10",
  default: "w-16 h-16",
  large: "w-24 h-24",
};

const iconFontSize: Record<EmptyStateVariant, string> = {
  compact: "text-xl",
  default: "text-3xl",
  large: "text-5xl",
};

const titleSize: Record<EmptyStateVariant, string> = {
  compact: "text-sm",
  default: "text-lg",
  large: "text-xl",
};

const messageSize: Record<EmptyStateVariant, string> = {
  compact: "text-xs",
  default: "text-sm",
  large: "text-base",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumEmptyStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Material Symbol icon name for the empty state illustration. */
  icon?: string;
  /** Render icon with FILL=1 (filled style). @default false */
  iconFill?: boolean;
  /** Title text. */
  title?: string;
  /** Descriptive message. */
  message?: string;
  /** Label for the optional action button. */
  actionLabel?: string;
  /** Callback when the action button is clicked. */
  onAction?: () => void;
  /** Size variant. @default "default" */
  variant?: EmptyStateVariant;
  /** Optional illustration image URL displayed below the icon. */
  illustration?: string;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<PremiumEmptyStateProps, "iconFill" | "variant">
> = {
  iconFill: false,
  variant: "default",
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumEmptyState — a premium empty state display with icon tile, title, message, and action.
 *
 * Features a centered layout with an icon tile that has an accent glow background,
 * a bold heading, a muted description, and an optional action button styled as
 * btn-primary. Supports three size variants (compact, default, large).
 *
 * **Accessibility:** Uses `role="status"` and `aria-live="polite"` so screen
 * readers announce the empty state when it appears.
 *
 * @example
 * ```tsx
 * <PremiumEmptyState
 *   icon="search_off"
 *   title="No results found"
 *   message="Try adjusting your filters or search terms."
 *   actionLabel="Clear filters"
 *   onAction={clearFilters}
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --p, --p-glow, --p-dim, --color-text-strong, --color-text-soft,
 *   --color-primary, --on-primary
 * - Spacing: --space-3 through --space-12
 * - Radius: --radius-lg, --radius-md
 * - Shadows: --shadow-glow
 * - Typography: --font-family-heading, --font-family-body, --font-family-label
 * - Motion: --dur-fast, --ease-spring
 */
const PremiumEmptyState: Component<PremiumEmptyStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "icon", "iconFill", "title", "message", "actionLabel", "onAction",
    "variant", "illustration", "class", "style",
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

  const containerClass = (): string => {
    const base = [
      "flex flex-col items-center justify-center text-center",
      variantSpacing[local.variant],
    ];
    if (local.class) base.push(local.class);
    return base.join(" ");
  };

  return (
    <div
      {...rest}
      class={containerClass()}
      style={local.style}
      role="status"
      aria-live="polite"
    >
      {/* Icon tile with accent glow background */}
      <Show when={local.icon}>
        <div
          class={`${iconContainerSize[local.variant]} rounded-lg flex items-center justify-center`}
          style={{
            background: "var(--p-dim)",
            "box-shadow": "0 0 24px var(--p-glow)",
          }}
          aria-hidden="true"
        >
          <span
            class={`material-symbols-outlined ${iconFontSize[local.variant]} text-primary`}
            style={{ "font-variation-settings": iconFontVariation() }}
          >
            {local.icon}
          </span>
        </div>
      </Show>

      {/* Illustration image */}
      <Show when={local.illustration}>
        <img
          src={local.illustration}
          alt=""
          class="max-w-40 max-h-40 object-contain opacity-medium"
          aria-hidden="true"
        />
      </Show>

      {/* Title */}
      <Show when={local.title}>
        <h3 class={`font-heading font-bold text-text-strong ${titleSize[local.variant]}`}>
          {local.title}
        </h3>
      </Show>

      {/* Message */}
      <Show when={local.message}>
        <p class={`font-body text-text-soft max-w-80 ${messageSize[local.variant]}`}>
          {local.message}
        </p>
      </Show>

      {/* Action button */}
      <Show when={local.actionLabel && local.onAction}>
        <button
          class="inline-flex items-center justify-center font-label font-semibold tracking-label rounded-md px-5 p-3 bg-primary text-on-primary transition-all duration-fast ease-spring focus-ring cursor-pointer hover:brightness-110"
          onClick={local.onAction}
          onKeyDown={handleActionKeyDown}
          type="button"
        >
          {local.actionLabel}
        </button>
      </Show>
    </div>
  );
};

export { PremiumEmptyState };
export default PremiumEmptyState;
