// src/shared/ui/primitives/Skeleton.tsx
import { Component, JSX } from "solid-js";

interface SkeletonProps {
  /** Width — any CSS length string. Default "100%". */
  width?: string;
  /** Height — any CSS length string. Default "1rem". */
  height?: string;
  /** Border radius — any CSS length string. Default var(--radius-md). */
  radius?: string;
  /** Use the text skeleton style (subtler shimmer) instead of block. */
  variant?: "block" | "text";
  class?: string;
  style?: JSX.CSSProperties;
}

/**
 * Premium skeleton primitive for loading states.
 *
 * Uses the .skeleton-base / .skeleton-text CSS classes from globals.css
 * for the shimmer animation. Both are SSR-safe (pure CSS, no JS).
 *
 * Usage:
 *   <Skeleton width="60%" height="1.5rem" variant="text" />
 *   <Skeleton width="100%" height="200px" />  // block default
 */
const Skeleton: Component<SkeletonProps> = (props) => {
  const variant = () => props.variant ?? "block";
  const classBase = () => variant() === "text" ? "skeleton-text" : "skeleton-base";

  return (
    <div
      class={`${classBase()}${props.class ? ` ${props.class}` : ""}`}
      style={{
        width: props.width ?? "100%",
        height: props.height ?? "1rem",
        "border-radius": props.radius ?? (variant() === "text" ? "var(--radius-sm)" : "var(--radius-md)"),
        ...props.style
      }}
      aria-hidden="true"
    />
  );
};

export default Skeleton;
