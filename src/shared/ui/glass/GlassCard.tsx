// src/shared/ui/glass/GlassCard.tsx
import { ParentComponent, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Card visual variant controlling background, shadow, and border treatment. */
type CardVariant = "glass" | "glass-strong" | "accent";

/** Card size preset controlling internal spacing density. */
type CardSize = "compact" | "default" | "comfortable";

/** Internal padding density override. */
type CardPadding = "none" | "compact" | "default" | "comfortable";

/** Border visibility and strength. */
type CardBorder = "none" | "default";

// ─── Token Maps ────────────────────────────────────────────────

const variantClasses: Record<CardVariant, string> = {
  "glass": "bg-glass backdrop-blur-xl",
  "glass-strong": "bg-glass-strong backdrop-blur-2xl",
  accent: "bg-glass backdrop-blur-xl shadow-glow",
};

const sizeClasses: Record<CardSize, string> = {
  compact: "p-3 gap-2",
  default: "p-4 gap-3",
  comfortable: "p-6 gap-4",
};

const paddingOverride: Record<CardPadding, string> = {
  none: "",
  compact: "p-3",
  default: "p-4",
  comfortable: "p-6",
};

const borderOverride: Record<CardBorder, string> = {
  none: "",
  default: "border border-glass-border",
};

// ─── Props ─────────────────────────────────────────────────────

export interface GlassCardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. @default "glass" */
  variant?: CardVariant;
  /** Size preset controlling spacing density. @default "default" */
  size?: CardSize;
  /** Makes the card interactive: adds hover, cursor-pointer, role=button, keyboard activation. @default false */
  interactive?: boolean;
  /** Whether the card is in a selected/toggled state — accent border + dim bg. @default false */
  selected?: boolean;
  /** Whether the card is in a loading state — renders shimmer overlay. @default false */
  loading?: boolean;
  /** Whether the card is disabled — reduces opacity and prevents interaction. @default false */
  disabled?: boolean;
  /** Padding density override (takes precedence over size). @default undefined (use size) */
  padding?: CardPadding;
  /** Border strength override. @default "default" */
  border?: CardBorder;
  /** Whether the card has hover visual feedback (can be used without interactive). @default false */
  hoverable?: boolean;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<GlassCardProps,
  "variant" | "size" | "interactive" | "selected" | "loading" | "disabled" | "hoverable" | "border"
>> & { padding?: CardPadding } = {
  variant: "glass",
  size: "default",
  interactive: false,
  selected: false,
  loading: false,
  disabled: false,
  hoverable: false,
  border: "default",
  padding: undefined,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassCard — a versatile card component with variant, size, and state support.
 */
const GlassCard: ParentComponent<GlassCardProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "variant", "size", "interactive", "selected", "loading", "disabled",
    "padding", "border", "hoverable", "class", "style", "children",
  ]);

  /** Resolve all token-based class names. */
  const cardClasses = (): string => {
    const classes: string[] = [
      "relative",
      "rounded-lg",
      "overflow-hidden",
      variantClasses[local.variant],
    ];

    // Padding: override takes precedence, else use size
    if (local.padding !== undefined && local.padding !== null) {
      classes.push(paddingOverride[local.padding]);
      // Add gap from size only if padding is overridden
      if (local.size === "compact") classes.push("gap-2");
      else if (local.size === "default") classes.push("gap-3");
      else classes.push("gap-4");
    } else {
      classes.push(sizeClasses[local.size]);
    }

    // Border
    classes.push(borderOverride[local.border]);

    // Accent variant specific border
    if (local.variant === "accent") {
      classes.push("border-2");
      classes.push("border-primary");
    }

    // Selected state
    if (local.selected) {
      classes.push("border-2", "border-primary", "bg-primary-dim");
    }

    // Interactive state
    if (local.interactive && !local.disabled) {
      classes.push(
        "cursor-pointer",
        "focus-ring",
        "transition-[background-color,border-color,box-shadow,transform]",
        "duration-base",
        "ease-standard",
        "hover:bg-glass-strong",
        "hover:backdrop-blur-2xl",
        "hover:scale-[1.01]",
        "hover:shadow-raised",
        "active:scale-[0.99]",
        "active:duration-fast",
      );
    }

    // Hoverable (visual-only hover, no click behavior)
    if (local.hoverable && !local.interactive) {
      classes.push(
        "transition-[background-color,border-color,box-shadow]",
        "duration-base",
        "ease-standard",
        "hover:bg-glass-strong",
        "hover:backdrop-blur-2xl",
        "hover:shadow-raised",
      );
    }

    // Disabled state
    if (local.disabled) {
      classes.push("opacity-disabled", "cursor-not-allowed", "pointer-events-none");
    }

    // Loading state
    if (local.loading) {
      classes.push("relative", "overflow-hidden");
    }

    // User class passthrough
    if (local.class) {
      classes.push(local.class);
    }

    return classes.filter(Boolean).join(" ");
  };

  /** Accent border style for --p token. */
  const accentBorderStyle = (): JSX.CSSProperties | undefined => {
    if (local.variant === "accent" && !local.selected) {
      return {
        "border-color": "var(--p)",
        ...((local.style as Record<string, string>) || {}),
      };
    }
    if (local.selected) {
      return {
        "border-color": "var(--p)",
        "background": "var(--p-dim)",
        ...((local.style as Record<string, string>) || {}),
      };
    }
    return (local.style as JSX.CSSProperties) || undefined;
  };

  /** Keyboard event handler for interactive cards. */
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!local.interactive || local.disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  };

  return (
    <div
      {...rest}
      class={cardClasses()}
      style={accentBorderStyle()}
      role={local.interactive && !local.disabled ? "button" : undefined}
      tabindex={local.interactive && !local.disabled ? 0 : undefined}
      aria-disabled={local.disabled || undefined}
      aria-busy={local.loading || undefined}
      aria-pressed={local.selected || undefined}
      onKeyDown={local.interactive ? handleKeyDown : undefined}
    >
      {/* Shimmer loading overlay */}
      <Show when={local.loading}>
        <div
          class="absolute inset-0 z-overlay"
          style={{
            background: "linear-gradient(90deg, transparent, var(--tier-3), transparent)",
            "background-size": "200% 100%",
            animation: "shimmer 1.8s ease-in-out infinite",
          }}
          aria-hidden="true"
        />
      </Show>

      {local.children}
    </div>
  );
};

export { GlassCard };
export default GlassCard;
