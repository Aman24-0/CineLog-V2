// src/shared/ui/glass/GlassButton.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Button visual variant */
type ButtonVariant =
  "primary" | "secondary" | "glass" | "ghost" | "danger" | "success";

/** Button size */
type ButtonSize = "compact" | "default" | "large";

/** Icon placement */
type IconPosition = "left" | "right";

// ─── Props ─────────────────────────────────────────────────────

export interface GlassButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant. @default "primary" */
  variant?: ButtonVariant;
  /** Size preset: compact (dense), default (standard), large (hero CTA). @default "default" */
  size?: ButtonSize;
  /** Show loading spinner and disable interaction. @default false */
  loading?: boolean;
  /** Disable the button. @default false */
  disabled?: boolean;
  /** Stretch to full container width. @default false */
  fullWidth?: boolean;
  /** Material Symbol icon name. */
  icon?: string;
  /** Icon placement relative to label. @default "left" */
  iconPosition?: IconPosition;
  /** Render icon with FILL=1 (filled style). @default false */
  iconFill?: boolean;
  /** Selected/toggle state. @default false */
  selected?: boolean;
  /** Active/pressed-in visual state. @default false */
  active?: boolean;
}

// ─── Variant Class Maps ────────────────────────────────────────

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary shadow-glow hover:brightness-110 hover:-translate-y-0.5",
  secondary:
    "bg-glass backdrop-blur-md text-primary border border-glass-border hover:bg-glass-strong hover:-translate-y-0.5",
  glass:
    "bg-glass backdrop-blur-xl text-primary border border-glass-border hover:bg-glass-strong hover:backdrop-blur-2xl hover:-translate-y-0.5",
  ghost:
    "bg-transparent text-primary hover:bg-primary-dim hover:-translate-y-0.5",
  danger:
    "bg-danger text-on-primary hover:brightness-110 hover:-translate-y-0.5",
  success:
    "bg-success text-on-primary hover:brightness-110 hover:-translate-y-0.5"
};

// ─── Size Class Maps ───────────────────────────────────────────

const sizeClasses: Record<ButtonSize, string> = {
  compact: "p-2 px-3 text-sm gap-1",
  default: "p-3 px-5 text-md gap-2",
  large: "p-4 px-6 text-lg gap-2"
};

const iconSizeMap: Record<ButtonSize, string> = {
  compact: "text-sm",
  default: "text-md",
  large: "text-lg"
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassButton — full-featured button with variants (including glass), sizes, states,
 * icon support, loading, disabled, selected, active, and touch feedback.
 */
const GlassButton: Component<GlassButtonProps> = (rawProps) => {
  const props = mergeProps(
    {
      variant: "primary" as ButtonVariant,
      size: "default" as ButtonSize,
      loading: false,
      disabled: false,
      fullWidth: false,
      iconPosition: "left" as IconPosition,
      iconFill: false,
      selected: false,
      active: false
    },
    rawProps
  );

  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "loading",
    "disabled",
    "fullWidth",
    "icon",
    "iconPosition",
    "iconFill",
    "selected",
    "active",
    "class",
    "style",
    "children",
    "onClick",
    "type"
  ]);

  const isDisabled = (): boolean => local.disabled || local.loading;

  const iconFontVariation = (): string =>
    local.iconFill
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";

  const handleClick = (e: MouseEvent) => {
    if (isDisabled()) return;
    (local.onClick as ((e: MouseEvent) => void) | undefined)?.(e);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isDisabled()) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLButtonElement).click();
    }
  };

  const computedClass = (): string => {
    const base = [
      "inline-flex items-center justify-center",
      "font-label font-semibold tracking-label",
      "rounded-md transition-all duration-fast ease-spring",
      "focus-ring cursor-pointer select-none",
      "active:scale-[0.97]",
      variantClasses[local.variant],
      sizeClasses[local.size]
    ];

    if (local.fullWidth) base.push("w-full");
    if (local.selected) base.push("border-2 border-primary bg-primary-dim");
    if (local.active) base.push("scale-[0.97] brightness-90");
    if (isDisabled())
      base.push("opacity-disabled pointer-events-none cursor-not-allowed");
    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  return (
    <button
      {...rest}
      // Default to type="button" so the button never accidentally submits
      // a parent <form>. Callers can still override by passing type="submit".
      type={local.type ?? "button"}
      class={computedClass()}
      style={local.style}
      disabled={isDisabled()}
      aria-busy={local.loading || undefined}
      aria-disabled={isDisabled() || undefined}
      aria-pressed={local.selected || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Loading spinner */}
      <Show when={local.loading}>
        <span
          class="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
          style={{
            width: "var(--space-4)",
            height: "var(--space-4)",
            "border-width": "2px"
          }}
          aria-hidden="true"
        />
      </Show>

      {/* Icon (left) */}
      <Show
        when={local.icon && !local.loading && local.iconPosition === "left"}
      >
        <span
          class={`material-symbols-outlined ${iconSizeMap[local.size]}`}
          style={{ "font-variation-settings": iconFontVariation() }}
          aria-hidden="true"
        >
          {local.icon}
        </span>
      </Show>

      {/* Label content */}
      <Show when={local.children}>
        <span class="inline-flex items-center">{local.children}</span>
      </Show>

      {/* Icon (right) */}
      <Show
        when={local.icon && !local.loading && local.iconPosition === "right"}
      >
        <span
          class={`material-symbols-outlined ${iconSizeMap[local.size]}`}
          style={{ "font-variation-settings": iconFontVariation() }}
          aria-hidden="true"
        >
          {local.icon}
        </span>
      </Show>
    </button>
  );
};

export { GlassButton };
export default GlassButton;
