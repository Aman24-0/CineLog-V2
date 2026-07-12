// src/shared/ui/premium/cards/PremiumCollectionPreview.tsx
import { Component, JSX, Show, For, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Collection type controlling the type icon badge. */
type CollectionType = "folder" | "universe" | "smart" | "curated";

/** Collection color accent theme. */
type CollectionColor = "favorites" | "universe" | "recommendation" | "trending" | "theatre" | "ott";

/** Poster entry for the preview stack. */
interface CollectionPoster {
  /** Image URL. */
  url: string;
  /** Alt text for the image. */
  alt: string;
}

// ─── Token Maps ────────────────────────────────────────────────

const colorMap: Record<CollectionColor, { bg: string; text: string; border: string; glow: string }> = {
  favorites: {
    bg: "bg-collection-favorites",
    text: "text-collection-favorites",
    border: "border-collection-favorites",
    glow: "shadow-[0_0_var(--space-2)_var(--color-collection-favorites)]",
  },
  universe: {
    bg: "bg-collection-universe",
    text: "text-collection-universe",
    border: "border-collection-universe",
    glow: "shadow-[0_0_var(--space-2)_var(--color-collection-universe)]",
  },
  recommendation: {
    bg: "bg-collection-recommendation",
    text: "text-collection-recommendation",
    border: "border-collection-recommendation",
    glow: "shadow-[0_0_var(--space-2)_var(--color-collection-recommendation)]",
  },
  trending: {
    bg: "bg-collection-trending",
    text: "text-collection-trending",
    border: "border-collection-trending",
    glow: "shadow-[0_0_var(--space-2)_var(--color-collection-trending)]",
  },
  theatre: {
    bg: "bg-collection-theatre",
    text: "text-collection-theatre",
    border: "border-collection-theatre",
    glow: "shadow-[0_0_var(--space-2)_var(--color-collection-theatre)]",
  },
  ott: {
    bg: "bg-collection-ott",
    text: "text-collection-ott",
    border: "border-collection-ott",
    glow: "shadow-[0_0_var(--space-2)_var(--color-collection-ott)]",
  },
};

const typeIconMap: Record<CollectionType, string> = {
  folder: "folder",
  universe: "public",
  smart: "auto_awesome",
  curated: "verified",
};

const typeLabelMap: Record<CollectionType, string> = {
  folder: "Folder",
  universe: "Universe",
  smart: "Smart",
  curated: "Curated",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumCollectionPreviewProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Collection title. */
  title: string;
  /** Number of items in the collection. */
  count: number;
  /** Collection type — determines the type icon badge. */
  type?: CollectionType;
  /** Poster entries for the stacked preview. */
  posters?: CollectionPoster[];
  /** Color accent theme. @default "favorites" */
  color?: CollectionColor;
  /** Last updated timestamp/text. */
  lastUpdated?: string;
  /** Whether the card is in a loading state — renders skeleton. @default false */
  loading?: boolean;
  /** Click handler. */
  onClick?: (e: MouseEvent) => void;
  /** Whether the card is in a selected state. @default false */
  selected?: boolean;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumCollectionPreviewProps,
  "color" | "loading" | "selected" | "type"
>> & { posters?: CollectionPoster[]; lastUpdated?: string } = {
  color: "favorites",
  loading: false,
  selected: false,
  type: "folder",
  posters: undefined,
  lastUpdated: undefined,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumCollectionPreview — a collection preview card with poster stack.
 *
 * Renders a collection preview card with: a stacked poster display at the top,
 * a title and count below, a type icon badge, and a color accent on the
 * border or glow using collection-specific color tokens.
 *
 * **Collection colors** provide a unique accent for each collection type:
 * - `favorites` — collection-favorites color tokens
 * - `universe` — collection-universe color tokens
 * - `recommendation` — collection-recommendation color tokens
 * - `trending` — collection-trending color tokens
 * - `theatre` — collection-theatre color tokens
 * - `ott` — collection-ott color tokens
 *
 * **Type badges** show an icon identifying the collection type:
 * - `folder` — folder icon
 * - `universe` — globe/public icon
 * - `smart` — auto-awesome icon
 * - `curated` — verified icon
 *
 * **Selected** state adds accent border and dim glow.
 *
 * **Loading** state renders a skeleton placeholder.
 *
 * All transitions respect `prefers-reduced-motion` via global baseline.
 *
 * @example
 * ```tsx
 * <PremiumCollectionPreview
 *   title="My Favorites"
 *   count={42}
 *   type="folder"
 *   color="favorites"
 *   posters={[
 *     { url: "/p1.jpg", alt: "Movie 1" },
 *     { url: "/p2.jpg", alt: "Movie 2" },
 *   ]}
 *   lastUpdated="2 hours ago"
 *   onClick={() => navigate("/collection/favorites")}
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --collection-*, --tier-*, --hairline
 * - Typography: --font-display, --font-label, --font-body
 * - Spacing: --space-2 through --space-4
 * - Radius: --radius-lg, --radius-sm
 * - Shadows: --shadow-card, --shadow-glow (collection-specific)
 */
const PremiumCollectionPreview: Component<PremiumCollectionPreviewProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "title", "count", "type", "posters", "color",
    "lastUpdated", "loading", "onClick", "selected",
    "class", "style",
  ]);

  const colorTokens = () => colorMap[local.color];
  const visiblePosters = () => (local.posters || []).slice(0, 3);

  /** Card classes. */
  const cardClasses = (): string => {
    const classes: string[] = [
      "relative",
      "overflow-hidden",
      "rounded-lg",
      "bg-tier-2",
      "shadow-card",
      "p-4",
      "flex flex-col gap-3",
    ];

    // Interactive
    if (local.onClick) {
      classes.push(
        "cursor-pointer",
        "focus-ring",
        "transition-[transform,box-shadow,border-color]",
        "duration-base",
        "ease-standard",
        "hover:shadow-raised",
        "hover:scale-[1.01]",
        "active:scale-[0.99]",
        "active:duration-fast",
      );
    }

    // Selected
    if (local.selected) {
      classes.push("ring-2", colorTokens().border);
      classes.push(colorTokens().glow);
    }

    // Accent border (subtle, always visible)
    classes.push("border", "border-hairline");

    if (local.class) classes.push(local.class);

    return classes.filter(Boolean).join(" ");
  };

  /** Card inline style for collection color accents. */
  const cardStyle = (): JSX.CSSProperties => {
    const base = (local.style as Record<string, string>) || {};
    if (local.selected) {
      return {
        "border-color": "var(--p)",
        "--tw-ring-color": "var(--p)",
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
      class={cardClasses()}
      style={cardStyle()}
      role={local.onClick ? "button" : undefined}
      tabindex={local.onClick ? 0 : undefined}
      onClick={local.onClick}
      onKeyDown={local.onClick ? handleKeyDown : undefined}
      aria-label={local.onClick ? `${local.title}: ${local.count} items` : undefined}
      aria-pressed={local.selected || undefined}
    >
      <Show
        when={!local.loading}
        fallback={
          /* Loading skeleton */
          <div class="flex flex-col gap-3">
            {/* Poster stack skeleton */}
            <div class="flex items-end -space-x-2">
              <For each={Array.from({ length: 3 })}>
                {() => (
                  <div
                    class="w-10 h-14 rounded-sm bg-tier-1 border border-hairline overflow-hidden relative"
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
            {/* Title skeleton */}
            <div class="h-4 w-3/4 rounded-sm bg-tier-1" aria-hidden="true" />
            {/* Count skeleton */}
            <div class="h-3 w-1/3 rounded-sm bg-tier-1" aria-hidden="true" />
          </div>
        }
      >
        {/* Poster stack area */}
        <div class="relative flex items-end -space-x-2 min-h-14">
          <Show
            when={visiblePosters().length > 0}
            fallback={
              /* Empty poster placeholder */
              <div class={`w-14 h-14 rounded-md ${colorTokens().bg} opacity-20 flex items-center justify-center`}>
                <span class={`material-symbols-outlined text-xl ${colorTokens().text} opacity-40`} aria-hidden="true">
                  {typeIconMap[local.type!]}
                </span>
              </div>
            }
          >
            <For each={visiblePosters()}>
              {(poster, index) => (
                <div
                  class="w-10 h-14 rounded-sm overflow-hidden border-2 border-tier-4 relative"
                  style={{ "z-index": String((index() + 1) * 10) }}
                >
                  <img
                    src={poster.url}
                    alt={poster.alt}
                    class="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
            </For>
          </Show>

          {/* Type icon badge */}
          <div class={[
            "absolute",
            "top-0",
            "right-0",
            "z-badge",
            "flex items-center justify-center",
            "w-6 h-6",
            "rounded-full",
            "bg-tier-3",
            "border",
            "border-hairline",
          ].join(" ")}>
            <span
              class={`material-symbols-outlined text-2xs ${colorTokens().text}`}
              aria-label={typeLabelMap[local.type!]}
              style={{ "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            >
              {typeIconMap[local.type!]}
            </span>
          </div>
        </div>

        {/* Content area */}
        <div class="flex flex-col gap-1">
          {/* Title */}
          <h4 class="text-sm font-display text-strong line-clamp-1">
            {local.title}
          </h4>

          {/* Count + last updated */}
          <div class="flex items-center gap-2">
            <span class={`text-2xs font-label ${colorTokens().text}`}>
              {local.count} {local.count === 1 ? "item" : "items"}
            </span>
            <Show when={local.lastUpdated}>
              <span class="text-2xs text-dim" aria-hidden="true">·</span>
              <span class="text-2xs font-body text-muted">
                {local.lastUpdated}
              </span>
            </Show>
          </div>
        </div>

        {/* Accent glow bar at bottom */}
        <div
          class="absolute bottom-0 inset-x-0 h-0.5 opacity-60"
          style={{ background: "var(--p)" }}
          aria-hidden="true"
        />
      </Show>
    </div>
  );
};

export { PremiumCollectionPreview };
export type { CollectionType, CollectionColor, CollectionPoster };
export default PremiumCollectionPreview;
