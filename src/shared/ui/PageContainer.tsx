// src/shared/ui/PageContainer.tsx
import { ParentComponent, JSX } from "solid-js";

interface PageContainerProps {
  /** Page width variant. "narrow" for text-heavy pages, "wide" for grids. */
  width?: "narrow" | "wide";
  /** Override top padding (default: var(--sp-6) = 24px). */
  paddingTop?: string;
  /** Override bottom padding (default: var(--sp-10) = 40px). */
  paddingBottom?: string;
  class?: string;
  style?: JSX.CSSProperties;
}

/**
 * PageContainer — the single source of truth for page-level rhythm.
 *
 * Every page (Dashboard, Watchlist, future pages) wraps its content in
 * PageContainer. This guarantees:
 *  - Consistent horizontal padding (px-5 mobile, lg:px-12 desktop)
 *  - Consistent max-width per page type (narrow=2xl, wide=none)
 *  - Consistent top/bottom rhythm
 *  - Centered on desktop
 *  - Relative z-index above ambient effects
 *
 * ACCESSIBILITY: Renders a `<div role="region">` (NOT a `<main>`) so
 * there is exactly ONE `<main>` landmark per page — provided by the
 * AppShell root layout. Multiple `<main>` tags violate WCAG 2.4.1
 * and were flagged by the Vercel accessibility audit.
 *
 * LAYOUT SHIFT (CLS): The `animate-fade-in` class was REMOVED from
 * the page container because it caused a 0.98 layout shift on page
 * load. The animation used `both` fill-mode (opacity: 0 → 1) which
 * made the browser reserve different space during the animation,
 * shifting sibling elements (stats-glass-box, etc.). Content now
 * renders immediately without a fade-in animation — the page is
 * visible as soon as the HTML arrives, eliminating the shift.
 *
 * Usage:
 *   <PageContainer width="narrow">
 *     <Section title="Continue Watching">...</Section>
 *   </PageContainer>
 */
const PageContainer: ParentComponent<PageContainerProps> = (props) => {
  const width = () => props.width ?? "narrow";
  const maxWidth = () =>
    width() === "narrow" ? "max-w-2xl lg:max-w-4xl" : "";

  return (
    <div
      role="region"
      aria-label="Page content"
      class={`w-full px-4 sm:px-5 lg:px-12 ${maxWidth()} mx-auto relative z-10 ${props.class ?? ""}`}
      style={{
        "padding-top": props.paddingTop ?? "var(--sp-6)",
        "padding-bottom": props.paddingBottom ?? "var(--sp-10)",
        ...props.style
      }}
    >
      {props.children}
    </div>
  );
};

export default PageContainer;
