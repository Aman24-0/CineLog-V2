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
 * ACCESSIBILITY: Renders a <main> landmark (WCAG 2.4.1). Each page
 * uses exactly one PageContainer, so there's exactly one <main> per
 * page — verified by the Vercel accessibility audit.
 *
 * LAYOUT SHIFT (CLS): The `animate-fade-in` class was REMOVED from
 * the <main> element because it caused a 0.98 layout shift on page
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
    <main
      class={`px-5 sm:px-6 lg:px-10 ${maxWidth()} mx-auto relative z-10 ${props.class ?? ""}`}
      style={{
        "padding-top": props.paddingTop ?? "var(--sp-8)",
        "padding-bottom": props.paddingBottom ?? "var(--sp-12)",
        ...props.style
      }}
    >
      {props.children}
    </main>
  );
};

export default PageContainer;
