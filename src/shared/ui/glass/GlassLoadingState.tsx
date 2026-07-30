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

const defaultProps: Required<
  Pick<GlassLoadingStateProps, "size" | "fullHeight">
> = {
  size: "default",
  fullHeight: false
};

const spinnerSizeMap = {
  small: { w: "w-5", h: "h-5", border: "border-2" },
  default: { w: "w-8", h: "h-8", border: "border-[3px]" },
  large: { w: "w-12", h: "h-12", border: "border-4" }
};

/**
 * GlassLoadingState — a centered, smooth loading indicator designed
 * for inline or full-section loading states.
 */
const GlassLoadingState: Component<GlassLoadingStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "message",
    "size",
    "fullHeight",
    "class"
  ]);

  const spinnerTokens = () => spinnerSizeMap[local.size];

  return (
    <div
      {...rest}
      class={[
        "flex w-full flex-col items-center justify-center gap-4 text-center",
        local.fullHeight ? "min-h-[50vh] flex-1" : "py-12",
        local.class || ""
      ]
        .filter(Boolean)
        .join(" ")}
      // Announce loading state to assistive technology:
      //   - role="status" + aria-live="polite" → polite SR announcement
      //   - aria-busy="true" → marks the region as currently loading
      //   - aria-label → human-readable description (defaults to
      //     "Loading" when no message prop is provided)
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={local.message || "Loading"}
    >
      <div class="relative flex items-center justify-center">
        {/* Ambient glow behind spinner */}
        <div
          class={`bg-primary/20 absolute inset-0 scale-150 animate-pulse rounded-full blur-xl`}
          aria-hidden="true"
        />

        {/* Spinner ring */}
        <span
          class={`relative inline-block animate-spin rounded-full border-current border-t-transparent text-primary ${spinnerTokens().w} ${spinnerTokens().h} ${spinnerTokens().border}`}
          aria-hidden="true"
        />
      </div>

      <Show when={local.message}>
        <p class="animate-pulse font-label text-xs uppercase tracking-widest text-text-muted">
          {local.message}
        </p>
      </Show>
    </div>
  );
};

export { GlassLoadingState };
export default GlassLoadingState;
