// src/shared/ui/premium/layout/PremiumPageContainer.tsx
import { ParentComponent, JSX, createSignal, onMount, splitProps } from "solid-js";

/** Page container size variant. Controls max-width constraint. */
type PageSize = "narrow" | "default" | "wide";

interface PremiumPageContainerProps {
  /** Max-width variant. "narrow" → max-w-2xl, "default" → max-w-4xl, "wide" → max-w-none */
  size?: PageSize;
  /** Override top padding. Defaults to var(--sp-6) / var(--space-6). */
  paddingTop?: string;
  /** Override bottom padding. Defaults to calc(var(--nav-total-height) + var(--sp-6)). */
  paddingBottom?: string;
  /** Enable fade-in animation on mount. Default: true. */
  animated?: boolean;
  /** Remove bottom nav padding — use when the page has its own bottom anchor. */
  noBottomPadding?: boolean;
  /** Additional CSS class names. */
  class?: string;
  /** Inline style overrides. */
  style?: JSX.CSSProperties;
}

const sizeMap: Record<PageSize, string> = {
  narrow: "max-w-2xl",
  default: "max-w-4xl",
  wide: "max-w-none",
};

/**
 * PremiumPageContainer — the single source of truth for full-page layout rhythm.
 *
 * Every page wraps its content in PremiumPageContainer. This guarantees:
 *  - Consistent horizontal padding (px-5 mobile, lg:px-12 desktop)
 *  - Consistent max-width per page type (narrow / default / wide)
 *  - Consistent top/bottom rhythm with bottom-nav compensation
 *  - Optional fade-in animation respecting prefers-reduced-motion
 *  - Focus management for skip-link navigation (tabindex=-1)
 *  - Centered on desktop via mx-auto
 *
 * The bottom padding accounts for the fixed bottom navigation bar
 * (`--nav-total-height`) plus an additional spacing buffer so content
 * never sits beneath the nav.
 *
 * Usage:
 * ```tsx
 * <PremiumPageContainer size="narrow" animated>
 *   <PremiumSectionContainer title="Continue Watching">
 *     {children}
 *   </PremiumSectionContainer>
 * </PremiumPageContainer>
 * ```
 */
const PremiumPageContainer: ParentComponent<PremiumPageContainerProps> = (props) => {
  const [local, rest] = splitProps(props, [
    "size",
    "paddingTop",
    "paddingBottom",
    "animated",
    "noBottomPadding",
    "class",
    "style",
    "children",
  ]);

  const [prefersReducedMotion, setPrefersReducedMotion] = createSignal(false);

  onMount(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  });

  const size = () => local.size ?? "default";
  const animated = () => local.animated ?? true;
  const shouldAnimate = () => animated() && !prefersReducedMotion();

  const resolvedPaddingTop = () =>
    local.paddingTop ?? "var(--space-6)";

  const resolvedPaddingBottom = () => {
    if (local.noBottomPadding) return "0px";
    if (local.paddingBottom) return local.paddingBottom;
    return "calc(var(--nav-total-height) + var(--space-6))";
  };

  const containerClass = () => {
    const classes = [
      "px-5",
      "lg:px-12",
      sizeMap[size()],
      "mx-auto",
      "relative",
      "z-base",
    ];
    if (shouldAnimate()) classes.push("animate-fade-in");
    if (local.class) classes.push(local.class);
    return classes.join(" ");
  };

  const resolvedStyle = (): JSX.CSSProperties => ({
    "padding-top": resolvedPaddingTop(),
    "padding-bottom": resolvedPaddingBottom(),
    ...(local.style && typeof local.style === "object" ? local.style : {}),
  });

  return (
    <main
      {...rest}
      class={containerClass()}
      style={resolvedStyle()}
      tabindex={-1}
    >
      {local.children}
    </main>
  );
};

export { PremiumPageContainer };
export default PremiumPageContainer;
