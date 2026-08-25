// src/shared/ui/ScrollToTop.tsx
import { createSignal, onMount, onCleanup } from "solid-js";

/**
 * ScrollToTop — floating button that appears after the user scrolls.
 *
 * Uses IntersectionObserver (more performant than scroll events) to detect
 * when a sentinel element at the top of the page is out of view. When the
 * sentinel is not visible, the button appears.
 *
 * The button is positioned in the thumb zone (bottom-right, above the nav bar)
 * and uses a frosted glass surface for visibility against any background.
 *
 * Clicking scrolls to top with smooth behavior (respects reduced-motion).
 *
 * SCROLL CONTAINER SUPPORT (v2.3):
 *   Pass `scrollContainer` (a CSS selector) to make the button scroll a
 *   nested scrollable element (e.g. the cinematic modal's `.cinematic-scroll`)
 *   instead of the window. When set, the IntersectionObserver uses that
 *   element as its `root`, and the click handler scrolls it to the top.
 *   This lets the same FAB work inside modals (Details) and pages.
 *
 * VISIBILITY:
 *   The button is always rendered (so the CSS opacity/transform transition
 *   works smoothly). The `data-visible` attribute toggles visibility —
 *   `false` collapses it to opacity:0 + pointer-events:none.
 */
export interface ScrollToTopProps {
  /** CSS selector for a nested scroll container. Defaults to window scrolling. */
  scrollContainer?: string;
}

export default function ScrollToTop(props: ScrollToTopProps = {}) {
  const [visible, setVisible] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;
  let resolvedScrollContainer: Element | null = null;

  const resolveScrollContainer = (): Element | null => {
    if (props.scrollContainer) {
      return document.querySelector(props.scrollContainer);
    }

    // DesktopWorkspace owns page scrolling in #main-content; mobile keeps
    // the document as the scroll owner. Detect the former without changing
    // the existing window-scroll behavior on smaller screens.
    const main = document.getElementById("main-content");
    if (!main || main.scrollHeight <= main.clientHeight) return null;
    const overflowY = window.getComputedStyle(main).overflowY;
    return overflowY === "auto" || overflowY === "scroll" ? main : null;
  };

  onMount(() => {
    if (!sentinel) return;

    const updateVisibilityFromScroll = () => {
      const element = resolveScrollContainer();
      if (element) resolvedScrollContainer = element;
      setVisible(element ? element.scrollTop > 200 : window.scrollY > 200);
    };
    const mainContent = document.getElementById("main-content");
    window.addEventListener("scroll", updateVisibilityFromScroll, {
      passive: true
    });
    mainContent?.addEventListener("scroll", updateVisibilityFromScroll, {
      passive: true
    });
    updateVisibilityFromScroll();

    if (typeof IntersectionObserver === "undefined") {
      onCleanup(() => {
        window.removeEventListener("scroll", updateVisibilityFromScroll);
        mainContent?.removeEventListener("scroll", updateVisibilityFromScroll);
      });
      return;
    }

    // If a scroll container selector is provided, resolve it and use it
    // as the IntersectionObserver root. Otherwise observe against the
    // viewport (root: null).
    resolvedScrollContainer = resolveScrollContainer();

    observer = new IntersectionObserver(
      (entries) => {
        // When sentinel is not intersecting (scrolled past it), show button
        setVisible(!entries[0]?.isIntersecting);
      },
      {
        threshold: 0,
        root: resolvedScrollContainer,
        rootMargin: "0px 0px -200px 0px"
      }
    );
    observer.observe(sentinel);
    onCleanup(() => {
      observer?.disconnect();
      window.removeEventListener("scroll", updateVisibilityFromScroll);
      mainContent?.removeEventListener("scroll", updateVisibilityFromScroll);
    });
  });

  const scrollToTop = () => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const element = resolvedScrollContainer ?? resolveScrollContainer();
    if (element) {
      element.scrollTo({
        top: 0,
        behavior: prefersReduced ? "auto" : "smooth"
      });
      return;
    }
    window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
  };

  return (
    <>
      {/* Sentinel — invisible element at the top of the page (or scroll container) */}
      <div
        ref={sentinel}
        style={{
          position: "absolute",
          top: "0",
          left: "0",
          height: "1px",
          width: "1px",
          "pointer-events": "none"
        }}
        aria-hidden="true"
      />

      <button
        type="button"
        class="scroll-to-top"
        data-visible={visible()}
        onClick={scrollToTop}
        aria-label="Scroll to top"
      >
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "20px" }}
          aria-hidden="true"
        >
          keyboard_arrow_up
        </span>
      </button>
    </>
  );
}
