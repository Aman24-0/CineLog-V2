// src/shared/ui/premium/feedback/PremiumCarouselHeader.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumCarouselHeaderProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Section title. */
  title: string;
  /** Eyebrow text above the title — displayed in font-label accent color. */
  eyebrow?: string;
  /** Material Symbol icon before the title. */
  icon?: string;
  /** Label for a custom action button on the right side. */
  actionLabel?: string;
  /** Callback for the custom action button. */
  onAction?: () => void;
  /** Item count — displayed as a count badge (e.g. "12 items"). */
  count?: number;
  /** Whether to show a "See All" link on the right. @default false */
  seeAll?: boolean;
  /** Callback when "See All" is clicked. */
  onSeeAll?: () => void;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumCarouselHeaderProps, "seeAll">> = {
  seeAll: false,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumCarouselHeader — a header for carousel/rail sections.
 *
 * Provides a structured header with optional eyebrow, icon, title,
 * item count badge, and right-side actions ("See All" link or custom
 * action button). Designed for use above horizontal scrolling rail
 * containers.
 *
 * **Layout:**
 * - Left: icon (optional) + eyebrow (optional) + title + count badge
 * - Right: "See All" link and/or custom action button
 *
 * **Eyebrow** is rendered in font-label with accent color and uppercase tracking.
 * **Title** uses font-heading with bold weight.
 * **Count** is shown as a small badge using font-label.
 *
 * @example
 * ```tsx
 * <PremiumCarouselHeader
 *   eyebrow="Trending"
 *   title="Popular This Week"
 *   icon="trending_up"
 *   count={24}
 *   seeAll
 *   onSeeAll={() => navigate("/discover")}
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --p, --color-text-strong, --color-text-dim, --color-primary,
 *   --color-text-muted
 * - Spacing: --space-1 through --space-4
 * - Typography: --font-family-heading, --font-family-label, --font-size-xs/sm/lg
 * - Motion: --dur-fast, --ease-spring
 */
const PremiumCarouselHeader: Component<PremiumCarouselHeaderProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "title", "eyebrow", "icon", "actionLabel", "onAction", "count",
    "seeAll", "onSeeAll", "class", "style",
  ]);

  const handleActionKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      local.onAction?.();
    }
  };

  const handleSeeAllKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      local.onSeeAll?.();
    }
  };

  const containerClass = (): string => {
    const base = [
      "flex items-center justify-between",
      "w-full",
    ];
    if (local.class) base.push(local.class);
    return base.join(" ");
  };

  return (
    <div
      {...rest}
      class={containerClass()}
      style={local.style}
    >
      {/* Left side: icon + eyebrow + title + count */}
      <div class="flex items-center gap-2">
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

        <div class="flex flex-col gap-0">
          {/* Eyebrow */}
          <Show when={local.eyebrow}>
            <span class="font-label text-2xs text-primary uppercase tracking-eyebrow leading-none">
              {local.eyebrow}
            </span>
          </Show>

          {/* Title + Count */}
          <div class="flex items-center gap-2">
            <h2 class="font-heading font-bold text-text-strong text-lg leading-tight">
              {local.title}
            </h2>

            {/* Count badge */}
            <Show when={local.count !== undefined && local.count !== null}>
              <span class="font-label text-2xs text-text-muted bg-tier-2 border border-hairline rounded-pill p-1 px-2">
                {local.count} items
              </span>
            </Show>
          </div>
        </div>
      </div>

      {/* Right side: See All + Action */}
      <div class="flex items-center gap-3">
        {/* Custom action */}
        <Show when={local.actionLabel && local.onAction}>
          <button
            class="font-label text-xs text-primary tracking-label hover:brightness-110 transition-all duration-fast ease-spring focus-ring rounded-md p-2 cursor-pointer"
            onClick={local.onAction}
            onKeyDown={handleActionKeyDown}
            type="button"
          >
            {local.actionLabel}
          </button>
        </Show>

        {/* See All link */}
        <Show when={local.seeAll && local.onSeeAll}>
          <button
            class="font-label text-xs text-text-dim tracking-label hover:text-primary transition-colors duration-fast ease-spring focus-ring rounded-md p-2 cursor-pointer flex items-center gap-1"
            onClick={local.onSeeAll}
            onKeyDown={handleSeeAllKeyDown}
            type="button"
          >
            See All
            <span
              class="material-symbols-outlined text-2xs"
              style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
              aria-hidden="true"
            >
              arrow_forward
            </span>
          </button>
        </Show>
      </div>
    </div>
  );
};

export { PremiumCarouselHeader };
export default PremiumCarouselHeader;
