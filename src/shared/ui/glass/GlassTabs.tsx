// src/shared/ui/glass/GlassTabs.tsx
import { For, Show, Component, splitProps, mergeProps, type JSX } from "solid-js";

// ─── Variant Types ─────────────────────────────────────────────

/** Tab visual variant. */
type TabVariant = "pill" | "underline" | "segmented";

/** Tab size. */
type TabSize = "compact" | "default" | "large";

// ─── Generic Tab Item Type ─────────────────────────────────────

export interface GlassTabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: string;
  count?: number;
  disabled?: boolean;
}

// ─── Props ─────────────────────────────────────────────────────

export interface GlassTabsProps<T extends string = string> extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Tab items to render. */
  items: GlassTabItem<T>[];
  /** Currently active tab value. */
  value: T;
  /** Called when the user selects a tab. */
  onChange: (value: T) => void;
  /** Visual variant. @default "pill" */
  variant?: TabVariant;
  /** Size preset. @default "default" */
  size?: TabSize;
  /** Stretch tabs to fill the container width evenly. @default false */
  fullWidth?: boolean;
  /** ARIA label for the tablist. */
  "aria-label"?: string;
}

// ─── Token Maps ────────────────────────────────────────────────

const sizeClasses: Record<TabSize, { pad: string; text: string; icon: string; gap: string }> = {
  compact: { pad: "px-2.5 py-1", text: "text-xs", icon: "text-[14px]", gap: "gap-1" },
  default: { pad: "px-3.5 py-1.5", text: "text-sm", icon: "text-[16px]", gap: "gap-1.5" },
  large:   { pad: "px-5 py-2",     text: "text-md", icon: "text-[18px]", gap: "gap-2" },
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassTabs — a unified tab bar with three visual variants.
 *
 * Variants:
 *  - "pill": frosted glass pill buttons (default). Active = bg-primary text-on-primary shadow-glow.
 *  - "underline": bottom-border underline tabs. Active = gold underline + bright text.
 *  - "segmented": iOS-style segmented control inside a glass container.
 *
 * All variants:
 *  - Horizontally scrollable on overflow (no wrap)
 *  - Active tab has smooth transition
 *  - Icon + label + optional count badge
 *  - WCAG-compliant role="tablist" + aria-selected
 */
function GlassTabs<T extends string = string>(rawProps: GlassTabsProps<T>) {
  const props = mergeProps(
    {
      variant: "pill" as TabVariant,
      size: "default" as TabSize,
      fullWidth: false,
    },
    rawProps,
  );
  const [local, rest] = splitProps(props, [
    "items", "value", "onChange", "variant", "size", "fullWidth",
    "aria-label", "class",
  ]);

  const sizeTokens = () => sizeClasses[local.size];

  const containerClass = () => {
    const base = ["glass-tabs", `glass-tabs-${local.variant}`];
    if (local.fullWidth) base.push("glass-tabs-full-width");
    if (local.class) base.push(local.class);
    return base.join(" ");
  };

  return (
    <div
      {...rest}
      class={containerClass()}
      role="tablist"
      aria-label={local["aria-label"] || "Tabs"}
    >
      <For each={local.items}>
        {(item) => {
          const isActive = () => local.value === item.value;
          const isDisabled = () => !!item.disabled;

          return (
            <button
              type="button"
              role="tab"
              aria-selected={isActive()}
              aria-disabled={isDisabled()}
              disabled={isDisabled()}
              class={`glass-tab glass-tab-${local.variant} ${sizeTokens().pad} ${sizeTokens().text} ${sizeTokens().gap} ${isActive() ? "glass-tab-active" : ""} ${isDisabled() ? "glass-tab-disabled" : ""} ${local.fullWidth ? "glass-tab-flex-1" : ""}`}
              onClick={() => !isDisabled() && local.onChange(item.value)}
            >
              <Show when={item.icon}>
                <span
                  class={`material-symbols-outlined ${sizeTokens().icon}`}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
              </Show>
              <span class="glass-tab-label">{item.label}</span>
              <Show when={item.count !== undefined && item.count! > 0}>
                <span class="glass-tab-count">{item.count}</span>
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );
}

export { GlassTabs };
export default GlassTabs;
