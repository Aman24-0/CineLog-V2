// src/shared/ui/SafeImage.tsx
import { Show, createSignal, createEffect, type Component, type JSX } from "solid-js";

/**
 * SafeImage — defensive <img> wrapper with built-in load-error fallback.
 *
 * Why this exists
 * ---------------
 * TMDB image URLs can fail at runtime even when the path is
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
  /** Intrinsic width — reserves horizontal space before load, reducing CLS. */
  width?: number;
  /** Intrinsic height — reserves vertical space before load, reducing CLS. */
  height?: number;
}

const SafeImage: Component<SafeImageProps> = (props) => {
  const [errored, setErrored] = createSignal(false);

  // Reset error state when src changes so a new image URL gets a fresh attempt.
  createEffect(() => {
    props.src; // track dependency
    setErrored(false);
  });

  const showFallback = () => !props.src || errored();

  /**
   * Default fallback — an icon in a glass container that preserves
   * layout dimensions (width/height) so failed images don't cause
   * Cumulative Layout Shift. When no explicit dimensions are given,
   * uses 2:3 aspect ratio (poster default) and 100% width to fill
   * the parent container.
   */
  const defaultFallback = () => (
    <div
      class={props.class}
      style={{
        ...(typeof props.style === "object" ? props.style : {}),
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        width: props.width ? `${props.width}px` : "100%",
        height: props.height ? `${props.height}px` : undefined,
        "aspect-ratio": !props.width && !props.height ? "2/3" : undefined,
        background: "var(--glass-bg, rgba(255,255,255,0.04))",
        border: "1px solid var(--hairline, rgba(255,255,255,0.08))",
        "border-radius": "var(--radius-md, 0.5rem)",
        overflow: "hidden",
      }}
      aria-hidden="true"
    >
      <span
        class="material-symbols-outlined"
        style={{
          "font-size": "24px",
          color: "var(--text-muted, rgba(255,255,255,0.3))",
          opacity: "0.6",
        }}
        aria-hidden="true"
      >
        broken_image
      </span>
    </div>
  );

  return (
    <Show when={!showFallback()} fallback={props.fallback ?? defaultFallback()}>
      <img
        src={props.src}
        alt={props.alt ?? ""}
        class={props.class}
        style={props.style}
        loading={props.loading ?? "lazy"}
        decoding={props.decoding ?? "async"}
        width={props.width}
        height={props.height}
        onError={() => {
          setErrored(true);
          props.onError?.();
        }}
      />
    </Show>
  );
};

export default SafeImage;
