// src/shared/ui/premium/cards/PremiumHorizontalCard.tsx
import { Component, JSX, Show, For, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Horizontal card visual variant. */
type HorizontalVariant = "default" | "elevated" | "glass";

/** Watch status for the status badge. */
type WatchStatus = "watching" | "completed" | "planned" | "paused" | "dropped";

/** Action item for the horizontal card. */
interface HorizontalAction {
  /** Material Symbol icon name. */
  icon: string;
  /** Accessible label. */
  label: string;
  /** Click handler. */
  onClick: (e: MouseEvent) => void;
}

// ─── Token Maps ────────────────────────────────────────────────

const variantClasses: Record<HorizontalVariant, string> = {
  default: "bg-tier-2 shadow-card",
  elevated: "bg-tier-3 shadow-raised",
  glass: "bg-glass backdrop-blur-lg border border-glass-border",
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

export interface PremiumHorizontalCardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Title text. */
  title: string;
  /** Subtitle text — smaller, muted. */
  subtitle?: string;
  /** Description text — 2-line clamp. */
  description?: string;
  /** Image URL (poster/thumbnail on the left). */
  imageUrl?: string;
  /** Alt text for the image. @default "" */
  imageAlt?: string;
  /** Metadata pills — array of short strings (genre, year, runtime). */
  metadata?: string[];
  /** Action buttons. */
  actions?: HorizontalAction[];
  /** Visual variant. @default "default" */
  variant?: HorizontalVariant;
  /** Watch status for the colored status badge. */
  status?: WatchStatus;
  /** Rating value (0-10), shown with star icon. */
  rating?: number;
  /** Whether the card is in a loading state — renders skeleton. @default false */
  loading?: boolean;
  /** Click handler for the entire card. */
  onClick?: (e: MouseEvent) => void;
  /** Whether the card is in a selected state. @default false */
  selected?: boolean;
  /** Compact mode: smaller image, less text, tighter spacing. @default false */
  compact?: boolean;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumHorizontalCardProps,
  "variant" | "loading" | "selected" | "compact" | "imageAlt"
>> & { status?: WatchStatus; rating?: number } = {
  variant: "default",
  loading: false,
  selected: false,
  compact: false,
  imageAlt: "",
  status: undefined,
  rating: undefined,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumHorizontalCard — a horizontal card with image on left, content on right.
 *
 * Renders a horizontal flex layout with a poster image (2:3 ratio) on the left
 * and content on the right: title, subtitle, description (2-line clamp),
 * metadata pills, action buttons, and optional status/rating indicators.
 *
 * **Compact mode** reduces the image size and text density for denser layouts.
 *
 * **Variants:**
 * - `default` — tier-2 surface with card shadow
 * - `elevated` — tier-3 surface with raised shadow
 * - `glass` — frosted glass with backdrop blur
 *
 * **Selected** state adds an accent border (--p) around the card.
 *
 * **Loading** state renders a skeleton placeholder with shimmer.
 *
 * All transitions respect `prefers-reduced-motion` via global baseline.
 *
 * @example
 * ```tsx
 * <PremiumHorizontalCard
 *   title="Interstellar"
 *   subtitle="2014 · Christopher Nolan"
 *   description="A team of explorers travel through a wormhole..."
 *   imageUrl="/poster.jpg"
 *   metadata={["Sci-Fi", "2h 49m", "PG-13"]}
 *   status="completed"
 *   rating={9}
 *   actions={[
 *     { icon: "play_arrow", label: "Watch", onClick: handleWatch },
 *   ]}
 *   onClick={() => navigate("/movie/123")}
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-*, --glass-bg, --glass-border, --p, --status-*, --hairline-*
 * - Typography: --font-display, --font-body, --font-label, --font-size-*
 * - Spacing: --space-3 through --space-6
 * - Radius: --radius-lg, --radius-sm
 * - Shadows: --shadow-card, --shadow-raised
 * - Blur: --blur-lg
 */
const PremiumHorizontalCard: Component<PremiumHorizontalCardProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "title", "subtitle", "description", "imageUrl", "imageAlt",
    "metadata", "actions", "variant", "status", "rating",
    "loading", "onClick", "selected", "compact",
    "class", "style",
  ]);

  /** Card classes. */
  const cardClasses = (): string => {
    const classes: string[] = [
      "relative",
      "overflow-hidden",
      "rounded-lg",
      "flex",
      variantClasses[local.variant],
    ];

    // Spacing depends on compact mode
    if (local.compact) {
      classes.push("gap-2", "p-2");
    } else {
      classes.push("gap-4", "p-4");
    }

    // Interactive
    if (local.onClick) {
      classes.push(
        "cursor-pointer",
        "focus-ring",
        "transition-[transform,box-shadow,border-color]",
        "duration-base",
        "ease-standard",
        "hover:shadow-raised",
        "hover:scale-[1.005]",
        "active:scale-[0.995]",
        "active:duration-fast",
      );
    }

    // Selected
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

  /** Image container classes. */
  const imageContainerClasses = (): string => {
    const classes: string[] = [
      "relative",
      "flex-shrink-0",
      "overflow-hidden",
      "rounded-sm",
      "aspect-[2/3]",
    ];

    if (local.compact) {
      classes.push("w-16");
    } else {
      classes.push("w-24");
    }

    return classes.join(" ");
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
          <div class="flex gap-4 p-4">
            <div class="w-24 aspect-[2/3] bg-tier-1 rounded-sm flex-shrink-0 overflow-hidden">
              <div
                class="h-full w-full"
                style={{
                  background: "linear-gradient(90deg, transparent, var(--tier-3), transparent)",
                  "background-size": "200% 100%",
                  animation: "shimmer 1.8s ease-in-out infinite",
                }}
                aria-hidden="true"
              />
            </div>
            <div class="flex flex-col gap-2 flex-1">
              <div class="h-5 w-3/4 rounded-sm bg-tier-1" aria-hidden="true" />
              <div class="h-3 w-1/2 rounded-sm bg-tier-1" aria-hidden="true" />
              <div class="h-3 w-full rounded-sm bg-tier-1" aria-hidden="true" />
              <div class="h-3 w-2/3 rounded-sm bg-tier-1" aria-hidden="true" />
            </div>
          </div>
        }
      >
        {/* Image */}
        <div class={imageContainerClasses()}>
          <Show when={local.imageUrl} fallback={<div class="absolute inset-0 bg-tier-1" />}>
            <img
              src={local.imageUrl}
              alt={local.imageAlt || ""}
              class="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          </Show>

          {/* Status badge on image */}
          <Show when={local.status}>
            <div class="absolute top-1 left-1 z-badge">
              <span
                class={[
                  "inline-flex items-center",
                  "px-1 py-0.5",
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
        </div>

        {/* Content */}
        <div class="flex flex-col justify-center flex-1 min-w-0 gap-1">
          {/* Title */}
          <h4 class={[
            "font-display text-strong line-clamp-1",
            local.compact ? "text-sm" : "text-md",
          ].join(" ")}>
            {local.title}
          </h4>

          {/* Subtitle */}
          <Show when={local.subtitle}>
            <p class={[
              "font-body text-soft line-clamp-1",
              local.compact ? "text-2xs" : "text-xs",
            ].join(" ")}>
              {local.subtitle}
            </p>
          </Show>

          {/* Description */}
          <Show when={local.description && !local.compact}>
            <p class="text-xs font-body text-muted line-clamp-2">
              {local.description}
            </p>
          </Show>

          {/* Metadata pills */}
          <Show when={local.metadata && local.metadata!.length > 0}>
            <div class="flex items-center gap-1 flex-wrap mt-1">
              <For each={local.metadata}>
                {(item, index) => (
                  <>
                    <Show when={index() > 0}>
                      <span class="text-2xs text-dim" aria-hidden="true">·</span>
                    </Show>
                    <span class="text-2xs font-label text-muted">
                      {item}
                    </span>
                  </>
                )}
              </For>
            </div>
          </Show>

          {/* Bottom row: rating + actions */}
          <div class="flex items-center gap-2 mt-1">
            {/* Rating */}
            <Show when={local.rating !== undefined && local.rating !== null}>
              <div class="flex items-center gap-0.5">
                <span class="material-symbols-outlined text-xs text-rating-tmdb" aria-hidden="true">
                  star
                </span>
                <span class="text-2xs font-label text-soft">
                  {local.rating!.toFixed(1)}
                </span>
              </div>
            </Show>

            {/* Actions */}
            <Show when={local.actions && local.actions!.length > 0}>
              <div class="flex items-center gap-1 ml-auto">
                <For each={local.actions}>
                  {(action) => (
                    <button
                      type="button"
                      class={[
                        "inline-flex items-center justify-center",
                        "p-1.5",
                        "rounded-sm",
                        "text-soft",
                        "transition-[background-color,color,transform]",
                        "duration-fast ease-standard",
                        "focus-ring",
                        "hover:bg-tier-3 hover:text-strong",
                        "active:scale-[0.95]",
                      ].join(" ")}
                      onClick={(e) => {
                        e.stopPropagation();
                        action.onClick(e);
                      }}
                      aria-label={action.label}
                    >
                      <span class="material-symbols-outlined text-sm" aria-hidden="true">
                        {action.icon}
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

export { PremiumHorizontalCard };
export type { HorizontalAction, HorizontalVariant, WatchStatus as HorizontalWatchStatus };
export default PremiumHorizontalCard;
