// src/shared/ui/premium/layout/PremiumHeroContainer.tsx
import { ParentComponent, JSX, Show, splitProps, createSignal, onMount } from "solid-js";

/** Hero height variant. Controls the minimum height of the hero area. */
type HeroHeight = "short" | "default" | "tall" | "cinematic";

/** Gradient overlay intensity for text readability over background images. */
type HeroGradient = "standard" | "heavy" | "subtle";

interface PremiumHeroContainerProps {
  /** Height variant.
   *  "short" → 220px, "default" → 320px, "tall" → 460px, "cinematic" → 35vh min */
  height?: HeroHeight;
  /** Gradient overlay intensity for text readability.
   *  "standard" → balanced, "heavy" → more opaque (strong text contrast),
   *  "subtle" → lighter (background more visible) */
  gradient?: HeroGradient;
  /** Background image URL. Loaded lazily with progressive fade-in. */
  backgroundImage?: string;
  /** Accessible label for the hero region. */
  ariaLabel?: string;
  /** Additional CSS class names. */
  class?: string;
  /** Inline style overrides. */
  style?: JSX.CSSProperties;
}

const heightMap: Record<HeroHeight, JSX.CSSProperties> = {
  short: { "min-height": "220px" },
  default: { "min-height": "320px" },
  tall: { "min-height": "460px" },
  cinematic: { "min-height": "35vh" },
};

/** Gradient definitions — from bottom (opaque) to top (transparent). */
const gradientMap: Record<HeroGradient, string> = {
  standard:
    "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.80) 25%, rgba(0,0,0,0.30) 55%, rgba(0,0,0,0.05) 100%)",
  heavy:
    "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.92) 30%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.15) 100%)",
  subtle:
    "linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.15) 55%, transparent 100%)",
};

/**
 * PremiumHeroContainer — a hero section container for full-bleed hero areas.
 *
 * Provides:
 *  - Configurable height (short / default / tall / cinematic)
 *  - Gradient overlay from bottom for text readability
 *  - Background image support with lazy loading and progressive fade-in
 *  - Content is positioned above the gradient via z-overlay for proper stacking
 *  - Respects prefers-reduced-motion for image fade-in animation
 *  - Accessible: role="banner", aria-label, decorative image marking
 *
 * The hero uses a layered approach:
 *  1. Base layer: tier-1 background color (fallback)
 *  2. Image layer: lazy-loaded background with progressive opacity
 *  3. Gradient layer: directional overlay for text contrast
 *  4. Content layer: children positioned above all visual layers
 *
 * Usage:
 * ```tsx
 * <PremiumHeroContainer
 *   height="cinematic"
 *   gradient="heavy"
 *   backgroundImage={movie.backdrop}
 *   ariaLabel="Movie spotlight"
 * >
 *   <h1 class="font-display text-5xl text-text-strong">{movie.title}</h1>
 * </PremiumHeroContainer>
 * ```
 */
const PremiumHeroContainer: ParentComponent<PremiumHeroContainerProps> = (
  props
) => {
  const [local, rest] = splitProps(props, [
    "height",
    "gradient",
    "backgroundImage",
    "ariaLabel",
    "class",
    "style",
    "children",
  ]);

  const [imageLoaded, setImageLoaded] = createSignal(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = createSignal(false);

  onMount(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);

    // Preload background image for progressive reveal
    const bgUrl: string | undefined = local.backgroundImage;
    if (bgUrl) {
      const img = new Image();
      img.onload = () => setImageLoaded(true);
      img.onerror = () => setImageLoaded(false);
      img.src = bgUrl!;
    }
  });

  const height = () => local.height ?? "default";
  const gradient = () => local.gradient ?? "standard";

  const containerClass = () => {
    const classes = [
      "relative",
      "w-full",
      "overflow-hidden",
      "bg-tier-1",
      "rounded-card",
    ];
    if (local.class) classes.push(local.class);
    return classes.join(" ");
  };

  const resolvedStyle = (): JSX.CSSProperties => {
    const base: JSX.CSSProperties = {
      ...heightMap[height()],
    };

    if (local.style && typeof local.style === "object") {
      Object.assign(base, local.style);
    }

    return base;
  };

  const imageStyle = (): JSX.CSSProperties => ({
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    "object-fit": "cover",
    "z-index": "var(--z-base)",
    opacity: imageLoaded() ? "1" : "0",
    transition: prefersReducedMotion()
      ? "none"
      : `opacity var(--dur-slow) var(--ease-out)`,
    filter: "brightness(0.8) saturate(0.85)",
  });

  const gradientStyle = (): JSX.CSSProperties => ({
    position: "absolute",
    inset: "0",
    background: gradientMap[gradient()],
    "z-index": "var(--z-overlay)",
    "pointer-events": "none",
  });

  const contentStyle = (): JSX.CSSProperties => ({
    position: "relative",
    "z-index": "var(--z-content)",
  });

  return (
    <section
      {...rest}
      class={containerClass()}
      style={resolvedStyle()}
      role="banner"
      aria-label={local.ariaLabel ?? "Hero section"}
    >
      <Show when={local.backgroundImage}>
        <img
          src={local.backgroundImage}
          alt=""
          aria-hidden="true"
          loading="lazy"
          style={imageStyle()}
        />
      </Show>

      <div style={gradientStyle()} />

      <div style={contentStyle()}>
        {local.children}
      </div>
    </section>
  );
};

export { PremiumHeroContainer };
export default PremiumHeroContainer;
