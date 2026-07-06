// src/shared/ui/primitives/GlassCard.tsx
import { Component, JSX, splitProps } from "solid-js";

type GlassStrength = "default" | "strong";

interface GlassCardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  strength?: GlassStrength;
  padding?: string;
  radius?: string;
}

/**
 * Premium glass surface primitive.
 *
 * A frosted-glass container with backdrop blur. Use for:
 *  - Insights panels
 *  - Floating overlays
 *  - Modal-style cards inside dashboards
 *
 * Variants:
 *  - default: 72% opacity, 20px blur (subtle frost)
 *  - strong:  88% opacity, 28px blur (more opaque, for high-contrast content)
 *
 * Note: backdrop-filter requires the element to not be inside an overflow
 * container with filter/transform ancestors. Use .surface-raised instead
 * if you need a plain solid card without blur.
 */
const GlassCard: Component<GlassCardProps> = (props) => {
  const [local, rest] = splitProps(props, [
    "strength", "padding", "radius", "class", "style", "children"
  ]);

  const classBase = () =>
    local.strength === "strong" ? "surface-glass-strong" : "surface-glass";

  const resolvedStyle = (): JSX.CSSProperties => {
    const base: JSX.CSSProperties = {};
    if (local.padding) base.padding = local.padding;
    if (local.radius) base["border-radius"] = local.radius;
    if (local.style && typeof local.style === "object") Object.assign(base, local.style);
    return base;
  };

  return (
    <div
      {...rest}
      class={`${classBase()}${local.class ? ` ${local.class}` : ""}`}
      style={resolvedStyle()}
    >
      {local.children}
    </div>
  );
};

export default GlassCard;
