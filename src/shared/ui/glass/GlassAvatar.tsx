// src/shared/ui/glass/GlassAvatar.tsx
import {
  Component,
  JSX,
  Show,
  splitProps,
  mergeProps,
  createSignal
} from "solid-js";

// ─── Size Types ────────────────────────────────────────────────

type AvatarSize = "sm" | "md" | "lg" | "xl" | "hero";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-12 h-12 text-sm",
  lg: "w-16 h-16 text-lg",
  xl: "w-24 h-24 text-2xl",
  hero: "w-32 h-32 text-4xl"
};

// ─── Props ─────────────────────────────────────────────────────

export interface GlassAvatarProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** The user's avatar image URL. */
  src?: string | null;
  /** The user's name or username (used for fallback initials and alt text). */
  name?: string;
  /** Size preset. @default "md" */
  size?: AvatarSize;
  /** Whether to show an interactive hover state. @default false */
  interactive?: boolean;
  /** Whether the avatar is currently loading. @default false */
  loading?: boolean;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<GlassAvatarProps, "size" | "interactive" | "loading">
> = {
  size: "md",
  interactive: false,
  loading: false
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassAvatar — a standardized avatar component with glass styling options.
 */
const GlassAvatar: Component<GlassAvatarProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "src",
    "name",
    "size",
    "interactive",
    "loading",
    "class",
    "style"
  ]);

  const [imgError, setImgError] = createSignal(false);

  const getInitials = () => {
    if (!local.name) return "?";
    return local.name.charAt(0).toUpperCase();
  };

  const containerClasses = () => {
    const base = [
      "relative rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden",
      "bg-glass backdrop-blur-md border border-glass-border shadow-md",
      sizeClasses[local.size]
    ];

    if (local.interactive && !local.loading) {
      base.push(
        "cursor-pointer focus-ring transition-transform hover:scale-105 active:scale-95"
      );
    }

    if (local.loading) {
      base.push("animate-pulse bg-glass-strong");
    }

    if (local.class) base.push(local.class);

    return base.join(" ");
  };

  return (
    <div
      {...rest}
      class={containerClasses()}
      style={local.style}
      aria-label={local.name || "Avatar"}
    >
      <Show when={!local.loading}>
        <Show
          when={local.src && !imgError()}
          fallback={
            <span class="select-none font-display font-bold text-text-strong">
              {getInitials()}
            </span>
          }
        >
          <img
            src={local.src!}
            alt={local.name || "User avatar"}
            class="h-full w-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        </Show>
      </Show>
    </div>
  );
};

export { GlassAvatar };
export default GlassAvatar;
