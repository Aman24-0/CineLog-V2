// src/shared/ui/premium/display/PremiumTimelineRow.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Types ────────────────────────────────────────────────────

/** Timeline entry accent color. */
type TimelineColor = "default" | "accent" | "success" | "warning" | "danger";

/** Content placement side. */
type TimelineSide = "left" | "right";

// ─── Token Maps ───────────────────────────────────────────────

const colorMap: Record<TimelineColor, string> = {
  default: "text-muted",
  accent: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const colorBgMap: Record<TimelineColor, string> = {
  default: "bg-tier-2",
  accent: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const colorBorderMap: Record<TimelineColor, string> = {
  default: "border-hairline",
  accent: "border-primary",
  success: "border-success",
  warning: "border-warning",
  danger: "border-danger",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumTimelineRowProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Entry title. */
  title: string;
  /** Optional subtitle. */
  subtitle?: string;
  /** Date string for the timeline point. */
  date?: string;
  /** Material Symbol icon name on the timeline axis. */
  icon?: string;
  /** Render icon with FILL=1 (filled style). @default false */
  iconFill?: boolean;
  /** Accent color variant. @default "default" */
  color?: TimelineColor;
  /** Content placement side. @default "right" */
  side?: TimelineSide;
  /** Show vertical connector line to the next entry. @default true */
  connector?: boolean;
  /** Animate entrance with slide-in. @default false */
  animated?: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumTimelineRowProps,
  "iconFill" | "color" | "side" | "connector" | "animated"
>> = {
  iconFill: false,
  color: "default",
  side: "right",
  connector: true,
  animated: false,
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumTimelineRow — vertical timeline entry with icon node on
 * the axis, content on a specified side, and optional connector line.
 *
 * The timeline is structured as:
 * - A vertical axis line on the side opposite the content
 * - A circular icon node sitting on the axis
 * - Content card on the specified side
 * - A connector line running vertically through the axis
 *
 * @example
 * ```tsx
 * <PremiumTimelineRow
 *   title="Watched Inception"
 *   subtitle="Rated 9/10"
 *   date="Mar 15, 2024"
 *   icon="movie"
 *   color="accent"
 *   side="right"
 *   connector
 * />
 * <PremiumTimelineRow
 *   title="Added to Watchlist"
 *   date="Mar 10, 2024"
 *   icon="bookmark_add"
 *   color="success"
 *   side="left"
 *   animated
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --color-text-muted, --color-primary, --color-success,
 *   --color-warning, --color-danger, --tier-2, --hairline
 * - Typography: --font-family-body, --font-family-label
 * - Spacing: --space-3 through --space-4
 * - Radius: --radius-full (icon node), --radius-md (content)
 * - Motion: --dur-base, --ease-standard, --dur-slow, --ease-spring
 */
const PremiumTimelineRow: Component<PremiumTimelineRowProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "title", "subtitle", "date", "icon", "iconFill", "color", "side",
    "connector", "animated", "class", "style",
  ]);

  const iconFontVariation = (): string =>
    local.iconFill
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";

  const iconNodeClass = (): string => {
    const classes = [
      "relative z-base flex items-center justify-center",
      "w-8 h-8 rounded-full shrink-0",
      colorBgMap[local.color],
      "transition-colors duration-fast ease-standard",
    ];

    // Accent color gets a subtle glow
    if (local.color === "accent") {
      classes.push("shadow-glow");
    }

    return classes.filter(Boolean).join(" ");
  };

  const iconTextClass = (): string => {
    // For accent/success/warning/danger, use on-primary (white) icon
    if (local.color !== "default") {
      return "text-on-primary text-sm";
    }
    return "text-strong text-sm";
  };

  const _connectorClass = (): string => {
    const classes = [
      "absolute w-0.5 bg-tier-2",
    ];

    // Position connector: if content is on the right, axis is on the left
    // Connector runs through the icon node center downward
    if (local.side === "right") {
      classes.push("left-1/2 -translate-x-1/2 top-8 bottom-0");
    } else {
      classes.push("left-1/2 -translate-x-1/2 top-8 bottom-0");
    }

    return classes.filter(Boolean).join(" ");
  };

  const rowClass = (): string => {
    const classes = [
      "relative flex items-start gap-3",
    ];

    if (local.side === "right") {
      classes.push("flex-row");
    } else {
      classes.push("flex-row-reverse");
    }

    if (local.animated) {
      classes.push("animate-timeline-in");
    }

    if (local.class) classes.push(local.class);

    return classes.filter(Boolean).join(" ");
  };

  const contentClass = (): string => {
    const classes = [
      "flex-1 min-w-0",
      "bg-tier-2 rounded-md p-3",
      "border",
      colorBorderMap[local.color],
      "transition-colors duration-fast ease-standard",
    ];
    return classes.filter(Boolean).join(" ");
  };

  return (
    <div
      {...(rest as Record<string, unknown>)}
      class={rowClass()}
      style={{
        ...(typeof local.style === "object" ? local.style : {}),
        ...(local.animated ? { "animation-duration": "var(--dur-base)", "animation-timing-function": "var(--ease-spring)" } : {}),
      }}
      role="listitem"
      aria-label={`${local.title}${local.date ? `, ${local.date}` : ""}`}
    >
      {/* Icon node on timeline axis */}
      <div class="relative flex flex-col items-center">
        <div class={iconNodeClass()} aria-hidden="true">
          <Show when={local.icon} fallback={
            <span class={`inline-block w-2 h-2 rounded-full ${local.color === "default" ? "bg-muted" : "bg-current"}`} />
          }>
            <span
              class={`material-symbols-outlined ${iconTextClass()}`}
              style={{ "font-variation-settings": iconFontVariation() }}
            >
              {local.icon}
            </span>
          </Show>
        </div>

        {/* Connector line */}
        <Show when={local.connector}>
          <div class="w-0.5 flex-1 bg-tier-2 min-h-4" aria-hidden="true" />
        </Show>
      </div>

      {/* Content card */}
      <div class={contentClass()}>
        <div class="flex items-center justify-between gap-2">
          <p class={`font-body font-medium text-strong text-sm truncate ${colorMap[local.color]}`}>
            {local.title}
          </p>
          <Show when={local.date}>
            <span class="font-label text-2xs text-muted uppercase tracking-extra-wide shrink-0">
              {local.date}
            </span>
          </Show>
        </div>

        <Show when={local.subtitle}>
          <p class="font-body text-xs text-soft mt-1">
            {local.subtitle}
          </p>
        </Show>
      </div>
    </div>
  );
};

export { PremiumTimelineRow };
export default PremiumTimelineRow;
