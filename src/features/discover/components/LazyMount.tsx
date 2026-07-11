// src/features/discover/components/LazyMount.tsx
import { createSignal, onMount, onCleanup, Show, type Component, type JSX } from "solid-js";

interface LazyMountProps {
  /** Rendered children once the wrapper has been intersected at least once. */
  children: JSX.Element;
  /**
   * Placeholder shown before intersection. Defaults to nothing so layout
   * doesn't shift on mount.
   */
  fallback?: JSX.Element;
  /** Distance from the viewport at which to trigger, in px. Default 240px. */
  rootMargin?: string;
  /** Optional id for the wrapper element (useful for ARIA landmarking). */
  id?: string;
}

/**
 * LazyMount — IntersectionObserver-gated wrapper for below-the-fold
 * Discover sections.
 *
 * Initial visible() is ALWAYS false — on both server and client. This
 * avoids hydration mismatches (SSR and client start with the same
 * state). On the client, onMount fires and the IntersectionObserver
 * starts watching the sentinel. When the sentinel scrolls into view
 * (or within rootMargin), visible() becomes true and children render.
 *
 * The sentinel MUST have a layout box (height: 1px, not display: none)
 * — IntersectionObserver cannot detect intersection for elements with
 * display: none (they have no box).
 */
const LazyMount: Component<LazyMountProps> = (props) => {
  const [visible, setVisible] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;

  onMount(() => {
    // onMount only runs on the client — no isServer check needed.
    if (!sentinel) {
      setVisible(true);
      return;
    }
    const margin = props.rootMargin ?? "240px 0px";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: margin, threshold: 0 }
    );
    observer.observe(sentinel);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div id={props.id} class="discover-lazy-mount" data-visible={visible()}>
      <div ref={sentinel} class="discover-lazy-sentinel" aria-hidden="true" />
      <Show when={visible()} fallback={props.fallback}>
        {props.children}
      </Show>
    </div>
  );
};

export default LazyMount;
