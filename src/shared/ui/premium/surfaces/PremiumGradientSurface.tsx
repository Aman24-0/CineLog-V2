// src/shared/ui/premium/surfaces/PremiumGradientSurface.tsx
import { ParentComponent, JSX, splitProps, mergeProps, Show } from "solid-js";

// ─── Variant Types ─────────────────────────────────────────────

/** Gradient preset — each maps to a specific color combination and purpose. */
type GradientPreset = "accent" | "cinematic" | "surface" | "hero";

/** Gradient direction — controls the flow of the gradient. */
type GradientDirection = "up" | "down" | "left" | "right";

/** Internal padding density. */
type GradientPadding = "none" | "compact" | "default" | "comfortable";

/** Border radius scale. */
type GradientRadius = "none" | "sm" | "md" | "lg" | "xl" | "pill";

// ─── Token Maps ────────────────────────────────────────────────

const directionMap: Record<GradientDirection, string> = {
  up: "to top",
  down: "to bottom",
  left: "to left",
  right: "to right",
};

/**
 * Gradient preset definitions — each returns a CSS gradient string
 * using design tokens for all color stops.
 */
const gradientPresetMap: Record<GradientPreset, (direction: string) => string> = {
  /** Accent: from --p-dim to transparent — subtle theme-colored glow. */
  accent: (dir) => `linear-gradient(${dir}, var(--p-dim), transparent)`,

  /** Cinematic: from --void to transparent with mid-stop for text readability over imagery. */
  cinematic: (dir) => `linear-gradient(${dir}, var(--void), var(--tier-1) 40%, transparent)`,

  /** Surface: from --tier-2 to --tier-1 — subtle elevation transition. */
  surface: (dir) => `linear-gradient(${dir}, var(--tier-2), var(--tier-1))`,

  /** Hero: the standard hero overlay gradient — void → tier-1 → transparent. */
  hero: (dir) => `linear-gradient(${dir}, var(--void) 0%, var(--tier-1) 50%, transparent 100%)`,
};

const paddingMap: Record<GradientPadding, string> = {
  none: "",
  compact: "p-3",     // --space-3 = 12px
  default: "p-4",      // --space-4 = 16px
  comfortable: "p-6",  // --space-6 = 24px
};

