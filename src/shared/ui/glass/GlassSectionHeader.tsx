// src/shared/ui/glass/GlassSectionHeader.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Variant & Accent Types ────────────────────────────────────

/** Section header size variant */
type SectionVariant = "default" | "compact" | "large";

/** Accent decoration type before the title */
type SectionAccent = "none" | "bar" | "dot" | "glow";

// ─── Token Maps ────────────────────────────────────────────────

const variantClasses: Record<SectionVariant, { title: string; gap: string; padding: string }> = {
  compact: {
    title: "text-sm font-heading",
    gap: "gap-1",
    padding: "pb-2",
  },
  default: {
    title: "text-lg font-heading",
    gap: "gap-2",
    padding: "pb-3",
  },
  large: {
    title: "text-2xl font-display",
    gap: "gap-3",
    padding: "pb-4",
  },
};

// ─── Props ─────────────────────────────────────────────────────

export interface GlassSectionHeaderProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Section title. */
  title: string;
  /** Eyebrow text above the title — font-label accent uppercase. */
  eyebrow?: string;
  /** Material Symbol icon before the title. */
  icon?: string;
  /** Label for an action button on the right side. */
  actionLabel?: string;
  /** Callback when the action button is clicked. */
  onAction?: () => void;
  /** Size variant controlling title font and spacing. @default "default" */
  variant?: SectionVariant;
  /** Accent decoration before the title. @default "none" */
  accent?: SectionAccent;
  /** Description text below the title. */
  description?: string;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<GlassSectionHeaderProps, "variant" | "accent">
> = {
  variant: "default",
  accent: "none",
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassSectionHeader — a section-level header with eyebrow, accent, description, and action.
 * Replaces PremiumSectionHeader with updated naming conventions.
 */
const GlassSectionHeader: Component<GlassSectionHeaderProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "title", "eyebrow", "icon", "actionLabel", "onAction",
    "variant", "accent", "description", "class", "style",
  ]);

  const hasAction = () => !!local.onAction;

  const handleActionKeyDown = (e: KeyboardEvent) => {
    if (!hasAction()) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      local.onAction?.();
    }
  };

  const containerClass = (): string => {
    const v = variantClasses[local.variant];
    const base = [
      "flex items-start justify-between w-full",
      v.padding,
    ];
    if (local.class) base.push(local.class);
    return base.join(" ");
  };

  /** Title wrapper classes — accent glow when accent="glow" */
  const titleWrapperClass = (): string => {
    const base = "flex items-center gap-2";
    if (local.accent === "glow") {
      return `${base} rounded-sm p-1`;
    }
    return base;
  };

  /** Title wrapper inline style — glow shadow when accent="glow" */
  const titleWrapperStyle = (): JSX.CSSProperties => {
    if (local.accent === "glow") {
      return { "box-shadow": "0 0 16px var(--p-glow)" };
    }
    return {};
  };

  return (
    <div
      {...rest}
      class={containerClass()}
      style={local.style}
    >
      {/* Left side: content */}
      <div class={`flex flex-col ${variantClasses[local.variant].gap}`}>
        {/* Eyebrow */}
        <Show when={local.eyebrow}>
          <span class="font-label text-2xs text-primary uppercase tracking-eyebrow leading-none">
            {local.eyebrow}
          </span>
        </Show>

        {/* Title row with accent decoration */}
        <div class={titleWrapperClass()} style={titleWrapperStyle()}>
          {/* Accent bar */}
          <Show when={local.accent === "bar"}>
            <span
              class="w-1 h-5 rounded-full bg-primary flex-shrink-0"
              aria-hidden="true"
            />
          </Show>

          {/* Accent dot */}
          <Show when={local.accent === "dot"}>
            <span
              class="w-2 h-2 rounded-full bg-primary flex-shrink-0"
              aria-hidden="true"
            />
          </Show>

          {/* Icon */}
          <Show when={local.icon}>
            <span
              class="material-symbols-outlined text-primary text-sm"
              style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
              aria-hidden="true"
            >
              {local.icon}
            </span>
          </Show>

          {/* Title */}
          <h2 class={`${variantClasses[local.variant].title} font-bold text-text-strong leading-tight`}>
            {local.title}
          </h2>
        </div>

        {/* Description */}
        <Show when={local.description}>
          <p class="font-body text-2xs text-text-dim leading-normal">
            {local.description}
          </p>
        </Show>
      </div>

      {/* Right side: Action */}
      <Show when={local.actionLabel && hasAction()}>
        <button
          class="inline-flex items-center gap-1 font-label text-xs text-primary tracking-label hover:brightness-110 transition-all duration-fast ease-spring focus-ring rounded-md p-2 px-3 cursor-pointer flex-shrink-0 mt-auto"
          onClick={() => local.onAction?.()}
          onKeyDown={handleActionKeyDown}
          type="button"
          aria-label={local.actionLabel}
        >
          {local.actionLabel}
        </button>
      </Show>
    </div>
  );
};

export { GlassSectionHeader };
export default GlassSectionHeader;
