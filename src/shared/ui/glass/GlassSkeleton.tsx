// src/shared/ui/glass/GlassSkeleton.tsx
import { Component, JSX, Show, For, splitProps, mergeProps } from "solid-js";

// ─── Variant Types ─────────────────────────────────────────────

/** Skeleton shape variant */
type SkeletonVariant = "block" | "text" | "circle" | "card" | "avatar" | "poster";

// ─── Token Maps ────────────────────────────────────────────────

const avatarSizeMap: Record<string, { w: string; h: string }> = {
  sm: { w: "w-8", h: "h-8" },
  md: { w: "w-12", h: "h-12" },
  lg: { w: "w-16", h: "h-16" },
  xl: { w: "w-20", h: "h-20" },
};

// ─── Props ─────────────────────────────────────────────────────

export interface GlassSkeletonProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Shape variant. @default "block" */
  variant?: SkeletonVariant;
  /** Width override (Tailwind class or CSS value). */
  width?: string;
  /** Height override (Tailwind class or CSS value). */
  height?: string;
  /** Border radius override (Tailwind class). */
  radius?: string;
  /** Number of text lines for the "text" variant. @default 3 */
  lines?: number;
  /** Enable shimmer animation. @default true */
  animated?: boolean;
}

// ─── Defaults ──────────────────────────────────────────────────

const defaultProps: Required<
  Pick<GlassSkeletonProps, "variant" | "lines" | "animated">
> = {
  variant: "block",
  lines: 3,
  animated: true,
};

// ─── Component ─────────────────────────────────────────────────

/**
 * GlassSkeleton — a unified loading skeleton component.
 * Replaces PremiumSkeleton, designed to fit into glass UI layouts seamlessly.
 */
const GlassSkeleton: Component<GlassSkeletonProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "variant", "width", "height", "radius", "lines", "animated", "class", "style",
  ]);

  /** Helper to determine if a value is a Tailwind class or custom CSS length */
  const isTailwindClass = (val?: string) => {
    if (!val) return false;
    return /^[w|h]-/.test(val) || /^max-[w|h]-/.test(val) || val === "full" || val.includes("%");
  };

  /** Helper to build width classes and inline styles */
  const resolveWidth = (defaultClass: string) => {
    if (!local.width) return { class: defaultClass, style: {} };
    if (isTailwindClass(local.width)) return { class: local.width, style: {} };
    return { class: "", style: { width: local.width } };
  };

  /** Helper to build height classes and inline styles */
  const resolveHeight = (defaultClass: string) => {
    if (!local.height) return { class: defaultClass, style: {} };
    if (isTailwindClass(local.height)) return { class: local.height, style: {} };
    return { class: "", style: { height: local.height } };
  };

  /** Helper to resolve border radius */
  const resolveRadius = (defaultClass: string) => {
    return local.radius ? `rounded-${local.radius}` : defaultClass;
  };

  /** Base classes shared by all skeleton shapes */
  const baseClasses = () => [
    "bg-tier-3",
    local.animated ? "relative overflow-hidden" : "",
  ].filter(Boolean).join(" ");

  /** Shimmer animation overlay */
  const Shimmer = () => (
    <Show when={local.animated}>
      <div
        class="absolute inset-0 z-overlay"
        style={{
          background: "linear-gradient(90deg, transparent, var(--tier-4), transparent)",
          "background-size": "200% 100%",
          animation: "shimmer 1.8s ease-in-out infinite",
        }}
        aria-hidden="true"
      />
    </Show>
  );

  return (
    <Show
      when={local.variant === "text"}
      fallback={
        <Show
          when={local.variant === "avatar"}
          fallback={
            <Show
              when={local.variant === "poster"}
              fallback={
                <Show
                  when={local.variant === "card"}
                  fallback={
                    <Show
                      when={local.variant === "circle"}
                      fallback={
                        <div
                          {...rest}
                          class={`${baseClasses()} ${resolveRadius("rounded-md")} ${resolveWidth("w-full").class} ${resolveHeight("h-32").class} ${local.class || ""}`}
                          style={{ ...resolveWidth("w-full").style, ...resolveHeight("h-32").style, ...(local.style as Record<string, string>) }}
                          aria-hidden="true"
                        >
                          <Shimmer />
                        </div>
                      }
                    >
                      <div
                        {...rest}
                        class={`${baseClasses()} rounded-full ${resolveWidth("w-12").class} ${resolveHeight("h-12").class} ${local.class || ""}`}
                        style={{ ...resolveWidth("w-12").style, ...resolveHeight("h-12").style, ...(local.style as Record<string, string>) }}
                        aria-hidden="true"
                      >
                        <Shimmer />
                      </div>
                    </Show>
                  }
                >
                  <div
                    {...rest}
                    class={`${baseClasses()} ${resolveRadius("rounded-lg")} ${resolveWidth("w-full").class} ${resolveHeight("h-48").class} ${local.class || ""}`}
                    style={{ ...resolveWidth("w-full").style, ...resolveHeight("h-48").style, ...(local.style as Record<string, string>) }}
                    aria-hidden="true"
                  >
                    <Shimmer />
                  </div>
                </Show>
              }
            >
              <div
                {...rest}
                class={`${baseClasses()} ${resolveRadius("rounded-md")} ${resolveWidth("w-full").class} ${local.height ? resolveHeight("").class : "aspect-[2/3]"} ${local.class || ""}`}
                style={{ ...resolveWidth("w-full").style, ...(local.height ? resolveHeight("").style : {}), ...(local.style as Record<string, string>) }}
                aria-hidden="true"
              >
                <Shimmer />
              </div>
            </Show>
          }
        >
          <div
            {...rest}
            class={`${baseClasses()} rounded-full ${(local.width && avatarSizeMap[local.width] ? avatarSizeMap[local.width] : avatarSizeMap.md).w} ${(local.width && avatarSizeMap[local.width] ? avatarSizeMap[local.width] : avatarSizeMap.md).h} ${local.class || ""}`}
            style={local.style}
            aria-hidden="true"
          >
            <Shimmer />
          </div>
        </Show>
      }
    >
      <div {...rest} class={`flex flex-col gap-2 ${local.class || ""}`} style={local.style} aria-hidden="true">
        <For each={Array.from({ length: local.lines })}>
          {(_, i) => {
            const w = i === local.lines - 1 && local.lines > 1 ? "w-2/3" : "w-full";
            const wProps = resolveWidth(w);
            const hProps = resolveHeight("h-4");
            return (
              <div
                class={`${baseClasses()} ${resolveRadius("rounded-sm")} ${wProps.class} ${hProps.class}`}
                style={{ ...wProps.style, ...hProps.style }}
              >
                <Shimmer />
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
};

export { GlassSkeleton };
export default GlassSkeleton;
