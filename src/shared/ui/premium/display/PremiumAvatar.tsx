// src/shared/ui/premium/display/PremiumAvatar.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

// ─── Size & Border Types ──────────────────────────────────────

/** Avatar size preset — determines pixel dimensions. */
type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

/** Border style around the avatar. */
type AvatarBorder = "none" | "default" | "accent";

// ─── Token Maps ───────────────────────────────────────────────

const sizeMap: Record<AvatarSize, string> = {
  xs: "w-6 h-6",       // 24px
  sm: "w-8 h-8",       // 32px
  md: "w-11 h-11",     // 44px
  lg: "w-16 h-16",     // 64px
  xl: "w-20 h-20",     // 80px
};

const _sizePx: Record<AvatarSize, string> = {
  xs: "24px",
  sm: "32px",
  md: "44px",
  lg: "64px",
  xl: "80px",
};

const fontSizeMap: Record<AvatarSize, string> = {
  xs: "text-2xs",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-md",
  xl: "text-lg",
};

const borderMap: Record<AvatarBorder, string> = {
  none: "",
  default: "border border-hairline",
  accent: "border-2 border-primary",
};

const onlineDotSize: Record<AvatarSize, string> = {
  xs: "w-1.5 h-1.5",
  sm: "w-2 h-2",
  md: "w-2.5 h-2.5",
  lg: "w-3 h-3",
  xl: "w-4 h-4",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumAvatarProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Image source URL. When absent, fallback initials are shown. */
  src?: string;
  /** Alt text for the image. @default "" */
  alt?: string;
  /** Size preset. @default "md" */
  size?: AvatarSize;
  /** Fallback initials shown when no image is available. */
  fallback?: string;
  /** Border style. @default "none" */
  border?: AvatarBorder;
  /** Show loading skeleton with shimmer. @default false */
  loading?: boolean;
  /** Show online indicator dot (bottom-right). @default false */
  online?: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumAvatarProps,
  "alt" | "size" | "border" | "loading" | "online"
>> = {
  alt: "",
  size: "md",
  border: "none",
  loading: false,
  online: false,
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumAvatar — user avatar with image, fallback initials, online indicator,
 * border variants, and loading skeleton.
 *
 * @example
 * ```tsx
 * <PremiumAvatar src="/avatar.jpg" alt="Jane" size="lg" online border="accent" />
 * <PremiumAvatar fallback="JD" size="sm" border="default" />
 * <PremiumAvatar loading size="md" />
 * ```
 *
 * Design tokens used:
 * - Colors: --color-primary, --color-on-primary, --tier-2, --hairline,
 *   --color-success (online dot)
 * - Radius: --radius-full (circle)
 * - Spacing: --space-* for sizing
 * - Motion: --dur-fast, --ease-standard
 */
const PremiumAvatar: Component<PremiumAvatarProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "src", "alt", "size", "fallback", "border", "loading", "online",
    "class", "style",
  ]);

  /** Extract up to 2 characters for fallback initials. */
  const initials = (): string => {
    if (!local.fallback) return "?";
    return local.fallback.slice(0, 2).toUpperCase();
  };

  const containerClass = (): string => {
    const classes = [
      "relative inline-flex items-center justify-center",
      "rounded-full overflow-hidden",
      "shrink-0",
      sizeMap[local.size],
      borderMap[local.border],
      "transition-all duration-fast ease-standard",
    ];

    if (local.class) classes.push(local.class);

    return classes.filter(Boolean).join(" ");
  };

  return (
    <div
      {...rest}
      class={containerClass()}
      style={local.style}
      role="img"
      aria-label={local.alt || `Avatar${local.fallback ? ` ${local.fallback}` : ""}`}
    >
      {/* Loading skeleton */}
      <Show when={local.loading}>
        <div
          class="absolute inset-0 rounded-full bg-tier-2"
          style={{
            background: "linear-gradient(90deg, var(--tier-2), var(--tier-3), var(--tier-2))",
            "background-size": "200% 100%",
            animation: "shimmer 1.8s ease-in-out infinite",
          }}
          aria-hidden="true"
        />
      </Show>

      {/* Image */}
      <Show when={local.src && !local.loading}>
        <img
          src={local.src}
          alt={local.alt}
          class="w-full h-full object-cover rounded-full"
          draggable="false"
        />
      </Show>

      {/* Fallback initials */}
      <Show when={!local.src && !local.loading}>
        <span
          class={`inline-flex items-center justify-center w-full h-full rounded-full bg-primary text-on-primary font-label font-semibold ${fontSizeMap[local.size]} select-none`}
          aria-hidden="true"
        >
          {initials()}
        </span>
      </Show>

      {/* Online indicator dot */}
      <Show when={local.online && !local.loading}>
        <span
          class={`absolute bottom-0 right-0 rounded-full bg-success border-2 border-tier-0 ${onlineDotSize[local.size]}`}
          aria-label="Online"
          role="status"
        />
      </Show>
    </div>
  );
};

export { PremiumAvatar };
export default PremiumAvatar;
