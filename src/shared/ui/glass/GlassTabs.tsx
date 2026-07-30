// src/shared/ui/glass/GlassTabs.tsx
import { For, Show, splitProps, mergeProps, type JSX } from "solid-js";

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

export interface GlassTabsProps<T extends string = string> extends Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "onChange"
> {
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

const sizeClasses: Record<
  TabSize,
  { pad: string; text: string; icon: string; gap: string }
> = {
  compact: {
    pad: "px-2.5 py-1",
    text: "text-xs",
    icon: "text-[14px]",
    gap: "gap-1"
  },
  default: {
    pad: "px-3.5 py-1.5",
    text: "text-sm",
    icon: "text-[16px]",
    gap: "gap-1.5"
  },
  large: {
    pad: "px-5 py-2",
    text: "text-md",
    icon: "text-[18px]",
    gap: "gap-2"
  }
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
 *  - Roving tabindex: only the active tab is in the tab order.
 *    Arrow Left/Right move focus between tabs and activate them
 *    (WAI-ARIA Tabs pattern). Home/End jump to the first/last tab.
 */
function GlassTabs<T extends string = string>(rawProps: GlassTabsProps<T>) {
  const props = mergeProps(
    {
      variant: "pill" as TabVariant,
      size: "default" as TabSize,
      fullWidth: false
    },
    rawProps
  );
  const [local, rest] = splitProps(props, [
    "items",
    "value",
    "onChange",
    "variant",
    "size",
    "fullWidth",
    "aria-label",
    "class"
  ]);

  const sizeTokens = () => sizeClasses[local.size];

  const containerClass = () => {
    const base = ["glass-tabs", `glass-tabs-${local.variant}`];
    if (local.fullWidth) base.push("glass-tabs-full-width");
    if (local.class) base.push(local.class);
    return base.join(" ");
  };

  /**
   * Arrow-key navigation for the roving-tabindex tabs pattern.
   *
   * WAI-ARIA Tabs spec:
   *   - Left/Right Arrow  → move focus to the previous/next non-disabled
   *                          tab and ACTIVATE it (auto-activation model).
   *   - Home/End          → jump to the first/last non-disabled tab.
   *
   * We use the auto-activation model (focus + activate in one keystroke)
   * because it matches the existing onClick behavior — every other UI
   * in the app activates on click, so users expect arrow keys to do
   * the same. Tabs that aren't in the tab order (tabindex=-1) become
   * focusable programmatically via .focus() when arrowed to.
   */
  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const container = e.currentTarget as HTMLElement;
    // Only handle key presses that originate on a tab button — ignore
    // arrow keys pressed while focus is elsewhere inside the tablist.
    if (!target || target.getAttribute("role") !== "tab") return;

    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
    ).filter((b) => !b.disabled);
    if (tabs.length === 0) return;
    const currentIndex = tabs.indexOf(target as HTMLButtonElement);

    let nextIndex: number | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    if (nextIndex === null) return;
    e.preventDefault();
    const nextTab = tabs[nextIndex];
    nextTab.focus();
    // Auto-activate: find the item matching the focused tab's value
    // and call onChange. The tab's value is stored on data-value (set
    // below) so we can look it up without re-running the items array.
    const nextValue = nextTab.dataset.value as T | undefined;
    if (nextValue !== undefined) local.onChange(nextValue);
  };

  return (
    <div
      {...rest}
      class={containerClass()}
      role="tablist"
      aria-label={local["aria-label"] || "Tabs"}
      onKeyDown={onKeyDown}
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
              // Roving tabindex per WAI-ARIA Tabs pattern:
              //   - The ACTIVE tab is in the tab order (tabindex=0).
              //   - Inactive tabs are removed from the tab order (tabindex=-1)
              //     so a single Tab keypress lands on the active tab instead
              //     of cycling through every tab. Arrow keys then move focus
              //     between tabs (see onKeyDown above).
              tabindex={isActive() ? 0 : -1}
              aria-disabled={isDisabled()}
              disabled={isDisabled()}
              // data-value is read by the arrow-key handler to fire
              // onChange when the user arrows to a new tab.
              data-value={item.value}
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
