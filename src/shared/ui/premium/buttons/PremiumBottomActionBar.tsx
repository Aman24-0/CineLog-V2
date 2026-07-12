// src/shared/ui/premium/buttons/PremiumBottomActionBar.tsx
import { Component, For, JSX, Show, splitProps, mergeProps } from "solid-js";
import { PremiumButton } from "./PremiumButton";

// ─── Types ─────────────────────────────────────────────────────

/** A single action in the bottom bar */
interface BottomActionItem {
  /** Material Symbol icon name */
  icon?: string;
  /** Button label */
  label: string;
  /** Visual variant */
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  /** Click handler */
  onClick: (e: MouseEvent) => void;
  /** Show loading spinner */
  loading?: boolean;
  /** Disable this action */
  disabled?: boolean;
}

// ─── Props ─────────────────────────────────────────────────────

interface PremiumBottomActionBarProps {
  /** Array of action definitions */
  actions: BottomActionItem[];
  /** Whether the bar is visible */
  visible?: boolean;
  /** Glass background with backdrop blur (default: true) */
  glass?: boolean;
  /** Additional CSS class */
  class?: string;
  /** Additional inline style */
  style?: JSX.CSSProperties;
}

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumBottomActionBar — sticky bottom action bar positioned
 * above the navigation bar, with optional glass background.
 *
 * @example
 * ```tsx
 * <PremiumBottomActionBar
 *   actions={[
 *     { icon: "bookmark_add", label: "Save", variant: "secondary", onClick: handleSave },
 *     { icon: "share", label: "Share", variant: "primary", onClick: handleShare },
 *   ]}
 *   visible={hasSelection()}
 *   glass
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --glass-bg-strong, --glass-border, --hairline,
 *   --tier-2
 * - Spacing: --space-4, --space-3
 * - Radius: --radius-xl (via rounded-xl)
 * - Z-index: --z-sticky
 * - Motion: --dur-modal, --ease-smooth, animate-slide-up
 * - Blur: --blur-xl (backdrop-blur-xl)
 * - Navigation: --nav-total-height
 */
const PremiumBottomActionBar: Component<PremiumBottomActionBarProps> = (rawProps) => {
  const props = mergeProps(
    {
      visible: true,
      glass: true,
    },
    rawProps,
  );

  const [local] = splitProps(props, [
    "actions", "visible", "glass", "class", "style",
  ]);

  const containerClass = (): string => {
    const base = [
      "fixed left-0 right-0",
      "flex items-center justify-center gap-3",
      "px-4 py-3",
      "z-sticky",
      "transition-all duration-modal ease-smooth",
      "animate-slide-up",
    ];

    // Position above the bottom nav
    base.push("bottom-[var(--nav-total-height)]");

    if (local.glass) {
      base.push("bg-glass-strong border-t border-glass-border backdrop-blur-xl");
    } else {
      base.push("bg-tier-2 border-t border-hairline");
    }

    // Visibility
    if (!local.visible) {
      base.push("translate-y-full opacity-hidden pointer-events-none");
    }

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  return (
    <div
      class={containerClass()}
      style={{
        // Safe area padding for bottom
        "padding-bottom": "calc(var(--space-3) + env(safe-area-inset-bottom, 0px))",
        ...local.style,
      }}
      role="toolbar"
      aria-label="Bottom actions"
      aria-hidden={!local.visible || undefined}
    >
      <Show when={local.visible}>
        <For each={local.actions}>
          {(action) => (
            <PremiumButton
              variant={action.variant ?? "secondary"}
              icon={action.icon}
              loading={action.loading}
              disabled={action.disabled}
              onClick={action.onClick}
              fullWidth={local.actions.length <= 2}
            >
              {action.label}
            </PremiumButton>
          )}
        </For>
      </Show>
    </div>
  );
};

export { PremiumBottomActionBar };
export type { BottomActionItem };
export default PremiumBottomActionBar;
