// src/shared/ui/premium/buttons/PremiumActionRow.tsx
import { Component, For, JSX, splitProps, mergeProps } from "solid-js";
import { PremiumButton } from "./PremiumButton";
import { PremiumIconButton } from "./PremiumIconButton";

// ─── Types ─────────────────────────────────────────────────────

/** Button visual variant (shared between PremiumButton and PremiumIconButton) */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

/** Icon button visual variant */
type IconButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** A single action item rendered as a button */
interface ActionItem {
  /** Material Symbol icon name */
  icon?: string;
  /** Button label text */
  label?: string;
  /** Visual variant */
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  /** Click handler */
  onClick: (e: MouseEvent) => void;
  /** Show loading spinner */
  loading?: boolean;
  /** Disable this action */
  disabled?: boolean;
  /** Icon-only mode (uses PremiumIconButton instead of PremiumButton) */
  iconOnly?: boolean;
  /** Fill the icon (FILL=1) */
  iconFill?: boolean;
  /** Selected/toggle state */
  selected?: boolean;
  /** Badge count (icon-only mode) */
  badge?: number;
}

/** Spacing between actions */
type ActionSpacing = "compact" | "default" | "wide";

/** Horizontal alignment */
type ActionAlignment = "start" | "center" | "end";

// ─── Props ─────────────────────────────────────────────────────

interface PremiumActionRowProps {
  /** Array of action definitions */
  actions: ActionItem[];
  /** Gap between actions: compact (8px), default (12px), wide (16px) */
  spacing?: ActionSpacing;
  /** Horizontal alignment */
  alignment?: ActionAlignment;
  /** Stack vertically instead of horizontally */
  vertical?: boolean;
  /** Additional CSS class */
  class?: string;
  /** Additional inline style */
  style?: JSX.CSSProperties;
}

// ─── Spacing Maps ──────────────────────────────────────────────

const gapClasses: Record<ActionSpacing, string> = {
  compact: "gap-2",   // 8px
  default:  "gap-3",   // 12px
  wide:     "gap-4",   // 16px
};

const alignmentClasses: Record<ActionAlignment, string> = {
  start:  "justify-start",
  center: "justify-center",
  end:    "justify-end",
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumActionRow — horizontal (or vertical) row of action buttons.
 * Renders PremiumButton for labeled actions, PremiumIconButton for icon-only.
 *
 * @example
 * ```tsx
 * <PremiumActionRow
 *   actions={[
 *     { icon: "favorite", label: "Like", variant: "ghost", onClick: handleLike },
 *     { icon: "share", iconOnly: true, variant: "ghost", label: "Share", onClick: handleShare },
 *     { icon: "delete", label: "Remove", variant: "danger", onClick: handleRemove },
 *   ]}
 *   spacing="default"
 *   alignment="center"
 * />
 * ```
 *
 * Design tokens used:
 * - Spacing: --space-2, --space-3, --space-4 (gap utilities)
 * - Flex: justify-start / center / end
 * - All child button tokens are passed through
 */
const PremiumActionRow: Component<PremiumActionRowProps> = (rawProps) => {
  const props = mergeProps(
    {
      spacing: "default" as ActionSpacing,
      alignment: "center" as ActionAlignment,
      vertical: false,
    },
    rawProps,
  );

  const [local] = splitProps(props, [
    "actions", "spacing", "alignment", "vertical", "class", "style",
  ]);

  const containerClass = (): string => {
    const base = [
      "flex",
      gapClasses[local.spacing],
      alignmentClasses[local.alignment],
      "flex-wrap",
    ];

    if (local.vertical) {
      base.push("flex-col items-stretch");
    } else {
      base.push("flex-row");
    }

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  return (
    <div
      class={containerClass()}
      style={local.style}
      role="group"
      aria-label="Actions"
    >
      <For each={local.actions}>
        {(action, _index) => {
          // Icon-only mode: PremiumIconButton
          if (action.iconOnly && action.icon) {
            return (
              <PremiumIconButton
                variant={(action.variant as IconButtonVariant) ?? "ghost"}
                icon={action.icon}
                iconFill={action.iconFill}
                label={action.label ?? action.icon}
                loading={action.loading}
                disabled={action.disabled}
                selected={action.selected}
                badge={action.badge}
                onClick={action.onClick}
              />
            );
          }

          // Default: PremiumButton with optional icon
          return (
            <PremiumButton
              variant={(action.variant as ButtonVariant) ?? "ghost"}
              icon={action.icon}
              iconFill={action.iconFill}
              loading={action.loading}
              disabled={action.disabled}
              selected={action.selected}
              onClick={action.onClick}
            >
              {action.label}
            </PremiumButton>
          );
        }}
      </For>
    </div>
  );
};

export { PremiumActionRow };
export type { ActionItem, ActionSpacing, ActionAlignment };
export default PremiumActionRow;
