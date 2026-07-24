// src/shared/ui/glass/GlassBadge.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Status & Size Types ──────────────────────────────────────

/** Watch status — maps to status color tokens. */
type WatchStatus = "watching" | "completed" | "planned" | "paused" | "dropped";

/** Generic intent color mapping */
type BadgeIntent = "default" | "primary" | "success" | "warning" | "danger" | "info";

/** Size preset. */
type BadgeSize = "compact" | "default" | "large";

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
  planned: "bookmark",
  paused: "pause_circle",
  dropped: "cancel",
};

const intentColorMap: Record<BadgeIntent, string> = {
  default: "text-text-strong bg-tier-3 border border-hairline-2",
  primary: "text-primary bg-primary-dim border border-[color-mix(in_srgb,var(--p)_30%,transparent)]",
  success: "text-success bg-success-bg",
  warning: "text-warning bg-warning-bg",
  danger: "text-danger bg-danger-bg",
  info: "text-info bg-info-bg",
};

const sizeClasses: Record<BadgeSize, { container: string; text: string; icon: string }> = {
  compact: { container: "px-1.5 py-0.5 gap-1", text: "text-[10px]", icon: "text-[12px]" },
  default: { container: "px-2 py-1 gap-1", text: "text-xs", icon: "text-sm" },
  large:   { container: "px-2.5 py-1.5 gap-1.5", text: "text-sm", icon: "text-base" },
};

// ─── Props ─────────────────────────────────────────────────────

export interface GlassBadgeProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Map to a predefined watch status to automatically configure colors, text, and icon. */
  status?: WatchStatus;
  /** Generic intent color mapping, used if status is not provided. */
  intent?: BadgeIntent;
  /** Custom text content (overrides status default). */
  label?: string;
  /** Custom icon (overrides status default). */
  icon?: string;
  /** Size preset. @default "default" */
  size?: BadgeSize;
  /** Apply glass blur effect to the background. @default false */
  glass?: boolean;
}

const defaultProps: Required<Pick<GlassBadgeProps, "size" | "glass" | "intent">> = {
  size: "default",
  glass: false,
  intent: "default",
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassBadge — a unified badge component for status indicators and small labels.
 * Replaces PremiumStatusBadge and integrates glass styling options.
 */
const GlassBadge: Component<GlassBadgeProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "status", "intent", "label", "icon", "size", "glass", "class"
  ]);

  const resolvedLabel = () => local.label ?? (local.status ? statusTextMap[local.status] : "");
  const resolvedIcon = () => local.icon ?? (local.status ? statusIconMap[local.status] : null);

  const badgeClasses = () => {
    const base = [
      "inline-flex items-center justify-center font-label font-bold uppercase tracking-wide rounded-sm select-none",
      sizeClasses[local.size].container,
      sizeClasses[local.size].text,
    ];

    if (local.status) {
      base.push(statusColorMap[local.status]);
      if (local.glass) {
        base.push("bg-glass backdrop-blur-md border border-glass-border");
      } else {
        base.push(statusBgMap[local.status]);
      }
    } else {
      if (local.glass && local.intent === "default") {
        base.push("bg-glass backdrop-blur-md border border-glass-border text-text-strong");
      } else {
        base.push(intentColorMap[local.intent]);
      }
    }

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  return (
    <div {...rest} class={badgeClasses()} aria-label={resolvedLabel()}>
      <Show when={resolvedIcon()}>
        <span
          class={`material-symbols-outlined ${sizeClasses[local.size].icon}`}
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
          aria-hidden="true"
        >
          {resolvedIcon()}
        </span>
      </Show>
      <Show when={resolvedLabel()}>
        <span>{resolvedLabel()}</span>
      </Show>
    </div>
  );
};

export { GlassBadge };
export default GlassBadge;
