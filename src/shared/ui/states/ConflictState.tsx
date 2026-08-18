// src/shared/ui/states/ConflictState.tsx
//
// Conflict state — shown when an item was modified elsewhere (e.g., by
// another user, another tab, or a server-side process) and the local
// data is stale. The user should refresh to see the latest version.
//
// Design: Uses CineLog's glass design language (sync_problem icon in
// glass circle, title, message, refresh button). Responsive and mobile-first.
//
// Accessibility: role="alert", aria-live="assertive" so screen readers
// announce the conflict. Refresh button has aria-label.

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

export interface ConflictStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Conflict description. Default explains the situation and suggests refreshing. */
  message?: string;
  /** Called when the user clicks "Refresh" */
  onRefresh?: () => void;
  /** Refresh button label. Default "Refresh" */
  refreshLabel?: string;
  /** Variant: "section" for inline section conflicts, "page" for full-page */
  variant?: "section" | "page";
}

const defaultProps: Required<
  Pick<ConflictStateProps, "message" | "refreshLabel" | "variant">
> = {
  message: "This item was modified elsewhere. Refresh to see the latest version.",
  refreshLabel: "Refresh",
  variant: "section"
};

const ConflictState: Component<ConflictStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "message", "onRefresh", "refreshLabel", "variant", "class"
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
        class={`flex flex-shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-amber-400 backdrop-blur-md ${iconSize()}`}
        style={{ "box-shadow": "0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(251,191,36,0.10)" }}
        aria-hidden="true"
      >
        <span
          class={`material-symbols-outlined ${iconFontSize()}`}
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        >
          sync_problem
        </span>
      </div>
      <div class="flex max-w-[400px] flex-col items-center gap-1">
        <h3 class={`font-heading font-bold leading-tight text-text-strong ${titleSize()}`}>
          Content changed
        </h3>
        <Show when={local.message}>
          <p class={`font-body leading-relaxed text-text-soft ${messageSize()}`}>
            {local.message}
          </p>
        </Show>
      </div>
      <Show when={local.onRefresh}>
        <button
          type="button"
          class="btn-primary focus-ring mt-1 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-transform active:scale-95"
          onClick={() => local.onRefresh?.()}
          aria-label={local.refreshLabel}
        >
          <span
            class="material-symbols-outlined text-base"
            style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            aria-hidden="true"
          >
            refresh
          </span>
          {local.refreshLabel}
        </button>
      </Show>
    </div>
  );
};

export { ConflictState };
export default ConflictState;
