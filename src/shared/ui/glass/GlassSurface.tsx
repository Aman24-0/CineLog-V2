// src/shared/ui/glass/GlassSurface.tsx
import { ParentComponent, JSX, splitProps, mergeProps, Show } from "solid-js";

// ─── Variant Types ─────────────────────────────────────────────

/** Glass backdrop strength — controls opacity and blur intensity. */
type GlassStrength = "default" | "strong";

/** Internal padding density. */
type GlassPadding = "none" | "compact" | "default" | "comfortable";

/** Border radius scale. */
type GlassRadius = "none" | "sm" | "md" | "lg" | "xl";

// ─── Token Maps ────────────────────────────────────────────────

const strengthMap: Record<GlassStrength, { bg: string; blur: string }> = {
  default: {
    bg: "bg-glass", // --glass-bg (72% opacity)
    blur: "backdrop-blur-xl" // stronger blur for premium feel
  },
  strong: {
    bg: "bg-glass-strong", // --glass-bg-strong (88% opacity)
    blur: "backdrop-blur-2xl" // --blur-2xl (28px)
  }
};

const paddingMap: Record<GlassPadding, string> = {
  none: "",
  compact: "p-3", // --space-3 = 12px
  default: "p-4", // --space-4 = 16px
  comfortable: "p-6" // --space-6 = 24px
};

const radiusMap: Record<GlassRadius, string> = {
  none: "",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl"
};

// ─── Props ─────────────────────────────────────────────────────

export interface GlassSurfaceProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Glass strength: default (72% opacity, 20px blur) or strong (88% opacity, 28px blur). @default "default" */
  strength?: GlassStrength;
  /** Whether to show a subtle glass border (--glass-border). @default true */
  border?: boolean;
  /** Internal padding density. @default "default" */
  padding?: GlassPadding;
  /** Border radius scale. @default "lg" */
  radius?: GlassRadius;
  /** Whether the glass surface is in a loading state. Renders a shimmer overlay. @default false */
  loading?: boolean;
  /** Makes the surface interactive: adds hover state, cursor-pointer, role=button, keyboard activation. @default false */
  interactive?: boolean;
  /** Whether the interactive surface is disabled. @default false */
  disabled?: boolean;
  /** Accessible label for interactive glass surfaces. */
  "aria-label"?: string;
  /** Accessible description for interactive glass surfaces. */
  "aria-describedby"?: string;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<
    GlassSurfaceProps,
    | "strength"
    | "border"
    | "padding"
    | "radius"
    | "loading"
    | "interactive"
    | "disabled"
  >
> = {
  strength: "default",
  border: true,
  padding: "default",
  radius: "lg",
  loading: false,
  interactive: false,
  disabled: false
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassSurface — a frosted glass surface with backdrop blur.
 */
const GlassSurface: ParentComponent<GlassSurfaceProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "strength",
    "border",
    "padding",
    "radius",
    "loading",
    "interactive",
    "disabled",
    "class",
    "style",
    "children",
    "aria-label",
    "aria-describedby"
  ]);

  /** Resolve all token-based class names. */
  const glassClasses = (): string => {
    const { bg, blur } = strengthMap[local.strength];
    const classes: string[] = [
      bg,
      blur,
      paddingMap[local.padding],
      radiusMap[local.radius],
      "relative"
    ];

    // Glass border
    if (local.border) {
      classes.push("border", "border-glass-border");
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
        "active:scale-[0.98]",
        "active:duration-fast"
      );
    }

    // Disabled state
    if (local.interactive && local.disabled) {
      classes.push(
        "opacity-disabled",
        "cursor-not-allowed",
        "pointer-events-none"
      );
    }

    // Loading state
    if (local.loading) {
      classes.push("overflow-hidden");
    }

    // User class passthrough
    if (local.class) {
      classes.push(local.class);
    }

    return classes.filter(Boolean).join(" ");
  };

  /** Keyboard event handler for interactive glass surfaces. */
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
      class={glassClasses()}
      style={local.style}
      role={local.interactive && !local.disabled ? "button" : undefined}
      tabindex={local.interactive && !local.disabled ? 0 : undefined}
      aria-disabled={local.interactive && local.disabled ? true : undefined}
      aria-label={local["aria-label"]}
      aria-describedby={local["aria-describedby"]}
      aria-busy={local.loading || undefined}
      onKeyDown={handleKeyDown}
    >
      <Show when={local.loading}>
        <div
          class="rounded-inherit absolute inset-0 z-overlay"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--glass-bg), transparent)",
            "background-size": "200% 100%",
            animation: "shimmer 1.8s ease-in-out infinite"
          }}
          aria-hidden="true"
        />
      </Show>
      {local.children}
    </div>
  );
};

export { GlassSurface };
export default GlassSurface;
