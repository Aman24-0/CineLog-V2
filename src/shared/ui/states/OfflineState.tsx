// src/shared/ui/states/OfflineState.tsx
//
// Offline/network unavailable state. Shown when the browser is offline
// or the API server is unreachable. If cached data is available,
// shows a subtle banner instead of a full error panel.

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

export interface OfflineStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Whether cached/stale data is still visible */
  hasCachedData?: boolean;
  /** Called when retry is clicked */
  onRetry?: () => void;
  /** Variant: "section" for inline, "page" for full-page, "banner" for subtle */
  variant?: "section" | "page" | "banner";
}

const defaultProps: Required<Pick<OfflineStateProps, "hasCachedData" | "variant">> = {
  hasCachedData: false,
  variant: "section"
};

const OfflineState: Component<OfflineStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "hasCachedData", "onRetry", "variant", "class"
  ]);

  // Banner variant: subtle top-of-section indicator when cached data exists
  return (
    <Show
      when={local.variant === "banner" || local.hasCachedData}
      fallback={
        // Full offline display (no cached data)
        <div
          {...rest}
          class={[
            "flex flex-col items-center justify-center text-center w-full",
            local.variant === "page" ? "min-h-[50vh] gap-5 p-12" : "gap-3 p-6",
            local.class || ""
          ].join(" ")}
          role="alert"
          aria-live="assertive"
        >
          <div
            class="flex flex-shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-text-muted backdrop-blur-md w-12 h-12"
            style={{ "box-shadow": "0 4px 16px rgba(0,0,0,0.35)" }}
            aria-hidden="true"
          >
            <span
              class="material-symbols-outlined text-2xl"
              style={{ "font-variation-settings": "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
            >
              cloud_off
            </span>
          </div>
          <div class="flex max-w-[400px] flex-col items-center gap-1">
            <h3 class="font-heading font-bold leading-tight text-text-strong text-base">
              You're offline
            </h3>
            <p class="font-body leading-relaxed text-text-soft text-xs">
              Some features may be unavailable. Check your connection and try again.
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
      }
    >
      {/* Banner: subtle indicator when cached data is visible */}
      <div
        {...rest}
        class={[
          "flex items-center gap-2 rounded-lg border border-glass-border bg-glass px-4 py-2 backdrop-blur-md",
          local.class || ""
        ].join(" ")}
        role="status"
        aria-live="polite"
      >
        <span
          class="material-symbols-outlined text-sm text-text-muted"
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
          aria-hidden="true"
        >
          cloud_off
        </span>
        <span class="font-body text-xs text-text-soft">
          {local.hasCachedData
            ? "Showing saved data — you're currently offline."
            : "You're offline. Some features may be unavailable."}
        </span>
        <Show when={local.onRetry}>
          <button
            type="button"
            class="ml-auto text-xs font-semibold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60"
            onClick={() => local.onRetry?.()}
            aria-label="Retry connection"
          >
            Retry
          </button>
        </Show>
      </div>
    </Show>
  );
};

export { OfflineState };
export default OfflineState;
