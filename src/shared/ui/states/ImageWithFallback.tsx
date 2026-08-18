// src/shared/ui/states/ImageWithFallback.tsx
//
// Enhanced image component with loading, loaded, error, and missing states.
// Preserves layout dimensions to prevent layout shifts. Uses CineLog's
// glass skeleton as the loading/fallback state.
//
// Replaces bare <img> tags throughout the app for consistent image handling.
// For existing SafeImage users, this is a drop-in upgrade.

import { Component, JSX, Show, createSignal, createEffect, splitProps, mergeProps } from "solid-js";
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
  const [local, rest] = splitProps(props, [
    "src", "alt", "class", "style", "fallback", "loadingSkeleton",
    "placeholderIcon", "onLoad", "onError", "loading", "decoding", "width", "height"
  ]);

  const [state, setState] = createSignal<"loading" | "loaded" | "error">("loading");

  // Reset state when src changes
  createEffect(() => {
    local.src; // track
    setState(local.src ? "loading" : "error");
  });

  const defaultFallback = () => (
    <div
      class={`relative flex items-center justify-center overflow-hidden ${local.class || ""}`}
      style={{
        ...(typeof local.style === "object" ? local.style : {}),
        ...(local.width ? { width: `${local.width}px` } : {}),
        ...(local.height ? { height: `${local.height}px` } : {})
      }}
      aria-label={local.alt || "Image unavailable"}
      role="img"
    >
      <span
        class="material-symbols-outlined text-xl text-text-muted/50"
        style={{ "font-variation-settings": "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        aria-hidden="true"
      >
        {local.placeholderIcon}
      </span>
    </div>
  );

  const defaultLoadingSkeleton = () => (
    <GlassSkeleton
      variant="block"
      class={local.class}
      style={{
        ...(typeof local.style === "object" ? local.style : {}),
        ...(local.width ? { width: `${local.width}px` } : {}),
        ...(local.height ? { height: `${local.height}px` } : {})
      }}
    />
  );

  return (
    <Show
      when={state() === "loaded"}
      fallback={
        <Show
          when={state() === "loading"}
          fallback={local.fallback ?? defaultFallback()}
        >
          {local.loadingSkeleton ?? defaultLoadingSkeleton()}
        </Show>
      }
    >
      <img
        src={local.src}
        alt={local.alt ?? ""}
        class={local.class}
        style={local.style}
        loading={local.loading}
        decoding={local.decoding}
        width={local.width}
        height={local.height}
        onLoad={() => {
          setState("loaded");
          local.onLoad?.();
        }}
        onError={() => {
          setState("error");
          local.onError?.();
        }}
      />
    </Show>
  );
};

export { ImageWithFallback };
export default ImageWithFallback;
