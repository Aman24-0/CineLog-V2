// src/shared/ui/states/ErrorState.tsx
//
// Scoped error state — the primary error display component for CineLog.
// Use this when an API request or data source fails. Errors should be
// scoped to the failed feature, never destroying the entire page.
//
// Design: Uses CineLog's glass design language (icon in glass circle,
// title, message, optional retry). Responsive and mobile-first.
//
// Accessibility: role="alert", aria-live="assertive" so screen readers
// announce the error. Retry button has aria-label.

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

export interface ErrorStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Material Symbols icon name. Default "error" */
  icon?: string;
  /** Error title. Default "Something went wrong" */
  title?: string;
  /** Error description — explain what failed and what the user can do */
  message?: string;
  /** Show retry button. Default true */
  retryable?: boolean;
  /** Retry button label. Default "Retry" */
  retryLabel?: string;
  /** Called when retry is clicked */
  onRetry?: () => void;
  /** Variant: "section" for inline section errors, "page" for full-page */
  variant?: "section" | "page";
}

const defaultProps: Required<
  Pick<ErrorStateProps, "icon" | "title" | "retryable" | "retryLabel" | "variant">
> = {
  icon: "error",
  title: "Something went wrong",
  retryable: true,
  retryLabel: "Retry",
  variant: "section"
};

const ErrorState: Component<ErrorStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "icon", "title", "message", "retryable", "retryLabel", "onRetry", "variant", "class"
  ]);

  const containerClasses = () => {
    const base = [
      "flex flex-col items-center justify-center text-center w-full",
      local.variant === "page" ? "min-h-[50vh] gap-5 p-12" : "gap-3 p-6"
    ];
    if (local.class) base.push(local.class);
    return base.join(" ");
  };

  const iconSize = () => local.variant === "page" ? "w-16 h-16" : "w-12 h-12";
  const iconFontSize = () => local.variant === "page" ? "text-3xl" : "text-2xl";
  const titleSize = () => local.variant === "page" ? "text-lg" : "text-base";
  const messageSize = () => local.variant === "page" ? "text-sm" : "text-xs";

  return (
    <div
      {...rest}
      class={containerClasses()}
      role="alert"
      aria-live="assertive"
    >
      <div
        class={`flex flex-shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-red-400 backdrop-blur-md ${iconSize()}`}
        style={{ "box-shadow": "0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(248,113,113,0.10)" }}
        aria-hidden="true"
      >
        <span
          class={`material-symbols-outlined ${iconFontSize()}`}
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        >
          {local.icon}
        </span>
      </div>
      <div class="flex max-w-[400px] flex-col items-center gap-1">
        <h3 class={`font-heading font-bold leading-tight text-text-strong ${titleSize()}`}>
          {local.title}
        </h3>
        <Show when={local.message}>
          <p class={`font-body leading-relaxed text-text-soft ${messageSize()}`}>
            {local.message}
          </p>
        </Show>
      </div>
      <Show when={local.retryable && local.onRetry}>
        <button
          type="button"
          class="btn-primary focus-ring mt-1 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-transform active:scale-95"
          onClick={() => local.onRetry?.()}
          aria-label={local.retryLabel}
        >
          <span
            class="material-symbols-outlined text-base"
            style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            aria-hidden="true"
          >
            refresh
          </span>
          {local.retryLabel}
        </button>
      </Show>
    </div>
  );
};

export { ErrorState };
export default ErrorState;
