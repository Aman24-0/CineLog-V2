// src/shared/ui/SafeImage.tsx
import { Show, createSignal, createEffect, type Component, type JSX } from "solid-js";

/**
 * SafeImage — defensive <img> wrapper with built-in load-error fallback.
 *
 * Why this exists
 * ---------------
 * TMDB / OMDb image URLs can fail at runtime even when the path is
 * present: CDN hiccups, expired tokens, regional blocks, or a path
 * that exists in the API payload but has no corresponding asset on the
 * image CDN. Without an `onError` handler the browser renders a broken
 * image glyph, which is especially visible on the full-bleed cinematic
 * backdrop and the "You May Also Like" poster rail.
 *
 * This component centralises the same signal-based pattern already used
 * by `MovieCard` so every details-page image gets consistent fallback
 * behaviour without duplicating the `createSignal` boilerplate per call
 * site (which is particularly awkward inside `<For>` loops where each
 * item needs its own error state).
 *
 * SSR safety
 * ----------
 * Pure props in, signals out — no client-only APIs. Renders the
 * fallback during SSR if `src` is empty, otherwise renders the `<img>`
 * and lets hydration swap to the fallback if it errors on the client.
 *
 * Usage
 * -----
 *   <SafeImage
 *     src={tmdbImage(t.poster_path, "w185")}
 *     alt=""
 *     class="similar-title-poster-img"
 *     fallback={<div class="similar-title-poster-fallback">…</div>}
 *   />
 */

export interface SafeImageProps {
  /** Image URL. When empty or falsy, the fallback is rendered immediately. */
  src: string;
  /** Alt text. Use "" for decorative images (aria-hidden should also be set by caller). */
  alt?: string;
  /** Extra classes applied to the <img> when it is rendered. */
  class?: string;
  /** Inline styles applied to the <img> when it is rendered. */
  style?: JSX.CSSProperties | string;
  /** Fallback content rendered when src is empty OR the image fails to load. */
  fallback?: JSX.Element;
  /** Optional onError callback forwarded after the internal state flips. */
  onError?: () => void;
  /** Pass-through for native loading attr (default "lazy"). */
  loading?: "lazy" | "eager";
  /** Pass-through for native decoding attr (default "async"). */
  decoding?: "async" | "sync" | "auto";
}

const SafeImage: Component<SafeImageProps> = (props) => {
  const [errored, setErrored] = createSignal(false);

  // Reset error state when src changes — otherwise a previous failed
  // image would show the fallback forever, even for a valid new URL
  // (especially important in <For> loops where items may be recycled).
  let prevSrc = props.src;
  createEffect(() => {
    if (props.src !== prevSrc) {
      setErrored(false);
      prevSrc = props.src;
    }
  });

  const showFallback = () => !props.src || errored();

  return (
    <Show when={!showFallback()} fallback={props.fallback ?? null}>
      <img
        src={props.src}
        alt={props.alt ?? ""}
        class={props.class}
        style={props.style}
        loading={props.loading ?? "lazy"}
        decoding={props.decoding ?? "async"}
        onError={() => {
          setErrored(true);
          props.onError?.();
        }}
      />
    </Show>
  );
};

export default SafeImage;
