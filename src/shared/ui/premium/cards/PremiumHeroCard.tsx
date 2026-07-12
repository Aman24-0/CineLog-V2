// src/shared/ui/premium/cards/PremiumHeroCard.tsx
import { Component, JSX, Show, For, splitProps, mergeProps } from "solid-js";

// ─── Variant & Size Types ──────────────────────────────────────

/** Hero card aspect ratio for the backdrop image. */
type HeroAspectRatio = "16:9" | "2:3" | "wide";

/** Gradient overlay strength from bottom. */
type GradientStrength = "standard" | "heavy" | "subtle";

/** Hero card size controlling content spacing. */
type HeroSize = "compact" | "default" | "large";

/** Action item for hero card action buttons. */
interface HeroAction {
  /** Material Symbol icon name. */
  icon: string;
  /** Accessible label for the action. */
  label: string;
  /** Button visual variant. */
  variant?: "primary" | "secondary" | "ghost";
  /** Click handler. */
  onClick: (e: MouseEvent) => void;
}

// ─── Token Maps ────────────────────────────────────────────────

const aspectRatioMap: Record<HeroAspectRatio, string> = {
  "16:9": "aspect-video",
  "2:3": "aspect-[2/3]",
  "wide": "aspect-[21/9]",
};

const gradientMap: Record<GradientStrength, string> = {
  standard: "from-tier-0/70 via-tier-0/40 to-transparent",
  heavy: "from-tier-0/90 via-tier-0/70 to-tier-0/20",
  subtle: "from-tier-0/40 via-tier-0/20 to-transparent",
};

const sizeContentMap: Record<HeroSize, { eyebrow: string; title: string; subtitle: string; gap: string; padding: string }> = {
  compact: {
    eyebrow: "text-2xs font-label tracking-eyebrow",
    title: "text-lg font-display",
    subtitle: "text-xs font-body text-soft",
    gap: "gap-1",
    padding: "p-3",
  },
  default: {
    eyebrow: "text-xs font-label tracking-eyebrow",
    title: "text-2xl font-display",
    subtitle: "text-sm font-body text-soft",
    gap: "gap-2",
    padding: "p-4",
  },
  large: {
    eyebrow: "text-sm font-label tracking-eyebrow",
    title: "text-4xl font-display",
    subtitle: "text-md font-body text-soft",
    gap: "gap-3",
    padding: "p-6",
  },
};

const actionVariantMap: Record<string, string> = {
  primary: "bg-primary text-on-primary hover:brightness-110",
  secondary: "bg-tier-3 text-strong border border-hairline-2 hover:bg-tier-4",
  ghost: "bg-transparent text-soft hover:bg-tier-3 hover:text-strong",
};

// ─── Props ─────────────────────────────────────────────────────

export interface PremiumHeroCardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Hero title — main heading. */
  title: string;
  /** Hero subtitle — secondary text. */
  subtitle?: string;
  /** Eyebrow text — small label above title, rendered in accent color. */
  eyebrow?: string;
  /** Backdrop image URL. */
  imageUrl?: string;
  /** Alt text for the backdrop image. @default "" */
  imageAlt?: string;
  /** Action buttons rendered in the content cluster. */
  actions?: HeroAction[];
  /** Aspect ratio of the backdrop image. @default "16:9" */
  aspectRatio?: HeroAspectRatio;
  /** Gradient overlay strength from bottom. @default "standard" */
  gradientStrength?: GradientStrength;
  /** Size preset controlling content spacing. @default "default" */
  size?: HeroSize;
  /** Whether the card is in a loading state — renders skeleton. @default false */
  loading?: boolean;
  /** Click handler for the entire card. */
  onClick?: (e: MouseEvent) => void;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumHeroCardProps,
  "aspectRatio" | "gradientStrength" | "size" | "loading"
>> & { imageAlt?: string } = {
  aspectRatio: "16:9",
  gradientStrength: "standard",
  size: "default",
  loading: false,
  imageAlt: "",
};

// ─── Component ─────────────────────────────────────────────────

/**
 * PremiumHeroCard — a cinematic hero card with backdrop image.
 *
 * Renders a full-bleed backdrop image with a gradient overlay from the bottom,
 * and a content cluster anchored to the bottom containing: eyebrow (accent color,
 * font-label), title (font-display), subtitle (font-body, text-soft), and an
 * optional actions row.
 *
 * **Aspect ratios:**
 * - `16:9` — standard widescreen
 * - `2:3` — portrait/poster
 * - `wide` — ultra-wide cinematic
 *
 * **Gradient strength** controls the bottom gradient overlay:
 * - `standard` — 70→40→0% opacity
 * - `heavy` — 90→70→20% opacity (high contrast)
 * - `subtle` — 40→20→0% opacity (minimal)
 *
 * Clicking anywhere on the card triggers `onClick`.
 *
 * **Loading** state renders a skeleton with shimmer animation.
 *
 * All transitions respect `prefers-reduced-motion` via global baseline.
 *
 * @example
 * ```tsx
 * <PremiumHeroCard
 *   title="Inception"
 *   subtitle="A mind-bending thriller"
 *   eyebrow="Now Playing"
 *   imageUrl="/backdrop.jpg"
 *   actions={[
 *     { icon: "play_arrow", label: "Watch", variant: "primary", onClick: handleWatch },
 *     { icon: "bookmark", label: "Save", variant: "ghost", onClick: handleSave },
 *   ]}
 *   onClick={() => navigate("/movie/123")}
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --tier-0, --p, --p2, --tier-3, --tier-4, --hairline-2, --color-primary
 * - Typography: --font-display, --font-label, --font-body, --font-size-*, --letter-spacing-eyebrow
 * - Spacing: --space-3 through --space-6
 * - Radius: --radius-lg
 * - Shadows: --shadow-card
 * - Opacity: tier opacity via Tailwind /opacity modifier
 */
