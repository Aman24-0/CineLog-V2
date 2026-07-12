// src/shared/ui/premium/surfaces/PremiumGlassSurface.tsx
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
    bg: "bg-glass",          // --glass-bg (72% opacity)
    blur: "backdrop-blur-lg", // --blur-lg (20px)
  },
  strong: {
    bg: "bg-glass-strong",   // --glass-bg-strong (88% opacity)
    blur: "backdrop-blur-2xl", // --blur-2xl (28px)
  },
};

const paddingMap: Record<GlassPadding, string> = {
  none: "",
  compact: "p-3",     // --space-3 = 12px
  default: "p-4",      // --space-4 = 16px
  comfortable: "p-6",  // --space-6 = 24px
};

const radiusMap: Record<GlassRadius, string> = {
  none: "",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumGlassSurfaceProps extends JSX.HTMLAttributes<HTMLDivElement> {
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

const defaultProps: Required<Pick<PremiumGlassSurfaceProps,
  "strength" | "border" | "padding" | "radius" | "loading" | "interactive" | "disabled"
>> = {
  strength: "default",
  border: true,
  padding: "default",
  radius: "lg",
  loading: false,
  interactive: false,
  disabled: false,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumGlassSurface — a frosted glass surface with backdrop blur.
 *
 * Provides a premium translucent container with configurable blur strength,
 * optional glass border, and standard surface variants. Uses the project's
 * glass design tokens for consistent visual identity across all frosted surfaces.
 *
 * **Strength variants:**
 * - `default` — 72% opacity background (--glass-bg) + 20px backdrop blur (--blur-lg)
 * - `strong` — 88% opacity background (--glass-bg-strong) + 28px backdrop blur (--blur-2xl)
 *
 * **Border** renders a 1px solid border using --glass-border token for
 * a subtle frosted edge. Enabled by default for visual separation.
 *
 * **Interactive** surfaces get:
 * - Hover state with stronger opacity
 * - `cursor-pointer` + `role="button"` + `tabindex="0"`
 * - Enter/Space keyboard activation
 * - `.focus-ring` for keyboard focus visibility
 * - Disabled state support with `aria-disabled`
 *
 * **Note:** backdrop-filter requires the element to not be inside an overflow
 * container with filter/transform ancestors. Use PremiumSurface instead
 * if you need a plain solid card without blur.
 *
 * @example
 * ```tsx
 * // Default frosted glass panel
 * <PremiumGlassSurface>
 *   <h3>Insights</h3>
 *   {content}
 * </PremiumGlassSurface>
 *
 * // Strong glass for high-contrast overlays
 * <PremiumGlassSurface strength="strong" padding="comfortable">
 *   {modalContent}
 * </PremiumGlassSurface>
 *
 * // Interactive glass button panel
 * <PremiumGlassSurface interactive onClick={() => open()} aria-label="Open filter panel">
 *   <span class="material-symbols-outlined">filter_list</span>
 * </PremiumGlassSurface>
 * ```
 */
const PremiumGlassSurface: ParentComponent<PremiumGlassSurfaceProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "strength", "border", "padding", "radius", "loading", "interactive", "disabled",
    "class", "style", "children",
    "aria-label", "aria-describedby",
  ]);

  /** Resolve all token-based class names. */
  const glassClasses = (): string => {
    const { bg, blur } = strengthMap[local.strength];
    const classes: string[] = [
      bg,
      blur,
      paddingMap[local.padding],
      radiusMap[local.radius],
      "relative",
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
        "active:duration-fast",
      );
    }

    // Disabled state
    if (local.interactive && local.disabled) {
      classes.push("opacity-disabled", "cursor-not-allowed", "pointer-events-none");
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
      onKeyDown={local.interactive ? handleKeyDown : undefined}
    >
      <Show when={local.loading}>
        <div
          class="absolute inset-0 z-overlay rounded-inherit"
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

export { PremiumGlassSurface };
export default PremiumGlassSurface;
