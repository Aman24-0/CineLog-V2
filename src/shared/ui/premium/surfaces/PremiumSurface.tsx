// src/shared/ui/premium/surfaces/PremiumSurface.tsx
import { ParentComponent, JSX, splitProps, mergeProps, Show } from "solid-js";

// ─── Variant Types ─────────────────────────────────────────────

/** Surface elevation tier — maps to the --tier-0 through --tier-4 background scale. */
type SurfaceElevation = "flat" | "base" | "raised" | "elevated" | "highest";

/** Border visibility/strength — maps to hairline token scale. */
type SurfaceBorder = "none" | "subtle" | "default" | "strong";

/** Internal padding density. */
type SurfacePadding = "none" | "compact" | "default" | "comfortable";

/** Border radius scale. */
type SurfaceRadius = "none" | "sm" | "md" | "lg" | "xl" | "pill";

// ─── Token Maps ────────────────────────────────────────────────

const elevationMap: Record<SurfaceElevation, string> = {
  flat: "bg-tier-0",
  base: "bg-tier-1",
  raised: "bg-tier-2",
  elevated: "bg-tier-3",
  highest: "bg-tier-4",
};

const elevationShadowMap: Record<SurfaceElevation, string> = {
  flat: "",
  base: "shadow-xs",
  raised: "shadow-sm",
  elevated: "shadow-md",
  highest: "shadow-lg",
};

const borderMap: Record<SurfaceBorder, string> = {
  none: "",
  subtle: "border border-hairline",
  default: "border border-hairline-2",
  strong: "border border-hairline-3",
};

const paddingMap: Record<SurfacePadding, string> = {
  none: "",
  compact: "p-3",     // --space-3 = 12px
  default: "p-4",      // --space-4 = 16px
  comfortable: "p-6",  // --space-6 = 24px
};

const radiusMap: Record<SurfaceRadius, string> = {
  none: "",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  pill: "rounded-pill",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumSurfaceProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Elevation tier controlling background shade and shadow. @default "base" */
  elevation?: SurfaceElevation;
  /** Border visibility and strength. @default "none" */
  border?: SurfaceBorder;
  /** Internal padding density. @default "default" */
  padding?: SurfacePadding;
  /** Border radius scale. @default "lg" */
  radius?: SurfaceRadius;
  /** Makes the surface interactive: adds hover state, cursor-pointer, role=button, keyboard activation. @default false */
  interactive?: boolean;
  /** Adds a hover visual transition without click/keyboard behavior. @default false */
  hoverable?: boolean;
  /** Whether the surface is in a disabled state. Only applies when interactive. @default false */
  disabled?: boolean;
  /** Whether the surface is in a loading state. Renders a shimmer overlay. @default false */
  loading?: boolean;
  /** Accessible label for interactive surfaces. */
  "aria-label"?: string;
  /** Accessible description for interactive surfaces. */
  "aria-describedby"?: string;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumSurfaceProps,
  "elevation" | "border" | "padding" | "radius" | "interactive" | "hoverable" | "disabled" | "loading"
>> = {
  elevation: "base",
  border: "none",
  padding: "default",
  radius: "lg",
  interactive: false,
  hoverable: false,
  disabled: false,
  loading: false,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumSurface — the foundational surface layer of the CineLog design system.
 *
 * Provides a composable surface with elevation, border, padding, and radius
 * variants driven entirely by design tokens. Supports interactive and hoverable
 * states with proper ARIA attributes and keyboard navigation.
 *
 * **Elevation** maps to the tier-based surface scale:
 * - `flat` → --tier-0 (deepest black)
 * - `base` → --tier-1 (slightly elevated)
 * - `raised` → --tier-2 (card-level)
 * - `elevated` → --tier-3 (hover/active level)
 * - `highest` → --tier-4 (peak elevation)
 *
 * **Interactive** surfaces get:
 * - Hover state (bg-tier-3 + border-active)
 * - `cursor-pointer`
 * - `role="button"` + `tabindex="0"`
 * - Enter/Space keyboard activation
 * - `.focus-ring` for keyboard focus visibility
 * - Disabled state with reduced opacity and `aria-disabled`
 *
 * **Hoverable** surfaces get the same visual hover transition but no
 * click behavior, role, or tabindex — use for decorative hover feedback.
 *
 * All transitions respect `prefers-reduced-motion` via global baseline.
 *
 * @example
 * ```tsx
 * // Basic card surface
 * <PremiumSurface elevation="raised" border="default" padding="comfortable">
 *   {children}
 * </PremiumSurface>
 *
 * // Interactive clickable surface
 * <PremiumSurface
 *   elevation="base"
 *   interactive
 *   onClick={() => navigate()}
 *   aria-label="Open movie details"
 * >
 *   {children}
 * </PremiumSurface>
 *
 * // Hoverable decorative surface
 * <PremiumSurface elevation="raised" hoverable>
 *   {children}
 * </PremiumSurface>
 * ```
 */
const PremiumSurface: ParentComponent<PremiumSurfaceProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "elevation", "border", "padding", "radius", "interactive", "hoverable",
    "disabled", "loading", "class", "style", "children",
    "aria-label", "aria-describedby",
  ]);

  /** Resolve all token-based class names. */
  const surfaceClasses = (): string => {
    const classes: string[] = [
      elevationMap[local.elevation],
      elevationShadowMap[local.elevation],
      borderMap[local.border],
      paddingMap[local.padding],
      radiusMap[local.radius],
    ];

    // Interactive state classes
    if (local.interactive && !local.disabled) {
      classes.push(
        "cursor-pointer",
        "focus-ring",
        "transition-[background-color,border-color,box-shadow,transform]",
        "duration-base",
        "ease-standard",
        "hover:bg-tier-3",
        "hover:border-border-active",
        "active:scale-[0.98]",
        "active:duration-fast",
      );
    }

    // Hoverable (visual-only hover, no click behavior)
    if (local.hoverable && !local.interactive) {
      classes.push(
        "transition-[background-color,border-color]",
        "duration-base",
        "ease-standard",
        "hover:bg-tier-3",
      );
    }

    // Disabled state
    if (local.interactive && local.disabled) {
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

  /** Keyboard event handler for interactive surfaces. */
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
      class={surfaceClasses()}
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

export { PremiumSurface };
export default PremiumSurface;
