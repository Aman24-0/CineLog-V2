// src/shared/ui/ScrollToTop.tsx
import { createSignal, onMount, onCleanup, Show } from "solid-js";

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
 */
export default function ScrollToTop() {
  const [visible, setVisible] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    // IntersectionObserver is client-only; safe inside onMount
    if (!sentinel || typeof IntersectionObserver === "undefined") return;

    observer = new IntersectionObserver(
      (entries) => {
        // When sentinel is not intersecting (scrolled past it), show button
        setVisible(!entries[0]?.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px 0px -200px 0px" }
    );
    observer.observe(sentinel);
  });

  onCleanup(() => {
    observer?.disconnect();
  });

  const scrollToTop = () => {
    const prefersReduced = typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
  };

  return (
    <>
      {/* Sentinel — invisible element at the top of the page */}
      <div ref={sentinel} style={{ position: "absolute", top: "0", left: "0", height: "1px", width: "1px", "pointer-events": "none" }} aria-hidden="true" />

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
