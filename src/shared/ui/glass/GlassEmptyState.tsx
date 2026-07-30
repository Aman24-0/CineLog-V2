// src/shared/ui/glass/GlassEmptyState.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant Types ─────────────────────────────────────────────

/** Empty state size variant */
type EmptyStateVariant = "default" | "compact" | "large";

// ─── Token Maps ────────────────────────────────────────────────

const variantSpacing: Record<EmptyStateVariant, string> = {
  compact: "gap-3 p-4",
  default: "gap-5 p-8",
  large: "gap-8 p-12"
};

const iconContainerSize: Record<EmptyStateVariant, string> = {
  compact: "w-10 h-10",
  default: "w-16 h-16",
  large: "w-24 h-24"
};

const iconFontSize: Record<EmptyStateVariant, string> = {
  compact: "text-xl",
  default: "text-3xl",
  large: "text-5xl"
};

const titleSize: Record<EmptyStateVariant, string> = {
  compact: "text-sm",
  default: "text-lg",
  large: "text-xl"
};

const messageSize: Record<EmptyStateVariant, string> = {
  compact: "text-xs",
  default: "text-sm",
  large: "text-base"
};

// ─── Props ─────────────────────────────────────────────────────

export interface GlassEmptyStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Material Symbol icon name to display. */
  icon: string;
  /** Primary headline text. */
  title: string;
  /** Secondary descriptive text. */
  message?: string;
  /** Size variant. @default "default" */
  variant?: EmptyStateVariant;
  /** Custom action slot (usually a button). */
  action?: JSX.Element;
  /** If true, wraps the empty state in a GlassCard (glass surface). @default false */
  surface?: boolean;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<GlassEmptyStateProps, "variant" | "surface">
> = {
  variant: "default",
  surface: false
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassEmptyState — a polished, cinematic empty state component.
 * Replaces PremiumEmptyState, with a glass theme integration.
 */
const GlassEmptyState: Component<GlassEmptyStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "icon",
    "title",
    "message",
    "variant",
    "action",
    "surface",
    "class",
    "style"
  ]);

  const containerClasses = () => {
    const base = [
      "flex flex-col items-center justify-center text-center w-full",
      variantSpacing[local.variant]
    ];

    if (local.surface) {
      base.push(
        "bg-glass backdrop-blur-xl border border-glass-border rounded-lg shadow-glass-card"
      );
    }

    if (local.class) base.push(local.class);
    return base.join(" ");
  };

  return (
    <div {...rest} class={containerClasses()} style={local.style}>
      {/* Icon Container — premium glass with golden tint */}
      <div
        class={`flex flex-shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-primary backdrop-blur-md ${iconContainerSize[local.variant]}`}
        style={{
          "box-shadow":
            "0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(232,183,74,0.10)"
        }}
      >
        <span
          class={`material-symbols-outlined ${iconFontSize[local.variant]}`}
          style={{
            "font-variation-settings":
              "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48"
          }}
          aria-hidden="true"
        >
          {local.icon}
        </span>
      </div>

      {/* Text Content */}
      <div class="flex max-w-[400px] flex-col items-center justify-center gap-1.5">
        <h3
          class={`font-heading font-bold leading-tight text-text-strong ${titleSize[local.variant]}`}
        >
          {local.title}
        </h3>
        <Show when={local.message}>
          <p
            class={`font-body leading-relaxed text-text-soft ${messageSize[local.variant]}`}
          >
            {local.message}
          </p>
        </Show>
      </div>

      {/* Action Slot */}
      <Show when={local.action}>
        <div class="mt-2">{local.action}</div>
      </Show>
    </div>
  );
};

export { GlassEmptyState };
export default GlassEmptyState;
