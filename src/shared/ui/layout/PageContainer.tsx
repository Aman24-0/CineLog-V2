// src/shared/ui/premium/layout/PageContainer.tsx
import { ParentComponent, JSX, splitProps } from "solid-js";

/** Page container size variant. Controls max-width constraint. */
type PageSize = "narrow" | "default" | "wide";

interface PageContainerProps {
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
 * PageContainer — the single source of truth for full-page layout rhythm.
 *
 * Every page wraps its content in PageContainer. This guarantees:
 *  - Consistent horizontal padding (px-5 mobile, lg:px-12 desktop)
 *  - Consistent max-width per page type (narrow / default / wide)
 *  - Consistent top/bottom rhythm with bottom-nav compensation
 *  - Optional fade-in animation respecting prefers-reduced-motion
 *  - Focus management for skip-link navigation (tabindex=-1)
 *  - Centered on desktop via mx-auto
 *
 * ACCESSIBILITY: Renders a `<div role="region">` (NOT a `<main>`) so
 * there is exactly ONE `<main>` landmark per page — provided by the
 * AppShell root layout. Multiple `<main>` tags violate WCAG 2.4.1
 * (Bypass Blocks) and confuse screen reader landmark navigation.
 *
 * The bottom padding accounts for the fixed bottom navigation bar
 * (`--nav-total-height`) plus an additional spacing buffer so content
 * never sits beneath the nav.
 *
 * Usage:
 * ```tsx
 * <PageContainer size="narrow" animated>
 *   <SectionContainer title="Continue Watching">
 *     {children}
 *   </SectionContainer>
 * </PageContainer>
 * ```
 */
const PageContainer: ParentComponent<PageContainerProps> = (props) => {
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

  // `animated` prop and `prefersReducedMotion` tracking were removed
  // when the animate-fade-in class was removed (to prevent CLS).
  // The `animated` prop is still in splitProps for backwards compat
  // — existing callers pass `animated={false}` and that's fine, it's
  // just ignored now.

  const size = () => local.size ?? "default";

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
    // animate-fade-in was removed to prevent CLS (layout shift) on page
    // load. The animation's `both` fill-mode caused the page container
    // to reserve different space during the opacity transition, shifting
    // sibling elements by ~0.98 layout shift units (Vercel CLS audit).
    // Content now renders immediately without a fade-in.
    if (local.class) classes.push(local.class);
    return classes.join(" ");
  };

  const resolvedStyle = (): JSX.CSSProperties => ({
    "padding-top": resolvedPaddingTop(),
    "padding-bottom": resolvedPaddingBottom(),
    ...(local.style && typeof local.style === "object" ? local.style : {}),
  });

  return (
    <div
      role="region"
      aria-label="Page content"
      {...rest}
      class={containerClass()}
      style={resolvedStyle()}
      tabindex={-1}
    >
      {local.children}
    </div>
  );
};

export { PageContainer };
export default PageContainer;
