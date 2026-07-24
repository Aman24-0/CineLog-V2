// src/shared/ui/glass/GlassLoadingState.tsx
import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

export interface GlassLoadingStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Optional message to display below the spinner. */
  message?: string;
  /** Size of the spinner. @default "default" */
  size?: "small" | "default" | "large";
  /** If true, expands to fill the parent container completely. @default false */
  fullHeight?: boolean;
}

const defaultProps: Required<Pick<GlassLoadingStateProps, "size" | "fullHeight">> = {
  size: "default",
  fullHeight: false,
};

const spinnerSizeMap = {
  small: { w: "w-5", h: "h-5", border: "border-2" },
  default: { w: "w-8", h: "h-8", border: "border-[3px]" },
  large: { w: "w-12", h: "h-12", border: "border-4" },
};

/**
 * GlassLoadingState — a centered, smooth loading indicator designed
 * for inline or full-section loading states.
 */
const GlassLoadingState: Component<GlassLoadingStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, ["message", "size", "fullHeight", "class"]);

  const spinnerTokens = () => spinnerSizeMap[local.size];

  return (
    <div
      {...rest}
      class={[
        "flex flex-col items-center justify-center gap-4 w-full text-center",
        local.fullHeight ? "min-h-[50vh] flex-1" : "py-12",
        local.class || "",
      ].filter(Boolean).join(" ")}
    >
      <div class="relative flex items-center justify-center">
        {/* Ambient glow behind spinner */}
        <div class={`absolute inset-0 bg-primary/20 rounded-full blur-xl scale-150 animate-pulse`} aria-hidden="true" />

        {/* Spinner ring */}
        <span
          class={`relative animate-spin inline-block rounded-full border-current border-t-transparent text-primary ${spinnerTokens().w} ${spinnerTokens().h} ${spinnerTokens().border}`}
          aria-hidden="true"
        />
      </div>

      <Show when={local.message}>
        <p class="font-label text-xs uppercase tracking-widest text-text-muted animate-pulse">
          {local.message}
        </p>
      </Show>
    </div>
  );
};

export { GlassLoadingState };
export default GlassLoadingState;
