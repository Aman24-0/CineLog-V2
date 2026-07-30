// src/shared/ui/glass/GlassInput.tsx
import { Component, JSX, splitProps, mergeProps, Show } from "solid-js";

export interface GlassInputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  /** Left icon name (Material Symbols) */
  icon?: string;
  /** Label text, rendered as a small eyebrow above the input */
  label?: string;
  /** Right icon/action (e.g. clear button) */
  rightContent?: JSX.Element;
  /** Size variant */
  size?: "default" | "large";
}

const defaultProps: Required<Pick<GlassInputProps, "size">> = {
  size: "default"
};

/**
 * GlassInput — a standardized input field with glass styling.
 */
const GlassInput: Component<GlassInputProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "icon",
    "label",
    "rightContent",
    "size",
    "class"
  ]);

  return (
    <div class={`flex w-full flex-col gap-1.5 ${local.class || ""}`}>
      <Show when={local.label}>
        <label class="px-1 font-label text-xs font-semibold uppercase tracking-wide text-text-soft">
          {local.label}
        </label>
      </Show>
      <div class="group relative flex w-full items-center">
        <Show when={local.icon}>
          <span
            class="material-symbols-outlined pointer-events-none absolute left-3 text-text-muted transition-colors duration-base group-focus-within:text-primary"
            aria-hidden="true"
            style={{ "font-size": local.size === "large" ? "24px" : "20px" }}
          >
            {local.icon}
          </span>
        </Show>
        <input
          {...rest}
          class={[
            "w-full rounded-lg border border-glass-border bg-glass text-text-strong backdrop-blur-xl",
            "transition-all duration-base ease-standard placeholder:text-text-muted",
            "focus:border-primary focus:bg-glass-strong focus:shadow-glow focus:outline-none",
            local.size === "large"
              ? "h-14 px-4 text-lg"
              : "h-11 px-3 text-base",
            local.icon ? (local.size === "large" ? "pl-11" : "pl-10") : "",
            // Right padding: when rightContent is present, add extra padding
            // so typed text never slides underneath the absolute-positioned
            // clear/filter button. pr-10 is the base; pr-16 gives room for
            // wider buttons (e.g. the "Clear" pill in VaultSearch).
            local.rightContent ? "pr-16" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            "box-shadow":
              "0 2px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(232,183,74,0.04)"
          }}
        />
        <Show when={local.rightContent}>
          <div class="absolute right-2 flex items-center justify-center">
            {local.rightContent}
          </div>
        </Show>
      </div>
    </div>
  );
};

export { GlassInput };
export default GlassInput;
