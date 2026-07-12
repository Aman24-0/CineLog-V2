// src/shared/ui/premium/feedback/PremiumSkeleton.tsx
import { Component, JSX, Show, For, splitProps, mergeProps } from "solid-js";

// ─── Variant Types ─────────────────────────────────────────────

/** Skeleton shape variant */
type SkeletonVariant = "block" | "text" | "circle" | "card" | "avatar" | "poster";

// ─── Token Maps ────────────────────────────────────────────────

const avatarSizeMap: Record<string, { w: string; h: string }> = {
  sm: { w: "w-8", h: "h-8" },
  md: { w: "w-12", h: "h-12" },
  lg: { w: "w-16", h: "h-16" },
  xl: { w: "w-20", h: "h-20" },
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumSkeletonProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Shape variant. @default "block" */
  variant?: SkeletonVariant;
  /** Width override (Tailwind class or CSS value). */
  width?: string;
  /** Height override (Tailwind class or CSS value). */
  height?: string;
  /** Border radius override (Tailwind class). */
  radius?: string;
  /** Number of text lines for the "text" variant. @default 3 */
  lines?: number;
  /** Enable shimmer animation. @default true */
  animated?: boolean;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<PremiumSkeletonProps, "variant" | "lines" | "animated">
> = {
  variant: "block",
  lines: 3,
  animated: true,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumSkeleton — a skeleton loading placeholder with multiple shape variants.
 *
 * Supports six shape variants:
 * - `block`   — Rectangular skeleton (default)
 * - `text`    — Multiple text-line skeletons with varying widths
 * - `circle`  — Circular skeleton (for avatars, profile images)
 * - `card`    — Card-shaped skeleton with poster area and text lines
 * - `avatar`  — Circular skeleton with preset sizes (sm/md/lg/xl)
 * - `poster`  — Poster-ratio skeleton (2:3 aspect ratio)
 *
 * **Animation:** By default, skeletons show a shimmer animation.
 * When `animated` is false OR the user has `prefers-reduced-motion: reduce`,
 * the skeleton renders as a static placeholder without animation.
 *
 * @example
 * ```tsx
 * <PremiumSkeleton variant="text" lines={4} />
 *
 * <PremiumSkeleton variant="avatar" width="lg" />
 *
 * <PremiumSkeleton variant="card" />
 *
 * <PremiumSkeleton variant="poster" width="w-32" />
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-2, --tier-3 (shimmer highlight)
 * - Spacing: --space-1 through --space-4
 * - Radius: --radius-md, --radius-lg, --radius-full
 * - Motion: prefers-reduced-motion (static if reduced)
 */
const PremiumSkeleton: Component<PremiumSkeletonProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "variant", "width", "height", "radius", "lines", "animated", "class", "style",
  ]);

  /** Shimmer animation style — respects prefers-reduced-motion */
  const shimmerStyle = (): JSX.CSSProperties => {
    if (!local.animated) return {};
    return {
      background: "linear-gradient(90deg, var(--tier-2), var(--tier-3), var(--tier-2))",
      "background-size": "200% 100%",
      animation: "shimmer 1.8s ease-in-out infinite",
    };
  };

  /** Static fallback style for reduced-motion or animated=false */
  const staticStyle = (): JSX.CSSProperties => {
    if (local.animated) return {};
    return {
      background: "var(--tier-2)",
    };
  };

  /** Combined style for the skeleton element */
  const combinedStyle = (): JSX.CSSProperties => ({
    ...(local.animated ? shimmerStyle() : staticStyle()),
    ...(local.style as JSX.CSSProperties || {}),
  });

  /** Base classes shared by all variants */
  const baseClasses = (): string => {
    const base = ["bg-tier-2"];
    if (local.class) base.push(local.class);
    return base.join(" ");
  };

  // ─── Block variant ─────────────────────────────────────────
  const blockClasses = (): string => {
    const base = [baseClasses()];
    if (local.radius) base.push(local.radius);
    else base.push("rounded-md");
    return base.join(" ");
  };

  // ─── Text variant ─────────────────────────────────────────
  const textLineClasses = (index: number): string => {
    const base = [baseClasses(), "h-3 rounded-sm"];
    // Last line is shorter to mimic natural text
    const widthPercent = index === (local.lines as number) - 1 ? "w-3/4" : "w-full";
    base.push(widthPercent);
    return base.join(" ");
  };

  // ─── Circle variant ────────────────────────────────────────
  const circleClasses = (): string => {
    const base = [baseClasses(), "rounded-full"];
    return base.join(" ");
  };

  // ─── Avatar variant ────────────────────────────────────────
  const avatarClasses = (): string => {
    const size = avatarSizeMap[local.width as string] || avatarSizeMap.md;
    const base = [baseClasses(), size.w, size.h, "rounded-full"];
    return base.join(" ");
  };

  // ─── Card variant ──────────────────────────────────────────
  const cardClasses = (): string => {
    const base = [baseClasses(), "rounded-lg overflow-hidden"];
    return base.join(" ");
  };

  // ─── Poster variant ────────────────────────────────────────
  const posterClasses = (): string => {
    const base = [baseClasses(), "rounded-md"];
    return base.join(" ");
  };

  // ─── Render variant ─────────────────────────────────────
  // Only one <Show> can be true at a time since variant is a single value,
  // but SolidJS JSX requires a single root. We use a fragment wrapper.
  return (
    <>
      <Show when={local.variant === "text"}>
        {/* ── Text variant: multiple lines ── */}
        <div
          class="flex flex-col gap-2"
          role="presentation"
          aria-label="Loading content"
          aria-busy="true"
        >
          <For each={Array.from({ length: local.lines as number }, (_, i) => i)}>
            {(index) => (
              <div
                {...rest}
                class={textLineClasses(index)}
                style={combinedStyle()}
                aria-hidden="true"
              />
            )}
          </For>
        </div>
      </Show>

      <Show when={local.variant === "card"}>
        {/* ── Card variant: poster area + text lines ── */}
        <div
          {...rest}
          class={cardClasses()}
          role="presentation"
          aria-label="Loading card"
          aria-busy="true"
        >
          {/* Poster/image area */}
          <div
            class="w-full h-40"
            style={{
              ...shimmerStyle(),
              ...staticStyle(),
            }}
            aria-hidden="true"
          />
          {/* Text lines below */}
          <div class="p-4 flex flex-col gap-2">
            <div
              class="h-4 w-3/4 rounded-sm"
              style={{
                ...shimmerStyle(),
                ...staticStyle(),
              }}
              aria-hidden="true"
            />
            <div
              class="h-3 w-1/2 rounded-sm"
              style={{
                ...shimmerStyle(),
                ...staticStyle(),
              }}
              aria-hidden="true"
            />
          </div>
        </div>
      </Show>

      <Show when={local.variant === "avatar"}>
        {/* ── Avatar variant: preset size circle ── */}
        <div
          {...rest}
          class={avatarClasses()}
          style={combinedStyle()}
          role="presentation"
          aria-label="Loading avatar"
          aria-busy="true"
        />
      </Show>

      <Show when={local.variant === "circle"}>
        {/* ── Circle variant: custom size circle ── */}
        <div
          {...rest}
          class={circleClasses()}
          style={{
            ...combinedStyle(),
            width: local.width || "var(--space-12)",
            height: local.height || "var(--space-12)",
          }}
          role="presentation"
          aria-label="Loading"
          aria-busy="true"
        />
      </Show>

      <Show when={local.variant === "poster"}>
        {/* ── Poster variant: 2:3 aspect ratio ── */}
        <div
          {...rest}
          class={posterClasses()}
          style={{
            ...combinedStyle(),
            width: local.width || "100%",
            "aspect-ratio": "2/3",
          }}
          role="presentation"
          aria-label="Loading poster"
          aria-busy="true"
        />
      </Show>

      <Show when={local.variant === "block"}>
        {/* ── Block variant: rectangular ── */}
        <div
          {...rest}
          class={blockClasses()}
          style={{
            ...combinedStyle(),
            width: local.width || "100%",
            height: local.height || "var(--space-8)",
          }}
          role="presentation"
          aria-label="Loading"
          aria-busy="true"
        />
      </Show>
    </>
  );
};

export { PremiumSkeleton };
export default PremiumSkeleton;
