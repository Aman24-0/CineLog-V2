// src/shared/ui/premium/display/PremiumMediaInfo.tsx
import { Component, JSX, Show, For, splitProps, mergeProps } from "solid-js";

// ─── Types ────────────────────────────────────────────────────

/** Media type. */
type MediaType = "movie" | "tv";

/** Size preset. */
type MediaInfoSize = "compact" | "default";

/** Separator between items. */
type MediaSeparator = "dot" | "pipe" | "slash";

// ─── Token Maps ───────────────────────────────────────────────

const separatorMap: Record<MediaSeparator, string> = {
  dot: "·",
  pipe: "|",
  slash: "/",
};

const sizeTextMap: Record<MediaInfoSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
};

const sizeIconMap: Record<MediaInfoSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
};

const sizeGapMap: Record<MediaInfoSize, string> = {
  compact: "gap-1",
  default: "gap-2",
};

const mediaTypeIconMap: Record<MediaType, string> = {
  movie: "movie",
  tv: "tv",
};

const mediaTypeLabelMap: Record<MediaType, string> = {
  movie: "Movie",
  tv: "TV Show",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumMediaInfoProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Release year. */
  year?: number | string;
  /** Media type (movie or TV). */
  mediaType?: MediaType;
  /** Runtime string (e.g. "2h 15m"). */
  runtime?: string;
  /** Genre label (e.g. "Sci-Fi"). */
  genre?: string;
  /** Platform / network label (e.g. "Netflix"). */
  platform?: string;
  /** Size preset. @default "compact" */
  size?: MediaInfoSize;
  /** Separator between metadata items. @default "dot" */
  separator?: MediaSeparator;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumMediaInfoProps,
  "size" | "separator"
>> = {
  size: "compact",
  separator: "dot",
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumMediaInfo — inline metadata display for year, media type,
 * runtime, genre, and platform with configurable separator.
 *
 * Compact mode: inline row of year · type · runtime
 * Default mode: larger with genre and platform
 *
 * @example
 * ```tsx
 * <PremiumMediaInfo year={2024} mediaType="movie" runtime="2h 15m" genre="Sci-Fi" />
 * <PremiumMediaInfo year={2023} mediaType="tv" runtime="45m" platform="HBO" size="default" separator="pipe" />
 * ```
 *
 * Design tokens used:
 * - Colors: --color-text-muted, --color-text-dim
 * - Typography: --font-family-body
 * - Spacing: --space-1 through --space-2
 */
const PremiumMediaInfo: Component<PremiumMediaInfoProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "year", "mediaType", "runtime", "genre", "platform", "size", "separator",
    "class", "style",
  ]);

  /** Build list of visible items. */
  const items = (): Array<{ text: string; icon?: string }> => {
    const result: Array<{ text: string; icon?: string }> = [];

    if (local.year) {
      result.push({ text: String(local.year), icon: "calendar_today" });
    }

    if (local.mediaType) {
      result.push({
        text: mediaTypeLabelMap[local.mediaType],
        icon: mediaTypeIconMap[local.mediaType],
      });
    }

    if (local.runtime) {
      result.push({ text: local.runtime, icon: "schedule" });
    }

    if (local.genre && local.size === "default") {
      result.push({ text: local.genre, icon: "category" });
    }

    if (local.platform && local.size === "default") {
      result.push({ text: local.platform, icon: "cast" });
    }

    return result;
  };

  const containerClass = (): string => {
    const classes = [
      "inline-flex items-center",
      sizeGapMap[local.size],
      "font-body text-muted",
      sizeTextMap[local.size],
    ];
    if (local.class) classes.push(local.class);
    return classes.filter(Boolean).join(" ");
  };

  const separatorChar = (): string => separatorMap[local.separator];

  return (
    <div
      {...rest}
      class={containerClass()}
      style={local.style}
      role="group"
      aria-label="Media information"
    >
      <For each={items()}>
        {(item, index) => (
          <>
            {/* Separator before items (except the first) */}
            <Show when={index() > 0}>
              <span class="text-dim" aria-hidden="true">
                {separatorChar()}
              </span>
            </Show>

            {/* Item with optional icon */}
            <span class="inline-flex items-center gap-0.5">
              <Show when={item.icon}>
                <span
                  class={`material-symbols-outlined ${sizeIconMap[local.size]}`}
                  style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
              </Show>
              <span>{item.text}</span>
            </span>
          </>
        )}
      </For>
    </div>
  );
};

export { PremiumMediaInfo };
export default PremiumMediaInfo;
