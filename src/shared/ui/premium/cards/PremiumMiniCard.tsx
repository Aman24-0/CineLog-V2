// src/shared/ui/premium/cards/PremiumMiniCard.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Mini card aspect ratio. */
type MiniAspectRatio = "2:3" | "16:9";

/** Watch status for the status badge. */
type WatchStatus = "watching" | "completed" | "planned" | "paused" | "dropped";

// ─── Token Maps ────────────────────────────────────────────────

const aspectRatioMap: Record<MiniAspectRatio, string> = {
  "2:3": "aspect-[2/3]",
  "16:9": "aspect-video",
};

const statusColorMap: Record<WatchStatus, { bg: string; text: string }> = {
  watching: { bg: "bg-watching-bg", text: "text-watching" },
  completed: { bg: "bg-completed-bg", text: "text-completed" },
  planned: { bg: "bg-planned-bg", text: "text-planned" },
  paused: { bg: "bg-paused-bg", text: "text-paused" },
  dropped: { bg: "bg-dropped-bg", text: "text-dropped" },
};

const statusLabelMap: Record<WatchStatus, string> = {
  watching: "Watching",
  completed: "Completed",
  planned: "Planned",
  paused: "Paused",
  dropped: "Dropped",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumMiniCardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Title text — single line, truncated. */
  title: string;
  /** Subtitle text — smaller, muted. */
  subtitle?: string;
  /** Poster image URL. */
  imageUrl?: string;
  /** Alt text for the poster image. @default "" */
  imageAlt?: string;
  /** Badge text shown in the top-left corner. */
  badge?: string;
  /** Watch status for the colored status badge. */
  status?: WatchStatus;
  /** Rating value (0-10), shown as a star + number in the bottom area. */
  rating?: number;
  /** Aspect ratio of the poster image. @default "2:3" */
  aspectRatio?: MiniAspectRatio;
  /** Whether the card is in a loading state — renders skeleton. @default false */
  loading?: boolean;
  /** Click handler. */
  onClick?: (e: MouseEvent) => void;
  /** Whether the card is in a selected state. @default false */
  selected?: boolean;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumMiniCardProps,
  "aspectRatio" | "loading" | "selected" | "imageAlt"
>> & { rating?: number; status?: WatchStatus; badge?: string } = {
  aspectRatio: "2:3",
  loading: false,
  selected: false,
  imageAlt: "",
  rating: undefined,
  status: undefined,
  badge: undefined,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumMiniCard — a compact card for rails and dense grids.
 *
 * Renders a poster image with gradient overlay at the bottom, a single-line
 * title, subtitle, optional status badge in the top-left, and optional rating
 * star indicator. Designed for compact layouts (~100-130px typical width).
 *
 * **Status badge** uses watch-status color tokens:
 * - `watching` — watching-bg/watching color
 * - `completed` — completed-bg/completed color
 * - `planned` — planned-bg/planned color
 * - `paused` — paused-bg/paused color
 * - `dropped` — dropped-bg/dropped color
 *
 * **Rating** shows a star icon with the numeric value, positioned in the
 * bottom-right area of the poster.
 *
 * **Selected** state adds an accent border (--p) around the card.
 *
 * **Loading** state renders a skeleton placeholder with shimmer.
 *
 * All transitions respect `prefers-reduced-motion` via global baseline.
 *
 * @example
 * ```tsx
 * <PremiumMiniCard
 *   title="Interstellar"
 *   subtitle="2014"
 *   imageUrl="/poster.jpg"
 *   status="completed"
 *   rating={9}
 *   onClick={() => navigate("/movie/123")}
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-2, --tier-3, --p, --status-*-bg, --status-*, --hairline
 * - Typography: --font-body, --font-label, --font-size-*
 * - Spacing: --space-2, --space-3
 * - Radius: --radius-md, --radius-sm
 * - Shadows: --shadow-card
 */
const PremiumMiniCard: Component<PremiumMiniCardProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "title", "subtitle", "imageUrl", "imageAlt", "badge", "status",
    "rating", "aspectRatio", "loading", "onClick", "selected",
    "class", "style",
  ]);

  /** Card classes. */
  const cardClasses = (): string => {
    const classes: string[] = [
      "relative",
      "rounded-md",
      "overflow-hidden",
      "shadow-card",
      "group",
      "w-full",
    ];

    if (local.onClick) {
      classes.push(
        "cursor-pointer",
        "focus-ring",
        "transition-[transform,box-shadow,border-color]",
        "duration-fast",
        "ease-standard",
        "hover:shadow-raised",
        "hover:scale-[1.02]",
        "active:scale-[0.98]",
        "active:duration-fast",
      );
    }

    if (local.selected) {
      classes.push("ring-2", "ring-primary");
    }

    if (local.class) classes.push(local.class);

    return classes.filter(Boolean).join(" ");
  };

  /** Selected ring style using --p token. */
  const selectedStyle = (): JSX.CSSProperties => {
    const base = (local.style as Record<string, string>) || {};
    if (local.selected) {
      return { "--tw-ring-color": "var(--p)", ...base };
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
      style={selectedStyle()}
      role={local.onClick ? "button" : undefined}
      tabindex={local.onClick ? 0 : undefined}
      onClick={local.onClick}
      onKeyDown={local.onClick ? handleKeyDown : undefined}
      aria-label={local.onClick ? local.title : undefined}
      aria-pressed={local.selected || undefined}
    >
      <Show
        when={!local.loading}
        fallback={
          /* Loading skeleton */
          <div class={`${aspectRatioMap[local.aspectRatio]} bg-tier-2 relative overflow-hidden rounded-md`}>
            <div
              class="absolute inset-0 z-overlay"
              style={{
                background: "linear-gradient(90deg, transparent, var(--tier-3), transparent)",
                "background-size": "200% 100%",
                animation: "shimmer 1.8s ease-in-out infinite",
              }}
              aria-hidden="true"
            />
          </div>
        }
      >
        {/* Poster image container */}
        <div class={`${aspectRatioMap[local.aspectRatio]} relative bg-tier-2`}>
          <Show when={local.imageUrl} fallback={<div class="absolute inset-0 bg-tier-1" />}>
            <img
              src={local.imageUrl}
              alt={local.imageAlt || ""}
              class="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          </Show>

          {/* Bottom gradient overlay */}
          <div
            class="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-tier-0/80 to-transparent"
            aria-hidden="true"
          />

          {/* Status badge — top-left */}
          <Show when={local.status}>
            <div class="absolute top-2 left-2 z-badge">
              <span
                class={[
                  "inline-flex items-center",
                  "px-1.5 py-0.5",
                  "rounded-sm",
                  "text-2xs font-label uppercase tracking-eyebrow",
                  statusColorMap[local.status!].bg,
                  statusColorMap[local.status!].text,
                ].join(" ")}
                aria-label={`Status: ${statusLabelMap[local.status!]}`}
              >
                {statusLabelMap[local.status!]}
              </span>
            </div>
          </Show>

          {/* Custom badge — top-left (only if no status) */}
          <Show when={local.badge && !local.status}>
            <div class="absolute top-2 left-2 z-badge">
              <span
                class={[
                  "inline-flex items-center",
                  "px-1.5 py-0.5",
                  "rounded-sm",
                  "text-2xs font-label uppercase tracking-eyebrow",
                  "bg-tier-0/80 text-strong",
                ].join(" ")}
              >
                {local.badge}
              </span>
            </div>
          </Show>

          {/* Rating — bottom-right */}
          <Show when={local.rating !== undefined && local.rating !== null}>
            <div class="absolute bottom-2 right-2 z-badge flex items-center gap-0.5">
              <span class="material-symbols-outlined text-xs text-rating-tmdb" aria-hidden="true">
                star
              </span>
              <span class="text-2xs font-label text-strong">
                {local.rating!.toFixed(1)}
              </span>
            </div>
          </Show>

          {/* Content at bottom of poster */}
          <div class="absolute bottom-0 inset-x-0 p-2 z-content flex flex-col gap-0.5">
            <p class="text-xs font-body text-strong line-clamp-1 leading-tight">
              {local.title}
            </p>
            <Show when={local.subtitle}>
              <p class="text-2xs font-body text-soft line-clamp-1">
                {local.subtitle}
              </p>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

export { PremiumMiniCard };
export default PremiumMiniCard;
