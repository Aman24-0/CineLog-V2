// src/shared/ui/premium/cards/PremiumPosterStack.tsx
import { Component, JSX, Show, For, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Poster stack size controlling poster count and scale. */
type StackSize = "compact" | "default" | "large";

/** Offset between stacked posters. */
type StackOffset = "tight" | "default" | "wide";

/** Stack visual variant. */
type StackVariant = "default" | "accent";

/** Poster entry for the stack. */
interface PosterEntry {
  /** Image URL. */
  url: string;
  /** Alt text for the image. */
  alt: string;
}

// ─── Token Maps ────────────────────────────────────────────────

const sizeConfig: Record<StackSize, { maxPosters: number; posterWidth: string; posterHeight: string; posterClass: string }> = {
  compact: {
    maxPosters: 3,
    posterWidth: "w-8",
    posterHeight: "h-12",
    posterClass: "rounded-sm",
  },
  default: {
    maxPosters: 4,
    posterWidth: "w-10",
    posterHeight: "h-14",
    posterClass: "rounded-sm",
  },
  large: {
    maxPosters: 5,
    posterWidth: "w-12",
    posterHeight: "h-16",
    posterClass: "rounded-md",
  },
};

const offsetMap: Record<StackOffset, string> = {
  tight: "-space-x-2",
  default: "-space-x-3",
  wide: "-space-x-4",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumPosterStackProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Array of poster entries to stack. */
  posters: PosterEntry[];
  /** Total count to display in the badge. @default posters.length */
  count?: number;
  /** Size preset. @default "default" */
  size?: StackSize;
  /** Offset between posters. @default "default" */
  offset?: StackOffset;
  /** Visual variant. @default "default" */
  variant?: StackVariant;
  /** Whether the stack is in a loading state — renders skeleton. @default false */
  loading?: boolean;
  /** Click handler. */
  onClick?: (e: MouseEvent) => void;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumPosterStackProps,
  "size" | "offset" | "variant" | "loading"
>> & { count?: number } = {
  size: "default",
  offset: "default",
  variant: "default",
  loading: false,
  count: undefined,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumPosterStack — a stacked poster display for collections.
 *
 * Renders overlapping poster images stacked with configurable offset,
 * plus a count badge showing the total number of items.
 *
 * **Sizes:**
 * - `compact` — shows 3 small posters
 * - `default` — shows 4 medium posters
 * - `large` — shows 5 larger posters
 *
 * **Offsets** control how much posters overlap:
 * - `tight` — 8px offset
 * - `default` — 12px offset
 * - `wide` — 16px offset
 *
 * **Accent variant** adds an accent glow border (--p) around the stack.
 *
 * **Loading** state renders a skeleton placeholder.
 *
 * All transitions respect `prefers-reduced-motion` via global baseline.
 *
 * @example
 * ```tsx
 * <PremiumPosterStack
 *   posters={[
 *     { url: "/poster1.jpg", alt: "Movie 1" },
 *     { url: "/poster2.jpg", alt: "Movie 2" },
 *     { url: "/poster3.jpg", alt: "Movie 3" },
 *   ]}
 *   count={24}
 *   size="default"
 *   offset="default"
 *   onClick={() => navigate("/collection/123")}
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-2, --tier-3, --p, --p-glow, --hairline
 * - Spacing: --space-2 through --space-4 (via -space-x-*)
 * - Radius: --radius-sm, --radius-md, --radius-lg
 * - Shadows: --shadow-card
 * - Typography: --font-label, --font-size-*
 * - Z-index: --z-badge, --z-overlay
 */
const PremiumPosterStack: Component<PremiumPosterStackProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "posters", "count", "size", "offset", "variant", "loading",
    "onClick", "class", "style",
  ]);

  const config = () => sizeConfig[local.size];
  const displayCount = () => local.count ?? local.posters.length;
  const visiblePosters = () => local.posters.slice(0, config().maxPosters);

  /** Stack container classes. */
  const stackClasses = (): string => {
    const classes: string[] = [
      "relative",
      "inline-flex",
      "items-end",
      offsetMap[local.offset],
    ];

    if (local.onClick) {
      classes.push(
        "cursor-pointer",
        "focus-ring",
        "rounded-lg",
        "transition-[transform,box-shadow]",
        "duration-base",
        "ease-standard",
        "hover:shadow-raised",
        "hover:scale-[1.02]",
        "active:scale-[0.98]",
        "active:duration-fast",
      );
    }

    if (local.variant === "accent") {
      classes.push("ring-1", "rounded-lg", "p-1");
    }

    if (local.class) classes.push(local.class);

    return classes.filter(Boolean).join(" ");
  };

  /** Accent variant ring style using --p token. */
  const accentStyle = (): JSX.CSSProperties => {
    const base = (local.style as Record<string, string>) || {};
    if (local.variant === "accent") {
      return {
        "--tw-ring-color": "var(--p)",
        "box-shadow": "0 0 var(--space-2) var(--p-glow)",
        ...base,
      };
    }
    return base as JSX.CSSProperties;
  };

  /** Keyboard handler for click activation. */
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!local.onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  };

  return (
    <div
      {...rest}
      class={stackClasses()}
      style={accentStyle()}
      role={local.onClick ? "button" : undefined}
      tabindex={local.onClick ? 0 : undefined}
      onClick={local.onClick}
      onKeyDown={local.onClick ? handleKeyDown : undefined}
      aria-label={local.onClick ? `Collection with ${displayCount()} items` : undefined}
    >
      <Show
        when={!local.loading}
        fallback={
          /* Loading skeleton */
          <div class={`inline-flex items-end ${offsetMap[local.offset]}`}>
            <For each={Array.from({ length: config().maxPosters })}>
              {() => (
                <div
                  class={`${config().posterWidth} ${config().posterHeight} ${config().posterClass} bg-tier-2 border border-hairline overflow-hidden relative`}
                >
                  <div
                    class="absolute inset-0"
                    style={{
                      background: "linear-gradient(90deg, transparent, var(--tier-3), transparent)",
                      "background-size": "200% 100%",
                      animation: "shimmer 1.8s ease-in-out infinite",
                    }}
                    aria-hidden="true"
                  />
                </div>
              )}
            </For>
          </div>
        }
      >
        {/* Poster images */}
        <For each={visiblePosters()}>
          {(poster, index) => {
            const zIndex = (): string => {
              // Higher index = more visible (on top)
              const val = index() + 1;
              return String(val * 10);
            };

            return (
              <div
                class={[
                  config().posterWidth,
                  config().posterHeight,
                  config().posterClass,
                  "overflow-hidden",
                  "border-2",
                  "border-tier-4",
                  "relative",
                ].join(" ")}
                style={{ "z-index": zIndex() }}
              >
                <img
                  src={poster.url}
                  alt={poster.alt}
                  class="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            );
          }}
        </For>

        {/* Count badge — only if more items than visible */}
        <Show when={displayCount() > config().maxPosters}>
          <div
            class={[
              "relative",
              "flex items-center justify-center",
              config().posterWidth,
              config().posterHeight,
              config().posterClass,
              "bg-tier-2",
              "border-2",
              "border-tier-4",
              "z-badge",
            ].join(" ")}
          >
            <span class="text-2xs font-label text-strong">
              +{displayCount() - config().maxPosters}
            </span>
          </div>
        </Show>

        {/* Count badge showing total — always visible on hover */}
        <Show when={displayCount() > 0}>
          <div
            class="absolute -bottom-1 -right-1 z-badge flex items-center justify-center min-w-5 h-5 px-1 bg-tier-3 rounded-full border border-hairline"
          >
            <span class="text-2xs font-label text-strong leading-none">
              {displayCount()}
            </span>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export { PremiumPosterStack };
export type { PosterEntry, StackSize, StackOffset, StackVariant };
export default PremiumPosterStack;
