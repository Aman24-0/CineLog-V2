// src/shared/ui/glass/GlassPosterCard.tsx
import { Component, JSX, Show, splitProps, mergeProps, createSignal, createEffect } from "solid-js";
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

const defaultProps: Required<
  Pick<GlassPosterCardProps, "loading" | "selected">
> & { imageAlt?: string } = {
  loading: false,
  selected: false,
  imageAlt: undefined
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
    "title",
    "meta",
    "imageUrl",
    "imageAlt",
    "loading",
    "selected",
    "overlay",
    "onClick",
    "class"
  ]);

  // Track image load errors so we can show the fallback icon
  // instead of a broken image glyph. Reset when the URL changes
  // so a new image gets a fresh attempt.
  const [imgError, setImgError] = createSignal(false);
  createEffect(() => {
    local.imageUrl; // track dependency
    setImgError(false);
  });

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
      <div class="relative aspect-[2/3] w-full flex-shrink-0 bg-tier-3">
        <Show when={!local.loading && local.imageUrl && !imgError()}>
          <img
            src={local.imageUrl}
            alt={local.imageAlt || local.title || "Poster"}
            class="absolute inset-0 h-full w-full object-cover transition-transform duration-base ease-smooth group-hover:scale-[1.04]"
            loading="lazy"
            decoding="async"
            width={342}
            height={513}
            onError={() => setImgError(true)}
          />
        </Show>
        <Show when={!local.loading && (!local.imageUrl || imgError())}>
          <div class="absolute inset-0 flex items-center justify-center">
            <span
              class="material-symbols-outlined text-3xl text-text-dim"
              aria-hidden="true"
            >
              movie
            </span>
          </div>
        </Show>
        {/* Top-Right Overlay */}
        <Show when={local.overlay && !local.loading}>
          <div class="absolute right-2 top-2 z-badge">{local.overlay}</div>
        </Show>
      </div>

      {/* Content Area */}
      <div class="flex flex-1 flex-col justify-center gap-1 p-3">
        <Show
          when={!local.loading}
          fallback={
            <>
              <div class="h-4 w-3/4 rounded-sm bg-tier-3" aria-hidden="true" />
              <div
                class="mt-1 h-3 w-1/2 rounded-sm bg-tier-3"
                aria-hidden="true"
              />
            </>
          }
        >
          <h3 class="font-outfit line-clamp-2 text-sm font-bold leading-snug text-text-strong">
            {local.title}
          </h3>
          <Show when={local.meta}>
            <p class="mt-auto font-mono text-2xs font-semibold uppercase tracking-wider text-text-muted">
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
