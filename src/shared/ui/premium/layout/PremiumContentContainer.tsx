// src/shared/ui/premium/layout/PremiumContentContainer.tsx
import { ParentComponent, JSX, splitProps } from "solid-js";

/** Content padding variant. Controls inner spacing density. */
type ContentPadding = "none" | "compact" | "default" | "comfortable";

/** Content border radius variant. */
type ContentRadius = "none" | "sm" | "md" | "lg";

interface PremiumContentContainerProps {
  /** Inner padding variant.
   *  "none" → 0, "compact" → p-3, "default" → p-5, "comfortable" → p-8 */
  padding?: ContentPadding;
  /** Show a subtle border using --hairline token. Default: false. */
  border?: boolean;
  /** Border radius variant. "none" → 0, "sm" → rounded-sm, "md" → rounded-md, "lg" → rounded-lg */
  radius?: ContentRadius;
  /** Apply tier-2 background. Default: true. */
  background?: boolean;
  /** Additional CSS class names. */
  class?: string;
  /** Inline style overrides. */
  style?: JSX.CSSProperties;
}

const paddingMap: Record<ContentPadding, string> = {
  none: "",
  compact: "p-3",
  default: "p-5",
  comfortable: "p-8",
};

const radiusMap: Record<ContentRadius, string> = {
  none: "",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
};

/**
 * PremiumContentContainer — a content container for in-section content grouping.
 *
 * Provides:
 *  - Consistent inner padding for content blocks (none / compact / default / comfortable)
 *  - Optional subtle border with --hairline token for visual separation
 *  - Optional tier-2 background for elevated content areas
 *  - Optional border radius (none / sm / md / lg)
 *  - Fully token-driven — no hardcoded colors, spacing, or radii
 *
 * Use this inside PremiumSectionContainer to create visually distinct
 * content blocks within a section, such as:
 *  - Stat panels
 *  - Info cards
 *  - Metadata blocks
 *  - Grouped action lists
 *
 * Usage:
 * ```tsx
 * <PremiumContentContainer padding="default" border radius="md">
 *   <p>Your content here</p>
 * </PremiumContentContainer>
 * ```
 */
const PremiumContentContainer: ParentComponent<PremiumContentContainerProps> = (
  props
) => {
  const [local, rest] = splitProps(props, [
    "padding",
    "border",
    "radius",
    "background",
    "class",
    "style",
    "children",
  ]);

  const padding = () => local.padding ?? "default";
  const showBorder = () => local.border ?? false;
  const radius = () => local.radius ?? "none";
  const showBackground = () => local.background ?? true;

  const containerClass = () => {
    const classes: string[] = [];

    // Padding
    if (paddingMap[padding()]) classes.push(paddingMap[padding()]);

    // Radius
    if (radiusMap[radius()]) classes.push(radiusMap[radius()]);

    // Background
    if (showBackground()) classes.push("bg-tier-2");

    // Border
    if (showBorder()) classes.push("border");

    // Custom class
    if (local.class) classes.push(local.class);

    return classes.join(" ");
  };

  const resolvedStyle = (): JSX.CSSProperties => {
    const base: JSX.CSSProperties = {};

    if (showBorder()) {
      base["border-color"] = "var(--hairline)";
    }

    if (local.style && typeof local.style === "object") {
      Object.assign(base, local.style);
    }

    return base;
  };

  return (
    <div
      {...rest}
      class={containerClass()}
      style={resolvedStyle()}
      role="region"
    >
      {local.children}
    </div>
  );
};

export { PremiumContentContainer };
export default PremiumContentContainer;
