// src/shared/ui/premium/display/PremiumStatusBadge.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Status & Size Types ──────────────────────────────────────

/** Watch status — maps to status color tokens. */
type WatchStatus = "watching" | "completed" | "planned" | "paused" | "dropped";

/** Size preset. */
type StatusBadgeSize = "compact" | "default" | "large";

// ─── Token Maps ───────────────────────────────────────────────

const statusTextMap: Record<WatchStatus, string> = {
  watching: "Watching",
  completed: "Completed",
  planned: "Planned",
  paused: "Paused",
  dropped: "Dropped",
};

const statusColorMap: Record<WatchStatus, string> = {
  watching: "text-watching",
  completed: "text-completed",
  planned: "text-planned",
  paused: "text-paused",
  dropped: "text-dropped",
};

const statusBgMap: Record<WatchStatus, string> = {
  watching: "bg-watching-bg",
  completed: "bg-completed-bg",
  planned: "bg-planned-bg",
  paused: "bg-paused-bg",
  dropped: "bg-dropped-bg",
};

const statusIconMap: Record<WatchStatus, string> = {
  watching: "play_circle",
  completed: "check_circle",
  planned: "schedule",
  paused: "pause_circle",
  dropped: "cancel",
};

const sizeClasses: Record<StatusBadgeSize, string> = {
  compact: "px-1.5 py-0.5 text-2xs gap-0.5",
  default: "px-2 py-1 text-xs gap-1",
  large: "px-3 py-1.5 text-sm gap-1.5",
};

const dotSizeMap: Record<StatusBadgeSize, string> = {
  compact: "w-1.5 h-1.5",
  default: "w-2 h-2",
  large: "w-2.5 h-2.5",
};

const iconSizeMap: Record<StatusBadgeSize, string> = {
  compact: "text-2xs",
  default: "text-xs",
  large: "text-sm",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumStatusBadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  /** Watch status. */
  status: WatchStatus;
  /** Size preset. @default "default" */
  size?: StatusBadgeSize;
  /** Show icon alongside text. @default true */
  showIcon?: boolean;
  /** Render only the colored icon (no text, no pill). @default false */
  iconOnly?: boolean;
  /** Render only the colored dot indicator (no text, no pill). @default false */
  dotOnly?: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumStatusBadgeProps,
  "size" | "showIcon" | "iconOnly" | "dotOnly"
>> = {
  size: "default",
  showIcon: true,
  iconOnly: false,
  dotOnly: false,
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumStatusBadge — watch status badge with status-specific colors,
 * optional icon, dot-only and icon-only modes.
 *
 * Each status uses the corresponding --color-status-* and --color-status-*-bg tokens:
 * - watching: play icon + blue-ish
 * - completed: check icon + green-ish
 * - planned: schedule icon + purple-ish
 * - paused: pause icon + amber-ish
 * - dropped: cancel icon + red-ish
 *
 * @example
 * ```tsx
 * <PremiumStatusBadge status="watching" />
 * <PremiumStatusBadge status="completed" size="compact" dotOnly />
 * <PremiumStatusBadge status="planned" iconOnly />
 * <PremiumStatusBadge status="dropped" size="large" showIcon={false} />
 * ```
 *
 * Design tokens used:
 * - Colors: --color-status-*, --color-status-*-bg
 * - Typography: --font-family-label
 * - Spacing: --space-0.5 through --space-3
 * - Radius: --radius-pill (full pill shape)
 * - Motion: --dur-fast, --ease-standard
 */
const PremiumStatusBadge: Component<PremiumStatusBadgeProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "status", "size", "showIcon", "iconOnly", "dotOnly",
    "class", "style",
  ]);

  /** Dot-only mode: colored dot indicator. */
  const renderDot = () => (
    <span
      class={`inline-block rounded-full ${dotSizeMap[local.size]} ${statusBgMap[local.status]}`}
      role="status"
      aria-label={statusTextMap[local.status]}
    />
  );

  /** Icon-only mode: colored icon. */
  const renderIcon = () => (
    <span
      class={`material-symbols-outlined ${statusColorMap[local.status]} ${iconSizeMap[local.size]}`}
      style={{ "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
      role="status"
      aria-label={statusTextMap[local.status]}
    >
      {statusIconMap[local.status]}
    </span>
  );

  /** Full pill badge with icon + text. */
  const renderPill = () => (
    <span
      class={[
        "inline-flex items-center rounded-pill font-label font-semibold uppercase tracking-extra-wide",
        statusBgMap[local.status],
        statusColorMap[local.status],
        sizeClasses[local.size],
        "transition-colors duration-fast ease-standard",
        local.class,
      ].filter(Boolean).join(" ")}
      {...rest}
      style={local.style}
      role="status"
      aria-label={statusTextMap[local.status]}
    >
      <Show when={local.showIcon}>
        <span
          class={`material-symbols-outlined ${iconSizeMap[local.size]}`}
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
          aria-hidden="true"
        >
          {statusIconMap[local.status]}
        </span>
      </Show>
      {statusTextMap[local.status]}
    </span>
  );

  // Dispatch based on mode
  return (
    <Show when={local.dotOnly} fallback={
      <Show when={local.iconOnly} fallback={renderPill()}>
        {renderIcon()}
      </Show>
    }>
      {renderDot()}
    </Show>
  );
};

export { PremiumStatusBadge };
export default PremiumStatusBadge;
