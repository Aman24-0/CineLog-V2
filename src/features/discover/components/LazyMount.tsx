// src/features/discover/components/LazyMount.tsx
import { createSignal, onMount, onCleanup, Show, type Component, type JSX } from "solid-js";
import { isServer } from "solid-js/web";

interface LazyMountProps {
  /** Rendered children once the wrapper has been intersected at least once. */
  children: JSX.Element;
  /**
   * Placeholder shown before intersection. Defaults to a zero-height
   * sentinel so layout doesn't shift on mount.
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
 * On the server it renders children immediately (SSR has no IO and the
 * first viewport is rendered synchronously anyway). On the client it
 * mounts a sentinel and only renders its children once the sentinel
 * enters the viewport (or comes within `rootMargin` of it). Once
 * intersected, it stays mounted — there's no "un-lazy" path. This is
 * the right contract for Discover sections: data is cached, so re-shows
 * are instant and we never want to unmount a section the user has seen.
 *
 * The wrapper itself is a 0-height div so it doesn't affect layout.
 * Children render inside it after intersection.
 */
const LazyMount: Component<LazyMountProps> = (props) => {
  const [visible, setVisible] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;

  onMount(() => {
    if (isServer) {
      setVisible(true);
      return;
    }
    if (!sentinel) {
      setVisible(true);
      return;
    }
    // Respect users who can't afford motion: still lazy-mount, but with
    // a larger rootMargin so things appear slightly before they're needed.
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
