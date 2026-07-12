// src/shared/ui/premium/surfaces/PremiumBackdrop.tsx
import { Component, JSX, splitProps, mergeProps, Show, createSignal } from "solid-js";

// ─── Variant Types ─────────────────────────────────────────────

/** Gradient overlay preset for text readability over images. */
type BackdropGradient = "standard" | "heavy" | "subtle" | "none";

/** Aspect ratio preset for the backdrop container. */
type BackdropAspectRatio = "16:9" | "2:3" | "16:6" | "auto";

// ─── Token Maps ────────────────────────────────────────────────

/**
 * Gradient overlay definitions — each returns a CSS gradient string
 * optimized for text readability over background images.
 */
const gradientMap: Record<BackdropGradient, string> = {
  /** Standard: bottom-heavy void → tier-1 → transparent. Best for hero sections with bottom-aligned text. */
  standard: "linear-gradient(to top, var(--void) 0%, var(--tier-1) 30%, transparent 70%)",

  /** Heavy: deeper coverage for busy/bright images. More void at the bottom with higher mid-stop. */
  heavy: "linear-gradient(to top, var(--void) 0%, var(--void) 30%, var(--tier-1) 60%, transparent 85%)",

  /** Subtle: gentle fade for dark/low-contrast images where heavy overlay isn't needed. */
  subtle: "linear-gradient(to top, var(--tier-0) 0%, transparent 50%)",

  /** None: no gradient overlay. */
  none: "",
};

