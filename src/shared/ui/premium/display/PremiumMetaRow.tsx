// src/shared/ui/premium/display/PremiumMetaRow.tsx
import { Component, JSX, For, Show, splitProps, mergeProps } from "solid-js";

// ─── Types ────────────────────────────────────────────────────

/** A single metadata item. */
interface MetaItem {
  /** Item label text. */
  label?: string;
  /** Item value text. */
  value: string;
  /** Material Symbol icon name. */
  icon?: string;
  /** Optional text color token class override (e.g. "text-success"). */
  color?: string;
}

/** Separator between items. */
type MetaSeparator = "dot" | "pipe" | "dash" | "none";

/** Spacing density. */
type MetaSpacing = "compact" | "default";

/** Vertical alignment. */
type MetaAlign = "start" | "center";

// ─── Token Maps ───────────────────────────────────────────────

const separatorMap: Record<MetaSeparator, string> = {
  dot: "·",
  pipe: "|",
  dash: "—",
  none: "",
};

const spacingGapMap: Record<MetaSpacing, string> = {
  compact: "gap-1",
  default: "gap-2",
};

const spacingTextMap: Record<MetaSpacing, string> = {
  compact: "text-2xs",
  default: "text-xs",
};

const spacingIconMap: Record<MetaSpacing, string> = {
  compact: "text-2xs",
  default: "text-xs",
};

const alignMap: Record<MetaAlign, string> = {
  start: "items-start",
  center: "items-center",
};

// ─── Props ────────────────────────────────────────────────────

export interface PremiumMetaRowProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Array of metadata items. */
  items: MetaItem[];
  /** Separator character between items. @default "dot" */
  separator?: MetaSeparator;
  /** Spacing density. @default "default" */
  spacing?: MetaSpacing;
  /** Whether items should wrap to next line on overflow. @default false */
  wrap?: boolean;
  /** Vertical alignment of items. @default "center" */
  align?: MetaAlign;
}

// ─── Defaults ─────────────────────────────────────────────────

const defaultProps: Required<Pick<PremiumMetaRowProps,
  "separator" | "spacing" | "wrap" | "align"
>> = {
  separator: "dot",
  spacing: "default",
  wrap: false,
  align: "center",
};

// ─── Component ────────────────────────────────────────────────

/**
 * PremiumMetaRow — horizontal metadata row rendering items in a flex row
 * with configurable separators, spacing, and wrapping.
 *
 * @example
 * ```tsx
 * <PremiumMetaRow
 *   items={[
 *     { value: "2024", icon: "calendar_today" },
 *     { value: "Movie", icon: "movie" },
 *     { value: "2h 15m", icon: "schedule" },
 *   ]}
 *   separator="dot"
 *   spacing="compact"
 *   wrap
 * />
 * ```
 *
 * Design tokens used:
 * - Colors: --color-text-muted, --color-text-dim, --color-text-soft
 * - Typography: --font-family-body
 * - Spacing: --space-1 through --space-2
 */
const PremiumMetaRow: Component<PremiumMetaRowProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "items", "separator", "spacing", "wrap", "align",
    "class", "style",
  ]);

  const containerClass = (): string => {
    const classes = [
      "inline-flex",
      alignMap[local.align],
      spacingGapMap[local.spacing],
      "font-body text-muted",
      spacingTextMap[local.spacing],
    ];

    if (local.wrap) {
      classes.push("flex-wrap");
    } else {
      classes.push("flex-nowrap");
    }

    if (local.class) classes.push(local.class);

    return classes.filter(Boolean).join(" ");
  };

  const separatorChar = (): string => separatorMap[local.separator];

  return (
    <div
      {...rest}
      class={containerClass()}
      style={local.style}
      role="group"
      aria-label="Metadata row"
    >
      <For each={local.items}>
        {(item, index) => (
          <>
            {/* Separator */}
            <Show when={index() > 0 && local.separator !== "none"}>
              <span class="text-dim select-none" aria-hidden="true">
                {separatorChar()}
              </span>
            </Show>

            {/* Item */}
            <span class="inline-flex items-center gap-0.5">
              <Show when={item.icon}>
                <span
                  class={`material-symbols-outlined ${spacingIconMap[local.spacing]}`}
                  style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
              </Show>

              <Show when={item.label} fallback={
                <span class={item.color ?? "text-soft"}>{item.value}</span>
              }>
                <span class="text-dim">{item.label}: </span>
                <span class={item.color ?? "text-soft"}>{item.value}</span>
              </Show>
            </span>
          </>
        )}
      </For>
    </div>
  );
};

export { PremiumMetaRow };
export default PremiumMetaRow;
export type { MetaItem, MetaSeparator, MetaSpacing, MetaAlign };
