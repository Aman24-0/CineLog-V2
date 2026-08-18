// src/shared/ui/states/ServerErrorState.tsx
//
// 5xx Server Error state — backend is having issues.
// User-friendly message. Never exposes stack traces, API keys,
// or internal paths. Admins should check server logs.

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

export interface ServerErrorStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** HTTP status code (500/502/503/504) */
  status?: number;
  /** Custom message */
  message?: string;
  /** Called when retry is clicked */
  onRetry?: () => void;
}

const defaultProps: Required<Pick<ServerErrorStateProps, "status" | "message">> = {
  status: 500,
  message: "The server is having trouble right now. Try again in a moment."
};

const ServerErrorState: Component<ServerErrorStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, ["status", "message", "onRetry", "class"]);

  const isMaintenance = () => local.status === 503;

  return (
    <div
      {...rest}
      class={[
        "flex flex-col items-center justify-center gap-3 p-6 text-center w-full",
        local.class || ""
      ].join(" ")}
      role="alert"
      aria-live="assertive"
    >
      <div
        class="flex flex-shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-red-400 backdrop-blur-md w-12 h-12"
        style={{ "box-shadow": "0 4px 16px rgba(0,0,0,0.35)" }}
        aria-hidden="true"
      >
        <span
          class="material-symbols-outlined text-2xl"
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        >
          {isMaintenance() ? "build" : "dns"}
        </span>
      </div>
      <div class="flex max-w-[400px] flex-col items-center gap-1">
        <h3 class="font-heading font-bold leading-tight text-text-strong text-base">
          {isMaintenance() ? "Under maintenance" : "Server error"}
        </h3>
        <p class="font-body leading-relaxed text-text-soft text-xs">
          {local.message}
        </p>
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

export { ServerErrorState };
export default ServerErrorState;
