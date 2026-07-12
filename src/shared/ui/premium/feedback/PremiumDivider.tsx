// src/shared/ui/premium/feedback/PremiumDivider.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Divider visual variant */
type DividerVariant = "default" | "subtle" | "strong" | "accent";

/** Divider spacing preset */
type DividerSpacing = "compact" | "default" | "wide";

// ─── Token Maps ────────────────────────────────────────────────

const variantClasses: Record<DividerVariant, string> = {
  default: "bg-hairline",
  subtle: "bg-hairline opacity-muted",
  strong: "bg-hairline-3",
  accent: "bg-primary",
};

const spacingHorizontal: Record<DividerSpacing, string> = {
  compact: "my-2",
  default: "my-4",
  wide: "my-8",
};

const spacingVertical: Record<DividerSpacing, string> = {
  compact: "mx-2",
  default: "mx-4",
  wide: "mx-8",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumDividerProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. @default "default" */
  variant?: DividerVariant;
  /** Spacing around the divider. @default "default" */
  spacing?: DividerSpacing;
  /** Render as a vertical divider. @default false */
  vertical?: boolean;
  /** Optional text label centered on the divider line. */
  label?: string;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumDividerProps, "variant" | "spacing" | "vertical" | "label">> = {
  variant: "default",
  spacing: "default",
  vertical: false,
  label: undefined as unknown as string,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumDivider — a visual divider line with optional centered label.
 *
 * Supports four visual variants (default, subtle, strong, accent),
 * three spacing presets, vertical orientation, and an optional
 * centered text label with a background cutout.
 *
 * **Variant behavior:**
 * - `default` — hairline color (standard separator)
 * - `subtle`  — dimmer, for light separation between closely related content
 * - `strong`  — hairline-3 (thicker, more prominent)
 * - `accent`  — primary/accent color line for themed separators
 *
 * **Vertical mode:** Renders a vertical line with appropriate width,
 * height (h-full), and horizontal margin spacing.
 *
 * **Label:** When provided, text is centered on the divider with a
 * bg-void cutout to create a "break" in the line. Uses font-label
 * with uppercase styling.
 *
 * @example
 * ```tsx
 * <PremiumDivider />
 *
 * <PremiumDivider variant="accent" label="OR" />
 *
 * <PremiumDivider vertical spacing="compact" />
 * ```
 *
 * Design tokens used:
 * - Colors: --hairline, --hairline-3, --p, --void, --color-text-dim
 * - Spacing: --space-2 through --space-8
 * - Typography: --font-family-label, --font-size-2xs
 * - Opacity: --opacity-muted
 */
const PremiumDivider: Component<PremiumDividerProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "variant", "spacing", "vertical", "label", "class", "style",
  ]);

  /** Classes for a simple divider (no label) */
  const simpleClass = (): string => {
    const base: string[] = [
      variantClasses[local.variant],
    ];

    if (local.vertical) {
      base.push(
        "w-px h-full",
        "inline-block",
        spacingVertical[local.spacing],
      );
    } else {
      base.push(
        "h-px w-full",
        spacingHorizontal[local.spacing],
      );
    }

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  /** Classes for a labeled divider (flex layout with line + text) */
  const labeledClass = (): string => {
    const base: string[] = [
      "flex items-center",
      spacingHorizontal[local.spacing],
    ];

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  return (
    <Show
      when={local.label}
      fallback={
        <div
          {...rest}
          class={simpleClass()}
          style={local.style}
          role="separator"
          aria-orientation={local.vertical ? "vertical" : "horizontal"}
        />
      }
    >
      <div
        {...rest}
        class={labeledClass()}
        style={local.style}
        role="separator"
        aria-orientation="horizontal"
      >
        {/* Left line */}
        <div
          class={`flex-1 h-px ${variantClasses[local.variant]}`}
          aria-hidden="true"
        />

        {/* Centered label */}
        <span
          class="px-3 bg-void text-text-dim font-label text-2xs uppercase tracking-label select-none"
          aria-hidden="true"
        >
          {local.label}
        </span>

        {/* Right line */}
        <div
          class={`flex-1 h-px ${variantClasses[local.variant]}`}
          aria-hidden="true"
        />
      </div>
    </Show>
  );
};

export { PremiumDivider };
export default PremiumDivider;
