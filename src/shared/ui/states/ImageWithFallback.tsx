// src/shared/ui/states/ImageWithFallback.tsx
//
// Enhanced image component with loading, loaded, error, and missing states.
// Preserves layout dimensions to prevent layout shifts. Uses CineLog's
// glass skeleton as the loading/fallback state.
//
// Replaces bare <img> tags throughout the app for consistent image handling.
// For existing SafeImage users, this is a drop-in upgrade.

import { Component, JSX, Show, createSignal, createEffect, mergeProps } from "solid-js";
import { GlassSkeleton } from "~/shared/ui/glass";

export interface ImageWithFallbackProps {
  /** Image source URL */
  src: string;
  /** Alt text — required for accessibility */
  alt?: string;
  /** CSS class */
  class?: string;
  /** CSS style */
  style?: JSX.CSSProperties | string;
  /** Custom fallback element when image fails or src is empty */
  fallback?: JSX.Element;
  /** Custom loading skeleton element */
  loadingSkeleton?: JSX.Element;
  /** Material Symbols icon to show as placeholder. Default "image" */
  placeholderIcon?: string;
  /** Called when image loads successfully */
  onLoad?: () => void;
  /** Called when image fails to load */
  onError?: () => void;
  /** Loading strategy. Default "lazy" */
  loading?: "lazy" | "eager";
  /** Decoding strategy. Default "async" */
  decoding?: "async" | "sync" | "auto";
  /** Intrinsic width for layout stability */
  width?: number;
  /** Intrinsic height for layout stability */
  height?: number;
}

const defaultProps: Required<
  Pick<ImageWithFallbackProps, "placeholderIcon" | "loading" | "decoding">
> = {
  placeholderIcon: "image",
  loading: "lazy",
  decoding: "async"
};

const ImageWithFallback: Component<ImageWithFallbackProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [state, setState] = createSignal<"loading" | "loaded" | "error">("loading");

  // Reset state when src changes
  createEffect(() => {
    const src = rawProps.src;
    void src; // track dependency
    setState(src ? "loading" : "error");
  });

  const defaultFallback = () => (
    <div
      class={`relative flex items-center justify-center overflow-hidden ${props.class || ""}`}
      style={{
        ...(typeof props.style === "object" ? props.style : {}),
        ...(props.width ? { width: `${props.width}px` } : {}),
        ...(props.height ? { height: `${props.height}px` } : {})
      }}
      aria-label={props.alt || "Image unavailable"}
      role="img"
    >
      <span
        class="material-symbols-outlined text-xl text-text-muted/50"
        style={{ "font-variation-settings": "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        aria-hidden="true"
      >
        {props.placeholderIcon}
      </span>
    </div>
  );

  const defaultLoadingSkeleton = () => (
    <GlassSkeleton
      variant="block"
      class={props.class}
      style={{
        ...(typeof props.style === "object" ? props.style : {}),
        ...(props.width ? { width: `${props.width}px` } : {}),
        ...(props.height ? { height: `${props.height}px` } : {})
      }}
    />
  );

  return (
    <Show
      when={state() === "loaded"}
      fallback={
        <Show
          when={state() === "loading"}
          fallback={props.fallback ?? defaultFallback()}
        >
          {props.loadingSkeleton ?? defaultLoadingSkeleton()}
        </Show>
      }
    >
      <img
        src={props.src}
        alt={props.alt ?? ""}
        class={props.class}
        style={props.style}
        loading={props.loading}
        decoding={props.decoding}
        width={props.width}
        height={props.height}
        onLoad={() => {
          setState("loaded");
          props.onLoad?.();
        }}
        onError={() => {
          setState("error");
          props.onError?.();
        }}
      />
    </Show>
  );
};

export { ImageWithFallback };
export default ImageWithFallback;
