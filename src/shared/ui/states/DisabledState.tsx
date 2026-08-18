// src/shared/ui/states/DisabledState.tsx
//
// Feature disabled / maintenance state — when a feature flag is OFF
// or a service is intentionally disabled by admin. Shows an
// appropriate message instead of an empty section or dead buttons.

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

export interface DisabledStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Name of the disabled feature, e.g. "AI Recommendations" */
  featureName?: string;
  /** Custom message */
  message?: string;
  /** Material Symbols icon */
  icon?: string;
  /** Variant: "section" for inline, "page" for full-page */
  variant?: "section" | "page";
}

const defaultProps: Required<
  Pick<DisabledStateProps, "featureName" | "icon" | "variant">
> = {
  featureName: "This feature",
  icon: "block",
  variant: "section"
};

const DisabledState: Component<DisabledStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "featureName", "message", "icon", "variant", "class"
  ]);

  const defaultMessage = () =>
    `${local.featureName} is currently unavailable.`;

  const containerClasses = () => {
    const base = [
      "flex flex-col items-center justify-center text-center w-full",
      local.variant === "page" ? "min-h-[50vh] gap-5 p-12" : "gap-3 p-6"
    ];
    if (local.class) base.push(local.class);
    return base.join(" ");
  };

  const iconSize = () => local.variant === "page" ? "w-14 h-14" : "w-10 h-10";
  const iconFontSize = () => local.variant === "page" ? "text-2xl" : "text-xl";

  return (
    <div {...rest} class={containerClasses()} role="status" aria-live="polite">
      <div
        class={`flex flex-shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-text-muted backdrop-blur-md ${iconSize()}`}
        style={{ "box-shadow": "0 4px 16px rgba(0,0,0,0.35)" }}
        aria-hidden="true"
      >
        <span
          class={`material-symbols-outlined ${iconFontSize()}`}
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        >
          {local.icon}
        </span>
      </div>
      <div class="flex max-w-[360px] flex-col items-center gap-1">
        <h3 class={`font-heading font-bold leading-tight text-text-soft ${local.variant === "page" ? "text-base" : "text-sm"}`}>
          {local.featureName} unavailable
        </h3>
        <Show when={local.message ?? defaultMessage()}>
          <p class={`font-body leading-relaxed text-text-muted ${local.variant === "page" ? "text-xs" : "text-[11px]"}`}>
            {local.message ?? defaultMessage()}
          </p>
        </Show>
      </div>
    </div>
  );
};

export { DisabledState };
export default DisabledState;
