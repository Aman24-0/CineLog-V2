// src/shared/ui/states/RateLimitState.tsx
//
// 429 Rate Limited state — user or provider has hit rate limits.
// Shows countdown if retry-after is available, prevents aggressive retry loops.

import { Component, JSX, Show, createSignal, createEffect, onCleanup, splitProps, mergeProps } from "solid-js";

export interface RateLimitStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Retry-after seconds from the 429 response header */
  retryAfter?: number;
  /** Called when retry is allowed */
  onRetry?: () => void;
}

const defaultProps: Required<Pick<RateLimitStateProps, "retryAfter">> = {
  retryAfter: 0
};

const RateLimitState: Component<RateLimitStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, ["retryAfter", "onRetry", "class"]);

  const [countdown, setCountdown] = createSignal(0);
  const [canRetry, setCanRetry] = createSignal(false);

  createEffect(() => {
    const seconds = local.retryAfter;
    if (seconds <= 0) {
      setCanRetry(true);
      setCountdown(0);
      return;
    }

    setCanRetry(false);
    setCountdown(seconds);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanRetry(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    onCleanup(() => clearInterval(interval));
  });

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
        class="flex flex-shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-amber-400 backdrop-blur-md w-12 h-12"
        style={{ "box-shadow": "0 4px 16px rgba(0,0,0,0.35)" }}
        aria-hidden="true"
      >
        <span
          class="material-symbols-outlined text-2xl"
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        >
          timer
        </span>
      </div>
      <div class="flex max-w-[400px] flex-col items-center gap-1">
        <h3 class="font-heading font-bold leading-tight text-text-strong text-base">
          Too many requests
        </h3>
        <p class="font-body leading-relaxed text-text-soft text-xs">
          <Show
            when={countdown() > 0}
            fallback="Please wait a moment before trying again."
          >
            Please wait {countdown()}s before trying again.
          </Show>
        </p>
      </div>
      <Show when={canRetry() && local.onRetry}>
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

export { RateLimitState };
export default RateLimitState;
