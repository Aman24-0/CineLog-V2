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
      class={`px-4 sm:px-5 lg:px-12 ${maxWidth()} mx-auto relative z-10 animate-fade-in ${props.class ?? ""}`}
      style={{
        "padding-top": props.paddingTop ?? "var(--sp-6)",
        "padding-bottom": props.paddingBottom ?? "var(--sp-10)",
        ...props.style
      }}
    >
      {props.children}
    </main>
  );
};

export default PageContainer;
