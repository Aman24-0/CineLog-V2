// src/shared/ui/premium/layout/PremiumRailContainer.tsx
import { ParentComponent, JSX, splitProps } from "solid-js";

/** Rail gap variant. Controls spacing between rail items. */
type RailGap = "compact" | "default" | "wide";

/** Rail padding variant. Controls horizontal padding of the rail container. */
type RailPadding = "none" | "default";

interface PremiumRailContainerProps {
  /** Gap between items. "compact" → 8px, "default" → 12px, "wide" → 16px */
  gap?: RailGap;
  /** Horizontal padding of the rail container. "none" → 0, "default" → px-5 */
  padding?: RailPadding;
  /** Enable scroll snap for item-to-item snapping. Default: true. */
  scrollSnap?: boolean;
  /** Show visual overflow hint (content peeking past edges). Default: true. */
  showOverflow?: boolean;
  /** Accessible label for the rail region. */
  ariaLabel?: string;
  /** Additional CSS class names. */
  class?: string;
  /** Inline style overrides. */
  style?: JSX.CSSProperties;
}

const gapMap: Record<RailGap, string> = {
  compact: "var(--space-2)",   // 8px
  default: "var(--space-3)",   // 12px
  wide: "var(--space-4)",      // 16px
};

const paddingMap: Record<RailPadding, string> = {
  none: "",
  default: "px-5",
};

/**
 * PremiumRailContainer — a horizontal scrolling rail container.
 *
 * Provides:
 *  - Configurable gap between items (compact / default / wide)
 *  - Optional horizontal padding (aligned with page container or flush)
 *  - Scroll snap type x mandatory for item-to-item snapping
 *  - Hidden scrollbar for clean editorial aesthetic
 *  - Right padding buffer for overflow visibility (content peeking)
 *  - Full accessibility: role="list", aria-label, keyboard scrollable
 *  - All spacing via design tokens — no hardcoded values
 *
 * The rail is designed for horizontal card lists (movie cards, genre pills,
 * collection thumbnails, etc.). Items inside should use role="listitem"
 * or be wrapped in elements with appropriate semantics.
 *
 * Scroll behavior:
 *  - scroll-snap-type: x mandatory (when enabled) ensures items snap cleanly
 *  - -webkit-overflow-scrolling: touch provides momentum scrolling on iOS
 *  - Overflow is visible by default (showOverflow) to hint at more content
 *
 * Usage:
 * ```tsx
 * <PremiumRailContainer gap="default" ariaLabel="Trending movies">
 *   <MovieCard item={item1} />
 *   <MovieCard item={item2} />
 * </PremiumRailContainer>
 * ```
 */
const PremiumRailContainer: ParentComponent<PremiumRailContainerProps> = (
  props
) => {
  const [local, rest] = splitProps(props, [
    "gap",
    "padding",
    "scrollSnap",
    "showOverflow",
    "ariaLabel",
    "class",
    "style",
    "children",
  ]);

  const gap = () => local.gap ?? "default";
  const padding = () => local.padding ?? "default";
  const scrollSnap = () => local.scrollSnap ?? true;
  const showOverflow = () => local.showOverflow ?? true;

  const containerClass = () => {
    const classes: string[] = [
      "flex",
      "overflow-x-auto",
      "hide-scrollbar",
    ];

    // Padding
    if (paddingMap[padding()]) classes.push(paddingMap[padding()]);

    // Custom class
    if (local.class) classes.push(local.class);

    return classes.join(" ");
  };

  const resolvedStyle = (): JSX.CSSProperties => {
    const base: JSX.CSSProperties = {
      "gap": gapMap[gap()],
      "-webkit-overflow-scrolling": "touch",
    };

    // Scroll snap
    if (scrollSnap()) {
      base["scroll-snap-type"] = "x mandatory";
    }

    // Overflow buffer — right padding so last item doesn't clip
    if (showOverflow()) {
      base["padding-right"] = "var(--space-5)";
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
      role="list"
      aria-label={local.ariaLabel ?? "Content rail"}
    >
      {local.children}
    </div>
  );
};

export { PremiumRailContainer };
export default PremiumRailContainer;
