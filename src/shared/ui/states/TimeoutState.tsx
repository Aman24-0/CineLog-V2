// src/shared/ui/states/TimeoutState.tsx
//
// Timeout state — shown when a request takes too long to respond.
// Distinct from generic errors: the problem is latency, not failure.
// Allows retry without implying the server is down.

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

export interface TimeoutStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** What operation timed out, e.g. "Loading recommendations" */
  label?: string;
  /** Additional context message */
  message?: string;
  /** Called when retry is clicked */
  onRetry?: () => void;
  /** Variant: "section" or "page" */
  variant?: "section" | "page";
}

const defaultProps: Required<
  Pick<TimeoutStateProps, "label" | "message" | "variant">
> = {
  label: "This is taking longer than expected",
  message: "The server hasn't responded yet. You can wait or try again.",
  variant: "section"
};

const TimeoutState: Component<TimeoutStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "label", "message", "onRetry", "variant", "class"
  ]);

  const containerClasses = () => {
    const base = [
      "flex flex-col items-center justify-center text-center w-full",
      local.variant === "page" ? "min-h-[50vh] gap-5 p-12" : "gap-3 p-6"
    ];
    if (local.class) base.push(local.class);
    return base.join(" ");
  };

  return (
    <div
      {...rest}
      class={containerClasses()}
      role="status"
      aria-live="polite"
    >
      <div
        class="flex flex-shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-amber-400 backdrop-blur-md w-12 h-12"
        style={{ "box-shadow": "0 4px 16px rgba(0,0,0,0.35)" }}
        aria-hidden="true"
      >
        <span
          class="material-symbols-outlined text-2xl"
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        >
          hourglass_empty
        </span>
      </div>
      <div class="flex max-w-[400px] flex-col items-center gap-1">
        <h3 class="font-heading font-bold leading-tight text-text-strong text-base">
          {local.label}
        </h3>
        <Show when={local.message}>
          <p class="font-body leading-relaxed text-text-soft text-xs">
            {local.message}
          </p>
        </Show>
      </div>
      <Show when={local.onRetry}>
        <button
          type="button"
          class="btn-primary focus-ring mt-1 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-transform active:scale-95"
          onClick={() => local.onRetry?.()}
          aria-label="Retry"
        >
          <span
            class="material-symbols-outlined text-base"
            style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            aria-hidden="true"
          >
            refresh
          </span>
          Retry
        </button>
      </Show>
    </div>
  );
};

export { TimeoutState };
export default TimeoutState;