const PremiumHeroCard: Component<PremiumHeroCardProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "title", "subtitle", "eyebrow", "imageUrl", "imageAlt",
    "actions", "aspectRatio", "gradientStrength", "size", "loading",
    "onClick", "class", "style",
  ]);

  const sizeTokens = () => sizeContentMap[local.size];

  /** Card classes. */
  const cardClasses = (): string => {
    const classes: string[] = [
      "relative",
      "overflow-hidden",
      "rounded-lg",
      "shadow-card",
      "group",
    ];

    if (local.onClick) {
      classes.push("cursor-pointer", "focus-ring");
      classes.push(
        "transition-[transform,box-shadow]",
        "duration-base",
        "ease-standard",
        "hover:shadow-raised",
        "hover:scale-[1.005]",
        "active:scale-[0.995]",
        "active:duration-fast",
      );
    }

    if (local.class) classes.push(local.class);

    return classes.filter(Boolean).join(" ");
  };

  /** Keyboard handler for click activation. */
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!local.onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  };

  return (
    <div
      {...rest}
      class={cardClasses()}
      style={local.style}
      role={local.onClick ? "button" : undefined}
      tabindex={local.onClick ? 0 : undefined}
      onClick={local.onClick}
      onKeyDown={local.onClick ? handleKeyDown : undefined}
      aria-label={local.onClick ? local.title : undefined}
    >
      <Show
        when={!local.loading}
        fallback={
          /* Loading skeleton */
          <div class={`${aspectRatioMap[local.aspectRatio]} bg-tier-2 relative overflow-hidden`}>
            <div
              class="absolute inset-0 z-overlay"
              style={{
                background: "linear-gradient(90deg, transparent, var(--tier-3), transparent)",
                "background-size": "200% 100%",
                animation: "shimmer 1.8s ease-in-out infinite",
              }}
              aria-hidden="true"
            />
            <div class="absolute bottom-0 inset-x-0 p-4 space-y-2">
              <div class="h-3 w-16 rounded-sm bg-tier-3" aria-hidden="true" />
              <div class="h-6 w-3/4 rounded-sm bg-tier-3" aria-hidden="true" />
              <div class="h-4 w-1/2 rounded-sm bg-tier-3" aria-hidden="true" />
            </div>
          </div>
        }
      >
        {/* Backdrop image */}
        <div class={`${aspectRatioMap[local.aspectRatio]} relative`}>
          <Show when={local.imageUrl} fallback={<div class="absolute inset-0 bg-tier-2" />}>
            <img
              src={local.imageUrl}
              alt={local.imageAlt || ""}
              class="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          </Show>

          {/* Gradient overlay */}
          <div
            class={`absolute inset-0 bg-gradient-to-t ${gradientMap[local.gradientStrength]}`}
            aria-hidden="true"
          />

          {/* Content cluster at bottom */}
          <div class={`absolute bottom-0 inset-x-0 ${sizeTokens().padding} ${sizeTokens().gap} flex flex-col z-content`}>
            {/* Eyebrow */}
            <Show when={local.eyebrow}>
              <span
                class={`${sizeTokens().eyebrow} uppercase`}
                style={{ color: "var(--p)" }}
              >
                {local.eyebrow}
              </span>
            </Show>

            {/* Title */}
            <h3 class={`${sizeTokens().title} text-strong line-clamp-2`}>
              {local.title}
            </h3>

            {/* Subtitle */}
            <Show when={local.subtitle}>
              <p class={`${sizeTokens().subtitle} line-clamp-2`}>
                {local.subtitle}
              </p>
            </Show>

            {/* Actions row */}
            <Show when={local.actions && local.actions.length > 0}>
              <div class="flex items-center gap-2 mt-2">
                <For each={local.actions}>
                  {(action) => (
                    <button
                      type="button"
                      class={[
                        "inline-flex items-center justify-center gap-1",
                        "rounded-md",
                        "px-3 py-1.5",
                        "text-sm font-label",
                        "transition-[background-color,transform]",
                        "duration-fast ease-standard",
                        "focus-ring",
                        actionVariantMap[action.variant || "secondary"],
                      ].filter(Boolean).join(" ")}
                      onClick={(e) => {
                        e.stopPropagation();
                        action.onClick(e);
                      }}
                      aria-label={action.label}
                    >
                      <span class="material-symbols-outlined text-sm" aria-hidden="true">
                        {action.icon}
                      </span>
                      <span>{action.label}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

export { PremiumHeroCard };
export default PremiumHeroCard;
