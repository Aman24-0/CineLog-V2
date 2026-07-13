// src/shared/ui/premium/navigation/PremiumPageHeader.tsx
import { Component, JSX, Show, For, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Page header size preset */
type PageHeaderSize = "compact" | "default" | "large";

/** Action item definition */
interface PageHeaderAction {
  /** Material Symbol icon name. */
  icon: string;
  /** Accessible label for the action. */
  label: string;
  /** Click handler. */
  onClick: () => void;
  /** Visual variant of the action button. @default "ghost" */
  variant?: "primary" | "secondary" | "ghost";
}

// ─── Token Maps ────────────────────────────────────────────────

const sizeClasses: Record<PageHeaderSize, { container: string; title: string; subtitle: string; gap: string }> = {
  compact: {
    container: "p-3",
    title: "text-lg",
    subtitle: "text-xs",
    gap: "gap-1",
  },
  default: {
    container: "p-5",
    title: "text-2xl",
    subtitle: "text-sm",
    gap: "gap-2",
  },
  large: {
    container: "p-8",
    title: "text-4xl",
    subtitle: "text-base",
    gap: "gap-3",
  },
};

const actionVariantClasses: Record<string, string> = {
  primary: "bg-primary text-on-primary hover:brightness-110",
  secondary: "bg-tier-2 text-text-body border border-hairline-2 hover:bg-tier-3",
  ghost: "bg-transparent text-text-body hover:bg-tier-3",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumPageHeaderProps extends JSX.HTMLAttributes<HTMLElement> {
  /** Page title. */
  title: string;
  /** Subtitle text below the title. */
  subtitle?: string;
  /** Eyebrow text above the title — font-label accent uppercase. */
  eyebrow?: string;
  /** Label for the back link (e.g. "Watchlist"). */
  backLabel?: string;
  /** Callback when the back link is clicked. */
  onBack?: () => void;
  /** Material Symbol icon before the title. */
  icon?: string;
  /** Array of action buttons on the right side. */
  actions?: PageHeaderAction[];
  /** Size preset. @default "default" */
  size?: PageHeaderSize;
  /** Use glass background with backdrop blur. @default false */
  glass?: boolean;
  /** Make the header sticky with z-sticky. @default false */
  sticky?: boolean;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<PremiumPageHeaderProps, "size" | "glass" | "sticky">
> = {
  size: "default",
  glass: false,
  sticky: false,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumPageHeader — a page-level header with back navigation, eyebrow, title, subtitle, and actions.
 *
 * Provides a structured page header with:
 * - **Back link:** "← Back to [backLabel]" in accent color, font-label
 * - **Eyebrow:** font-label accent uppercase with tracking
 * - **Title:** font-display large text
 * - **Subtitle:** font-body text-soft
 * - **Actions:** Right-aligned action buttons with icon support
 * - **Glass:** Frosted glass background with backdrop blur
 * - **Sticky:** Position sticky with z-sticky for persistent headers
 *
 * @example
 * ```tsx
 * <PremiumPageHeader
 *   title="Movie Details"
 *   eyebrow="Film"
 *   backLabel="Search"
 *   onBack={() => navigate(-1)}
 *   actions={[
 *     { icon: "share", label: "Share", onClick: shareMovie },
 *     { icon: "bookmark", label: "Save", onClick: saveMovie, variant: "primary" },
 *   ]}
 *   glass
 *   sticky
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --p, --color-text-strong, --color-text-soft, --color-text-dim,
 *   --glass-bg, --glass-border, --tier-*
 * - Spacing: --space-1 through --space-8
 * - Typography: --font-family-display, --font-family-heading, --font-family-body, --font-family-label
 * - Z-index: --z-sticky
 * - Blur: --blur-lg
 * - Motion: --dur-fast, --ease-spring
 */
const PremiumPageHeader: Component<PremiumPageHeaderProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "title", "subtitle", "eyebrow", "backLabel", "onBack", "icon",
    "actions", "size", "glass", "sticky", "class", "style",
  ]);

  const handleBackKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      local.onBack?.();
    }
  };

  const containerClass = (): string => {
    const size = sizeClasses[local.size];
    const base = [
      "flex flex-col",
      size.container,
      size.gap,
    ];

    // Glass background
    if (local.glass) {
      base.push("bg-glass backdrop-blur-lg border-b border-glass-border");
    } else {
      base.push("bg-void border-b border-hairline");
    }

    // Sticky positioning
    if (local.sticky) {
      base.push("sticky top-0 z-sticky");
    }

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  return (
    <header
      {...rest}
      class={containerClass()}
      style={local.style}
    >
      {/* Back link */}
      <Show when={local.backLabel && local.onBack}>
        <button
          class="inline-flex items-center gap-1 font-label text-2xs text-primary tracking-label hover:brightness-110 transition-colors duration-fast ease-spring focus-ring rounded-sm p-1 cursor-pointer w-fit"
          onClick={local.onBack}
          onKeyDown={handleBackKeyDown}
          type="button"
          aria-label={`Back to ${local.backLabel}`}
        >
          <span
            class="material-symbols-outlined text-2xs"
            style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            aria-hidden="true"
          >
            arrow_back
          </span>
          Back to {local.backLabel}
        </button>
      </Show>

      {/* Main row: left (icon + eyebrow + title) + right (actions) */}
      <div class="flex items-start justify-between gap-4">
        {/* Left side */}
        <div class="flex flex-col gap-1 min-w-0">
          {/* Icon + Eyebrow */}
          <div class="flex items-center gap-2">
            <Show when={local.icon}>
              <span
                class="material-symbols-outlined text-primary text-sm"
                style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                aria-hidden="true"
              >
                {local.icon}
              </span>
            </Show>

            <Show when={local.eyebrow}>
              <span class="font-label text-2xs text-primary uppercase tracking-eyebrow leading-none">
                {local.eyebrow}
              </span>
            </Show>
          </div>

          {/* Title */}
          <h1 class={`font-display font-bold text-text-strong ${sizeClasses[local.size].title} leading-tight truncate`}>
            {local.title}
          </h1>

          {/* Subtitle */}
          <Show when={local.subtitle}>
            <p class={`font-body text-text-soft ${sizeClasses[local.size].subtitle}`}>
              {local.subtitle}
            </p>
          </Show>
        </div>

        {/* Right side: Actions */}
        <Show when={local.actions && local.actions.length > 0}>
          <div class="flex items-center gap-2 flex-shrink-0">
            <For each={local.actions}>
              {(action) => {
                const variant = action.variant || "ghost";
                const handleActionClick = () => action.onClick();
                const handleActionKeyDown = (e: KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    action.onClick();
                  }
                };

                return (
                  <button
                    class={`inline-flex items-center justify-center gap-1 font-label text-xs tracking-label rounded-md p-2 px-3 transition-all duration-fast ease-spring focus-ring cursor-pointer ${actionVariantClasses[variant]}`}
                    onClick={handleActionClick}
                    onKeyDown={handleActionKeyDown}
                    type="button"
                    aria-label={action.label}
                  >
                    <span
                      class="material-symbols-outlined text-sm"
                      style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                      aria-hidden="true"
                    >
                      {action.icon}
                    </span>
                    <span class="sr-only sm:not-sr-only">{action.label}</span>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </header>
  );
};

export { PremiumPageHeader };
export default PremiumPageHeader;

// Re-export the Action type for consumers
export type { PageHeaderAction };
