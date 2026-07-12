// src/shared/ui/premium/buttons/PremiumToolbar.tsx
import { Component, For, JSX, Show, splitProps, mergeProps, createSignal } from "solid-js";
import { PremiumIconButton } from "./PremiumIconButton";

// ─── Types ─────────────────────────────────────────────────────

/** A single tool in the toolbar */
interface ToolItem {
  /** Material Symbol icon name */
  icon: string;
  /** Accessible label */
  label: string;
  /** Click handler */
  onClick: (e: MouseEvent) => void;
  /** Active/pressed state — shows accent indicator */
  active?: boolean;
  /** Disable this tool */
  disabled?: boolean;
  /** Fill the icon (FILL=1) */
  iconFill?: boolean;
}

/** Toolbar position */
type ToolbarPosition = "top" | "bottom";

// ─── Props ─────────────────────────────────────────────────────

interface PremiumToolbarProps {
  /** Array of tool definitions */
  tools: ToolItem[];
  /** Glass background with backdrop blur */
  glass?: boolean;
  /** Position: top or bottom of container */
  position?: ToolbarPosition;
  /** Allow horizontal scrolling with hidden scrollbar */
  scrollable?: boolean;
  /** Additional CSS class */
  class?: string;
  /** Additional inline style */
  style?: JSX.CSSProperties;
}

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumToolbar — horizontal row of icon buttons with optional
 * glass background, active indicators, scrollable overflow, and
 * full keyboard navigation (arrow keys via roving tabindex).
 *
 * @example
 * ```tsx
 * <PremiumToolbar
 *   tools={[
 *     { icon: "format_bold", label: "Bold", active: isBold(), onClick: toggleBold },
 *     { icon: "format_italic", label: "Italic", active: isItalic(), onClick: toggleItalic },
 *     { icon: "format_underlined", label: "Underline", onClick: toggleUnderline },
 *   ]}
 *   glass
 *   scrollable
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --glass-bg-strong, --glass-border, --tier-2,
 *   --hairline, --color-primary
 * - Spacing: --space-1, --space-2
 * - Radius: --radius-md
 * - Z-index: --z-sticky
 * - Motion: --dur-fast, --ease-spring
 * - Blur: --blur-xl (backdrop-blur-xl)
 *
 * Keyboard navigation:
 * - Left/Right arrows move focus between tools (roving tabindex)
 * - Home/End move to first/last tool
 * - Enter/Space activate focused tool
 */
const PremiumToolbar: Component<PremiumToolbarProps> = (rawProps) => {
  const props = mergeProps(
    {
      glass: false,
      position: "top" as ToolbarPosition,
      scrollable: false,
    },
    rawProps,
  );

  const [local] = splitProps(props, [
    "tools", "glass", "position", "scrollable", "class", "style",
  ]);

  // Roving tabindex: track which tool is focusable
  const [focusIndex, setFocusIndex] = createSignal(0);

  const containerClass = (): string => {
    const base = [
      "flex items-center gap-1 p-1 rounded-md",
      "z-sticky",
    ];

    if (local.glass) {
      base.push("bg-glass-strong border border-glass-border backdrop-blur-xl");
    } else {
      base.push("bg-tier-2 border border-hairline");
    }

    if (local.scrollable) {
      base.push("overflow-x-auto hide-scrollbar");
    }

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  const handleToolbarKeyDown = (e: KeyboardEvent) => {
    const toolCount = local.tools.length;
    if (toolCount === 0) return;

    let newIndex = focusIndex();

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        newIndex = (focusIndex() + 1) % toolCount;
        break;
      case "ArrowLeft":
        e.preventDefault();
        newIndex = (focusIndex() - 1 + toolCount) % toolCount;
        break;
      case "Home":
        e.preventDefault();
        newIndex = 0;
        break;
      case "End":
        e.preventDefault();
        newIndex = toolCount - 1;
        break;
      default:
        return;
    }

    setFocusIndex(newIndex);

    // Focus the button at the new index
    const toolbar = e.currentTarget as HTMLElement;
    const buttons = toolbar.querySelectorAll<HTMLButtonElement>("[role='toolbar'] > button, [data-toolbar-item]");
    if (buttons[newIndex]) {
      buttons[newIndex].focus();
    }
  };

  return (
    <div
      class={containerClass()}
      style={local.style}
      role="toolbar"
      aria-label="Toolbar"
      onKeyDown={handleToolbarKeyDown}
    >
      <For each={local.tools}>
        {(tool, index) => {
          const isTabbable = (): boolean => index() === focusIndex();

          return (
            <div class="relative inline-flex flex-col items-center">
              <PremiumIconButton
                variant={tool.active ? "primary" : "ghost"}
                size="compact"
                icon={tool.icon}
                iconFill={tool.active || tool.iconFill}
                label={tool.label}
                disabled={tool.disabled}
                selected={tool.active}
                onClick={tool.onClick}
                data-toolbar-item=""
                tabindex={isTabbable() ? 0 : -1}
              />
              {/* Active indicator dot */}
              <Show when={tool.active}>
                <span
                  class="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-primary"
                  style={{
                    width: "var(--space-1)",
                    height: "var(--space-1)",
                  }}
                  aria-hidden="true"
                />
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
};

export { PremiumToolbar };
export type { ToolItem, ToolbarPosition };
export default PremiumToolbar;