const aspectRatioMap: Record<BackdropAspectRatio, string> = {
  "16:9": "16 / 9",
  "2:3": "2 / 3",
  "16:6": "16 / 6",
  "auto": "auto",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumBackdropProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Image source URL for the backdrop. */
  src?: string;
  /** Alt text for the background image (used as aria-label on the image element). @default "" */
  alt?: string;
  /** Gradient overlay for text readability. @default "standard" */
  gradient?: BackdropGradient;
  /** Whether to lazy-load the image. @default true */
  lazy?: boolean;
  /** Aspect ratio preset for the container. @default "16:9" */
  aspectRatio?: BackdropAspectRatio;
  /** Loading state — shows a skeleton placeholder with shimmer animation. @default false */
  loading?: boolean;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumBackdropProps,
  "alt" | "gradient" | "lazy" | "aspectRatio" | "loading"
>> = {
  alt: "",
  gradient: "standard",
  lazy: true,
  aspectRatio: "16:9",
  loading: false,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumBackdrop — a cinematic backdrop image component with gradient overlay.
 *
 * Renders a full-bleed background image within a constrained aspect-ratio
 * container, with an optional gradient overlay for text readability. Designed
 * for hero sections, movie detail headers, and any context where content
 * needs to sit atop cinematic imagery.
 *
 * **Gradient presets** (all use design tokens):
 * - `standard` — void → tier-1 → transparent; the default cinematic readability gradient
 * - `heavy` — deeper void coverage with higher mid-stop; for bright/busy images
 * - `subtle` — gentle tier-0 → transparent fade; for dark/low-contrast images
 * - `none` — no gradient; use when the image is decorative or already dark
 *
 * **Lazy loading** is enabled by default using `loading="lazy"` on the `<img>`
 * element. This defers offscreen images and improves initial page load.
 *
 * **Loading state** renders a skeleton placeholder with the project's
 * shimmer animation while the image source is being resolved. The skeleton
 * matches the aspect ratio so layout doesn't shift.
 *
 * **Aspect ratio** presets ensure consistent proportions:
 * - `16:9` — standard widescreen (default, hero sections)
 * - `2:3` — poster ratio (movie posters, card backs)
 * - `16:6` — ultra-wide (banner strips, editorial headers)
 * - `auto` — natural image dimensions
 *
 * **Accessibility:**
 * - The image element has `role="img"` and `aria-label` from the `alt` prop
 * - When `alt` is empty, `aria-hidden="true"` is set (decorative image)
 * - The gradient overlay is always `aria-hidden="true"`
 * - Screen reader text via `sr-only` if `alt` is provided
 *
 * @example
 * ```tsx
 * // Hero section backdrop
 * <PremiumBackdrop src={movie.backdropUrl} alt={movie.title} gradient="heavy">
 *   <HeroContent />
 * </PremiumBackdrop>
 *
 * // Loading state while image URL is being fetched
 * <PremiumBackdrop loading gradient="standard">
 *   <HeroSkeleton />
 * </PremiumBackdrop>
 *
 * // Subtle gradient for dark imagery
 * <PremiumBackdrop src={imageUrl} gradient="subtle" aspectRatio="2:3">
 *   {posterOverlay}
 * </PremiumBackdrop>
 * ```
 */
const PremiumBackdrop: Component<PremiumBackdropProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "src", "alt", "gradient", "lazy", "aspectRatio", "loading",
    "class", "style", "children",
  ]);

  /** Track image load state for fade-in transition. */
  const [imageLoaded, setImageLoaded] = createSignal(false);

  /** Track image error state. */
  const [imageError, setImageError] = createSignal(false);

  /** Whether to show the actual image. */
  const showImage = () =>
    local.src && !local.loading && !imageError();

  /** Whether to show the skeleton placeholder. */
  const showSkeleton = () =>
    local.loading || (!imageLoaded() && !imageError() && local.src && !local.loading);

  /** Container class names. */
  const containerClasses = (): string => {
    const classes: string[] = [
      "relative",
      "overflow-hidden",
      "w-full",
    ];

    if (local.class) {
      classes.push(local.class);
    }

    return classes.filter(Boolean).join(" ");
  };

  /** Container inline styles (aspect ratio). */
  const containerStyle = (): JSX.CSSProperties => {
    const base: JSX.CSSProperties = {};

    if (local.aspectRatio !== "auto") {
      base["aspect-ratio"] = aspectRatioMap[local.aspectRatio];
    }

    if (local.style && typeof local.style === "object") {
      Object.assign(base, local.style);
    }

    return base;
  };

  return (
    <div
      {...rest}
      class={containerClasses()}
      style={containerStyle()}
    >
      {/* ── Background Image ── */}
      <Show when={showImage()}>
        <img
          src={local.src}
          alt=""
          role="img"
          aria-label={local.alt || undefined}
          aria-hidden={!local.alt ? true : undefined}
          loading={local.lazy ? "lazy" : "eager"}
          decoding="async"
          class="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: imageLoaded() ? 1 : 0,
            transition: "opacity var(--dur-base) var(--ease-standard)",
          }}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
      </Show>

      {/* ── Skeleton Placeholder ── */}
      <Show when={showSkeleton()}>
        <div
          class="absolute inset-0 w-full h-full"
          style={{
            "background-color": "var(--tier-2)",
            background: "linear-gradient(90deg, var(--tier-1), var(--tier-3), var(--tier-1))",
            "background-size": "200% 100%",
            animation: "shimmerSlow 2.4s ease-in-out infinite",
          }}
          aria-hidden="true"
        />
      </Show>

      {/* ── Static Loading Skeleton (when loading prop is true) ── */}
      <Show when={local.loading && !local.src}>
        <div
          class="absolute inset-0 w-full h-full"
          style={{
            "background-color": "var(--tier-2)",
            background: "linear-gradient(90deg, var(--tier-1), var(--tier-3), var(--tier-1))",
            "background-size": "200% 100%",
            animation: "shimmerSlow 2.4s ease-in-out infinite",
          }}
          aria-hidden="true"
        />
      </Show>

      {/* ── Gradient Overlay ── */}
      <Show when={local.gradient !== "none"}>
        <div
          class="absolute inset-0 z-overlay"
          style={{
            background: gradientMap[local.gradient],
          }}
          aria-hidden="true"
        />
      </Show>

      {/* ── Content Layer ── */}
      <div class="relative z-content w-full h-full">
        {local.children}
      </div>

      {/* ── Screen Reader Text ── */}
      <Show when={local.alt && local.src}>
        <span class="sr-only">{local.alt}</span>
      </Show>
    </div>
  );
};

export { PremiumBackdrop };
export default PremiumBackdrop;
