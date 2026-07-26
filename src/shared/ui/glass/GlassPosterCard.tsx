// src/shared/ui/glass/GlassPosterCard.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";
import { GlassCard } from "./GlassCard";

// ─── Types ─────────────────────────────────────────────────────

export interface GlassPosterCardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** The title of the content. */
  title: string;
  /** The secondary text or meta information. */
  meta?: string;
  /** The poster image URL. */
  imageUrl?: string;
  /** Alt text for the poster image. @default "" */
  imageAlt?: string;
  /** Whether the card is in a loading state — renders skeleton. @default false */
  loading?: boolean;
  /** Whether the card is in a selected/toggled state. @default false */
  selected?: boolean;
  /** Additional top-right overlay element (e.g. status dot, badge). */
  overlay?: JSX.Element;
  /** Click handler for the card. */
  onClick?: (e: MouseEvent) => void;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<GlassPosterCardProps,
  "loading" | "selected"
>> & { imageAlt?: string } = {
  loading: false,
  selected: false,
  imageAlt: "",
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassPosterCard — a standardized glass card tailored for poster-style content.
 *
 * It uses GlassCard under the hood to inherit standard glass interaction,
 * border, blur, and states. Contains a 2:3 aspect ratio image area at the top,
 * and a compact metadata section at the bottom.
 *
 * @example
 * ```tsx
 * <GlassPosterCard
 *   title="Inception"
 *   meta="2010 • Sci-Fi"
 *   imageUrl="/poster.jpg"
 *   onClick={() => navigate("/movie/123")}
 * />
 * ```
 */
const GlassPosterCard: Component<GlassPosterCardProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "title", "meta", "imageUrl", "imageAlt", "loading", "selected", "overlay", "onClick", "class",
  ]);

  return (
    <GlassCard
      {...rest}
      variant="glass"
      size="compact"
      padding="none"
      interactive={!!local.onClick}
      selected={local.selected}
      loading={local.loading}
      onClick={local.onClick}
      aria-label={local.onClick ? local.title : undefined}
      class={`flex flex-col ${local.class || ""}`}
    >
      {/* Poster Image Area (2:3 aspect ratio) */}
      <div class="relative w-full aspect-[2/3] bg-tier-3 flex-shrink-0">
        <Show when={!local.loading && local.imageUrl}>
          <img
            src={local.imageUrl}
            alt={local.imageAlt || ""}
            class="absolute inset-0 w-full h-full object-cover transition-transform duration-base ease-smooth group-hover:scale-[1.04]"
            loading="lazy"
            decoding="async"
          />
        </Show>
        <Show when={!local.loading && !local.imageUrl}>
          <div class="absolute inset-0 flex items-center justify-center">
             <span class="material-symbols-outlined text-text-dim text-3xl" aria-hidden="true">
               movie
             </span>
          </div>
        </Show>
        {/* Top-Right Overlay */}
        <Show when={local.overlay && !local.loading}>
          <div class="absolute top-2 right-2 z-badge">
            {local.overlay}
          </div>
        </Show>
      </div>

      {/* Content Area */}
      <div class="p-3 flex flex-col gap-1 flex-1 justify-center">
        <Show
          when={!local.loading}
          fallback={
            <>
              <div class="h-4 w-3/4 bg-tier-3 rounded-sm" aria-hidden="true" />
              <div class="h-3 w-1/2 bg-tier-3 rounded-sm mt-1" aria-hidden="true" />
            </>
          }
        >
          <h3 class="font-outfit font-bold text-sm text-text-strong line-clamp-2 leading-snug">
            {local.title}
          </h3>
          <Show when={local.meta}>
            <p class="font-mono text-2xs font-semibold uppercase tracking-wider text-text-muted mt-auto">
              {local.meta}
            </p>
          </Show>
        </Show>
      </div>
    </GlassCard>
  );
};

export { GlassPosterCard };
export default GlassPosterCard;