const radiusMap: Record<GradientRadius, string> = {
  none: "",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  pill: "rounded-pill",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumGradientSurfaceProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Gradient preset controlling the color combination. @default "accent" */
  gradient?: GradientPreset;
  /** Direction the gradient flows towards. @default "down" */
  direction?: GradientDirection;
  /** Internal padding density. @default "default" */
  padding?: GradientPadding;
  /** Border radius scale. @default "lg" */
  radius?: GradientRadius;
  /** Whether to render a semi-transparent overlay layer on top of the gradient for better text contrast. @default false */
  overlay?: boolean;
  /** Whether the surface is in a loading state. Renders a shimmer overlay. @default false */
  loading?: boolean;
  /** Makes the surface interactive: adds hover state, cursor-pointer, role=button, keyboard activation. @default false */
  interactive?: boolean;
  /** Whether the interactive surface is disabled. @default false */
  disabled?: boolean;
  /** Accessible label for interactive gradient surfaces. */
  "aria-label"?: string;
  /** Accessible description for interactive gradient surfaces. */
  "aria-describedby"?: string;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumGradientSurfaceProps,
  "gradient" | "direction" | "padding" | "radius" | "overlay" | "loading" | "interactive" | "disabled"
>> = {
  gradient: "accent",
  direction: "down",
  padding: "default",
  radius: "lg",
  overlay: false,
  loading: false,
  interactive: false,
  disabled: false,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumGradientSurface — a surface with gradient background.
 *
 * Provides a container with one of four gradient presets, each designed
 * for specific visual purposes within the CineLog cinematic design language.
 * All gradients use design tokens exclusively — no hardcoded colors.
 *
 * **Gradient presets:**
 * - `accent` — from --p-dim to transparent; subtle theme-colored glow for
 *   highlighting featured content or drawing attention to a section.
 * - `cinematic` — from --void to transparent with a mid-stop; optimized for
 *   text readability over imagery (hero sections, backdrop overlays).
 * - `surface` — from --tier-2 to --tier-1; subtle elevation transition for
 *   grouped content areas that need visual depth without a sharp boundary.
 * - `hero` — the standard hero overlay gradient (void → tier-1 → transparent);
 *   the default cinematic darkening effect used behind hero content.
 *
 * **Overlay** mode adds a semi-transparent --tier-1 layer on top of the
 * gradient for enhanced text contrast, useful when content is positioned
 * over the gradient surface.
 *
 * **Interactive** surfaces get:
 * - Hover state with subtle scale transform
 * - `cursor-pointer` + `role="button"` + `tabindex="0"`
 * - Enter/Space keyboard activation
 * - `.focus-ring` for keyboard focus visibility
 * - Disabled state with `aria-disabled`
 *
 * @example
 * ```tsx
 * // Accent gradient for a feature callout
 * <PremiumGradientSurface gradient="accent" direction="right" padding="comfortable">
 *   <h3>Premium Feature</h3>
 * </PremiumGradientSurface>
 *
 * // Hero gradient for a cinematic section
 * <PremiumGradientSurface gradient="hero" direction="up" overlay>
 *   <HeroContent />
 * </PremiumGradientSurface>
 *
 * // Interactive gradient card
 * <PremiumGradientSurface
 *   gradient="cinematic"
 *   direction="down"
 *   interactive
 *   onClick={() => openMovie()}
 *   aria-label="Open movie details"
 * >
 *   {movieTitle}
 * </PremiumGradientSurface>
 * ```
 */
const PremiumGradientSurface: ParentComponent<PremiumGradientSurfaceProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "gradient", "direction", "padding", "radius", "overlay", "loading",
    "interactive", "disabled", "class", "style", "children",
    "aria-label", "aria-describedby",
  ]);

  /** Resolve all token-based class names (excluding gradient, which is inline style). */
  const surfaceClasses = (): string => {
    const classes: string[] = [
      "relative",
      paddingMap[local.padding],
      radiusMap[local.radius],
    ];

    // Interactive state
    if (local.interactive && !local.disabled) {
      classes.push(
        "cursor-pointer",
        "focus-ring",
        "transition-[transform,box-shadow]",
        "duration-base",
        "ease-standard",
        "hover:scale-[1.01]",
        "hover:shadow-raised",
        "active:scale-[0.99]",
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

  /** Resolve the gradient as an inline CSS background. */
  const gradientStyle = (): JSX.CSSProperties => {
    const dir = directionMap[local.direction];
    const gradientValue = gradientPresetMap[local.gradient](dir);

    const base: JSX.CSSProperties = {
      background: gradientValue,
    };

    // Merge user style
    if (local.style && typeof local.style === "object") {
      Object.assign(base, local.style);
    }

    return base;
  };

  /** Keyboard event handler for interactive gradient surfaces. */
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
      style={gradientStyle()}
      role={local.interactive && !local.disabled ? "button" : undefined}
      tabindex={local.interactive && !local.disabled ? 0 : undefined}
      aria-disabled={local.interactive && local.disabled ? true : undefined}
      aria-label={local["aria-label"]}
      aria-describedby={local["aria-describedby"]}
      aria-busy={local.loading || undefined}
      onKeyDown={local.interactive ? handleKeyDown : undefined}
    >
      <Show when={local.overlay}>
        <div
          class="absolute inset-0 z-overlay rounded-inherit"
          style={{
            "background-color": "var(--tier-1)",
            opacity: "var(--opacity-ambient, 0.4)",
          }}
          aria-hidden="true"
        />
      </Show>
      <Show when={local.loading}>
        <div
          class="absolute inset-0 z-content"
          style={{
            background: "linear-gradient(90deg, transparent, var(--tier-3), transparent)",
            "background-size": "200% 100%",
            animation: "shimmer 1.8s ease-in-out infinite",
          }}
          aria-hidden="true"
        />
      </Show>
      {/* Content rendered above overlay/shimmer layers */}
      <div class="relative z-content">
        {local.children}
      </div>
    </div>
  );
};

export { PremiumGradientSurface };
export default PremiumGradientSurface;
