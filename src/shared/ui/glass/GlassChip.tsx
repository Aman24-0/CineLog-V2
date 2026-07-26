// src/shared/ui/glass/GlassChip.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant Types ─────────────────────────────────────────────

type ChipVariant = "default" | "glass" | "accent";

export interface GlassChipProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** The text label of the chip. */
  label: string;
  /** Visual variant. @default "glass" */
  variant?: ChipVariant;
  /** Material Symbol icon name (left). */
  icon?: string;
  /** Material Symbol icon name for a trailing action (e.g. "close"). */
  trailingIcon?: string;
  /** Accessible label for the trailing icon button (required when onTrailingIconClick is provided). */
  trailingIconLabel?: string;
  /** Click handler for the entire chip. */
  onClick?: (e: MouseEvent) => void;
  /** Click handler for the trailing icon (e.g. for removing the chip). */
  onTrailingIconClick?: (e: MouseEvent) => void;
  /** Selected/active state. */
  selected?: boolean;
}

const defaultProps: Required<Pick<GlassChipProps, "variant" | "selected">> = {
  variant: "glass",
  selected: false,
};

const variantClasses: Record<ChipVariant, string> = {
  default: "bg-glass backdrop-blur-md border-glass-border text-text-body",
  glass: "bg-glass backdrop-blur-xl border-glass-border text-text-body",
  accent: "bg-primary-dim border-primary text-primary shadow-glow",
};

/**
 * GlassChip — A compact interactive element for categories, tags, or filters.
 */
const GlassChip: Component<GlassChipProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "label", "variant", "icon", "trailingIcon", "trailingIconLabel", "onClick", "onTrailingIconClick", "selected", "class"
  ]);

  const isInteractive = () => !!local.onClick;

  const chipClasses = () => {
    const base = [
      "inline-flex items-center gap-2",
      "px-3 py-1.5",
      "rounded-pill",
      "font-outfit font-medium text-sm",
      "border",
      "transition-all duration-fast ease-out",
    ];

    if (local.selected) {
      base.push(variantClasses.accent);
    } else {
      base.push(variantClasses[local.variant]);
    }

    if (isInteractive()) {
      base.push(
        "cursor-pointer",
        "focus-ring",
        local.variant === "glass" ? "hover:bg-glass-strong hover:backdrop-blur-2xl" : "hover:bg-tier-3 hover:border-hairline-3",
        "active:scale-[0.97]"
      );
    }

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isInteractive()) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  };

  return (
    <div
      {...rest}
      class={chipClasses()}
      role={isInteractive() ? "button" : undefined}
      tabindex={isInteractive() ? 0 : undefined}
      onClick={local.onClick}
      onKeyDown={handleKeyDown}
      aria-pressed={local.selected || undefined}
    >
      <Show when={local.icon}>
        <span class="material-symbols-outlined text-[16px]" aria-hidden="true">
          {local.icon}
        </span>
      </Show>

      <span>{local.label}</span>

      <Show when={local.trailingIcon}>
        <button
          type="button"
          class="flex items-center justify-center rounded-full p-[2px] -mr-1 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          onClick={(e) => {
            if (local.onTrailingIconClick) {
              e.stopPropagation();
              local.onTrailingIconClick(e);
            }
          }}
          aria-label={local.onTrailingIconClick ? (local.trailingIconLabel ?? `Remove ${local.label}`) : undefined}
          aria-hidden={!local.onTrailingIconClick}
          tabindex={local.onTrailingIconClick ? 0 : -1}
        >
           <span class="material-symbols-outlined text-[14px]" aria-hidden="true">
             {local.trailingIcon}
           </span>
        </button>
      </Show>
    </div>
  );
};

export { GlassChip };
export default GlassChip;
