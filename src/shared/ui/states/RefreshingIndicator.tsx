// src/shared/ui/states/RefreshingIndicator.tsx
//
// Subtle refreshing indicator — used when data is being refreshed
// but existing content remains visible. NEVER replaces content
// with a full-page loader during refresh.
//
// Design: Minimal, unobtrusive. Can be a top-edge progress bar,
// a small spinner, or a text label depending on placement.

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

export interface RefreshingIndicatorProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Text to show. Default "Updating…" */
  message?: string;
  /** Placement: "top" = slim top-edge bar, "inline" = small spinner + text, "corner" = corner spinner */
  placement?: "top" | "inline" | "corner";
}

const defaultProps: Required<
  Pick<RefreshingIndicatorProps, "message" | "placement">
> = {
  message: "Updating\u2026",
  placement: "inline"
};

const RefreshingIndicator: Component<RefreshingIndicatorProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, ["message", "placement", "class"]);

  return (
    <Show
      when={local.placement === "top"}
      fallback={
        <Show
          when={local.placement === "corner"}
          fallback={
            // Inline: small spinner + text
            <div
              {...rest}
              class={[
                "inline-flex items-center gap-1.5 font-body text-xs text-text-muted",
                local.class || ""
              ].join(" ")}
              role="status"
              aria-live="polite"
            >
              <span
                class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              {local.message}
            </div>
          }
        >
          {/* Corner: small fixed spinner in top-right */}
          <div
            {...rest}
            class={[
              "fixed right-4 top-16 z-50 flex items-center gap-1.5 rounded-full border border-glass-border bg-glass/80 px-3 py-1.5 backdrop-blur-md",
              local.class || ""
            ].join(" ")}
            role="status"
            aria-live="polite"
          >
            <span
              class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
              aria-hidden="true"
            />
            <span class="font-body text-[10px] text-text-muted">{local.message}</span>
          </div>
        </Show>
      }
    >
      {/* Top: slim progress bar at the top of the container */}
      <div
        {...rest}
        class={[
          "relative w-full overflow-hidden",
          local.class || ""
        ].join(" ")}
        role="status"
        aria-live="polite"
      >
        <div
          class="absolute left-0 top-0 h-0.5 w-full animate-pulse bg-primary/60"
          style={{
            background: "linear-gradient(90deg, transparent, var(--p), transparent)",
            "background-size": "200% 100%",
            animation: "shimmer 1.5s ease-in-out infinite"
          }}
          aria-hidden="true"
        />
        <span class="sr-only">{local.message}</span>
      </div>
    </Show>
  );
};

export { RefreshingIndicator };
export default RefreshingIndicator;
