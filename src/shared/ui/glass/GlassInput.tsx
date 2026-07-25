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
  size: "default",
};

/**
 * GlassInput — a standardized input field with glass styling.
 */
const GlassInput: Component<GlassInputProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, ["icon", "label", "rightContent", "size", "class"]);

  return (
    <div class={`flex flex-col gap-1.5 w-full ${local.class || ""}`}>
      <Show when={local.label}>
        <label class="text-xs font-label font-semibold tracking-wide uppercase text-text-soft px-1">
          {local.label}
        </label>
      </Show>
      <div class="relative w-full flex items-center group">
        <Show when={local.icon}>
          <span
            class="material-symbols-outlined absolute left-3 text-text-muted transition-colors duration-base group-focus-within:text-primary pointer-events-none"
            aria-hidden="true"
            style={{ "font-size": local.size === "large" ? "24px" : "20px" }}
          >
            {local.icon}
          </span>
        </Show>
        <input
          {...rest}
          class={[
            "w-full bg-glass backdrop-blur-lg border border-glass-border rounded-lg text-text-strong",
            "transition-all duration-base ease-standard placeholder:text-text-muted focus:outline-none focus:border-primary focus:bg-glass-strong focus:shadow-glow",
            local.size === "large" ? "h-14 text-lg px-4" : "h-11 text-base px-3",
            local.icon ? (local.size === "large" ? "pl-11" : "pl-10") : "",
            local.rightContent ? "pr-10" : "",
          ].filter(Boolean).join(" ")}
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
