// src/shared/ui/glass/GlassDivider.tsx
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

export interface GlassDividerProps extends JSX.HTMLAttributes<HTMLDivElement> {
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

const defaultProps: Required<Pick<GlassDividerProps, "variant" | "spacing" | "vertical" | "label">> = {
  variant: "default",
  spacing: "default",
  vertical: false,
  label: undefined as unknown as string,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassDivider — a visual divider line with optional centered label.
 * Replaces PremiumDivider.
 */
const GlassDivider: Component<GlassDividerProps> = (rawProps) => {
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

export { GlassDivider };
export default GlassDivider;
