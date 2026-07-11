// src/features/discover/components/LazyMount.tsx
import { createSignal, onMount, onCleanup, Show, type Component, type JSX } from "solid-js";
import { isServer } from "solid-js/web";

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
 * SSR: children render immediately (no IntersectionObserver on server,
 * and we want the below-the-fold sections present in the SSR HTML so
 * the page is complete before hydration).
 *
 * Client: on mount, a sentinel is observed. Children render once the
 * sentinel enters the viewport (or comes within `rootMargin` of it).
 * Once intersected, it stays mounted — there's no "un-lazy" path.
 *
 * Why render children during SSR even though they're "lazy": the
 * laziness is about deferring client-side mount effects (data fetches,
 * event listeners) — not about omitting DOM. SSR-included children
 * hydrate cleanly without a flash of empty content.
 */
const LazyMount: Component<LazyMountProps> = (props) => {
  // Server renders children immediately. Client starts hidden and
  // reveals on intersection.
  const [visible, setVisible] = createSignal(isServer);
  let sentinel: HTMLDivElement | undefined;

  onMount(() => {
    if (isServer) return;
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
