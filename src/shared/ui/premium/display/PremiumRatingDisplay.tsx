// src/shared/ui/premium/display/PremiumRatingDisplay.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Source & Size Types ──────────────────────────────────────

/** Rating source — determines the accent color and icon. */
type RatingSource = "imdb" | "tmdb" | "rt" | "user";

/** Size preset. */
type RatingSize = "compact" | "default" | "large";

// ─── Token Maps ───────────────────────────────────────────────

const sourceColorMap: Record<RatingSource, string> = {
  imdb: "text-rating-imdb",
  tmdb: "text-rating-tmdb",
  rt: "text-rating-rt",
  user: "text-primary",
};

const _sourceBgMap: Record<RatingSource, string> = {
  imdb: "bg-rating-imdb",
  tmdb: "bg-rating-tmdb",
  rt: "bg-rating-rt",
  user: "bg-primary",
};

const sourceIconMap: Record<RatingSource, string> = {
  imdb: "movie",
  tmdb: "local_movies",
  rt: "fresh",
  user: "star",
};

const sourceLabelMap: Record<RatingSource, string> = {
  imdb: "IMDb",
  tmdb: "TMDb",
  rt: "RT",
  user: "Your",
};

const sizeValueMap: Record<RatingSize, string> = {
  compact: "text-sm",
  default: "text-lg",
  large: "text-3xl",
};

const sizeLabelMap: Record<RatingSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
  large: "text-sm",
};

const sizeIconMap: Record<RatingSize, string> = {
  compact: "text-sm",
  default: "text-md",
  large: "text-xl",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumRatingDisplayProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Numeric rating value. */
  value: number;
  /** Rating source — determines color and icon. @default "user" */
  source?: RatingSource;
  /** Size preset. @default "default" */
  size?: RatingSize;
  /** Whether to show the source label text. @default true */
  showLabel?: boolean;
  /** Maximum possible value (for percentage display). @default 10 */
  maxValue?: number;
  /** Show loading skeleton. @default false */
  loading?: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumRatingDisplayProps,
  "source" | "size" | "showLabel" | "maxValue" | "loading"
>> = {
  source: "user",
  size: "default",
  showLabel: true,
  maxValue: 10,
  loading: false,
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumRatingDisplay — rating display for movie/show ratings from
 * various sources (IMDb, TMDb, Rotten Tomatoes, user).
 *
 * Each source has a distinct color:
 * - IMDb: #f5c518 (--color-rating-imdb)
 * - TMDb: #01d277 (--color-rating-tmdb)
 * - RT: #ff7878 (--color-rating-rotten-tomatoes)
 * - User: accent color (--color-primary)
 *
 * @example
 * ```tsx
 * <PremiumRatingDisplay value={8.5} source="imdb" />
 * <PremiumRatingDisplay value={94} source="rt" maxValue={100} size="large" showLabel />
 * <PremiumRatingDisplay value={7.2} source="user" icon="star" />
 * ```
 *
 * Design tokens used:
 * - Colors: --color-rating-imdb, --color-rating-tmdb, --color-rating-rt,
 *   --color-primary, --color-text-muted
 * - Typography: --font-family-display, --font-family-label
 * - Spacing: --space-1 through --space-2
 * - Motion: --dur-fast, --ease-standard
 */
const PremiumRatingDisplay: Component<PremiumRatingDisplayProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "value", "source", "size", "showLabel", "maxValue", "loading",
    "class", "style",
  ]);

  /** Format display value: show percentage for RT, otherwise standard. */
  const displayValue = (): string => {
    if (local.source === "rt" && local.maxValue === 100) {
      return `${Math.round(local.value)}%`;
    }
    return String(local.value % 1 === 0 ? local.value : local.value.toFixed(1));
  };

  /** Whether the user source should render a filled star. */
  const isFilled = (): boolean => local.source === "user";

  const containerClass = (): string => {
    const classes = [
      "inline-flex items-center gap-1",
    ];
    if (local.size === "large") classes.push("flex-col items-center");
    if (local.class) classes.push(local.class);
    return classes.filter(Boolean).join(" ");
  };

  return (
    <div
      {...rest}
      class={containerClass()}
      style={local.style}
      role="group"
      aria-label={`${sourceLabelMap[local.source]} rating: ${local.value} out of ${local.maxValue}`}
    >
      {/* Loading skeleton */}
      <Show when={local.loading}>
        <div
          class="inline-flex items-center gap-1"
          aria-hidden="true"
        >
          <span
            class={`${sizeIconMap[local.size]} rounded-sm bg-tier-2`}
            style={{
              width: "var(--space-4)",
              height: "var(--space-4)",
              background: "linear-gradient(90deg, var(--tier-2), var(--tier-3), var(--tier-2))",
              "background-size": "200% 100%",
              animation: "shimmer 1.8s ease-in-out infinite",
            }}
          />
          <span
            class={`${sizeValueMap[local.size]} rounded-sm bg-tier-2`}
            style={{
              width: "var(--space-8)",
              height: "var(--space-4)",
              background: "linear-gradient(90deg, var(--tier-2), var(--tier-3), var(--tier-2))",
              "background-size": "200% 100%",
              animation: "shimmer 1.8s ease-in-out infinite",
            }}
          />
        </div>
      </Show>

      {/* Actual rating display */}
      <Show when={!local.loading}>
        {/* Icon */}
        <span
          class={`material-symbols-outlined ${sourceColorMap[local.source]} ${sizeIconMap[local.size]}`}
          style={{
            "font-variation-settings": isFilled()
              ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
              : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
          }}
          aria-hidden="true"
        >
          {sourceIconMap[local.source]}
        </span>

        {/* Value */}
        <span
          class={`font-display font-bold ${sizeValueMap[local.size]} ${sourceColorMap[local.source]} transition-colors duration-fast ease-standard`}
        >
          {displayValue()}
        </span>

        {/* Label */}
        <Show when={local.showLabel}>
          <span class={`font-label ${sizeLabelMap[local.size]} text-muted uppercase tracking-extra-wide`}>
            {sourceLabelMap[local.source]}
          </span>
        </Show>
      </Show>
    </div>
  );
};

export { PremiumRatingDisplay };
export default PremiumRatingDisplay;
