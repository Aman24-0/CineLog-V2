// src/shared/ui/states/NotFoundState.tsx
//
// Resource not found state — for when a specific movie, show,
// collection, or user no longer exists or the URL is invalid.

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";
import { useNavigate } from "@solidjs/router";

export interface NotFoundStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** What type of resource was not found, e.g. "Movie" or "Collection" */
  resourceType?: string;
  /** Custom message. Default provides helpful context based on resourceType */
  message?: string;
  /** Where the "Go back" button should navigate. Default "/discover" */
  backHref?: string;
  /** Back button label. Default "Back to Discover" */
  backLabel?: string;
  /** Variant: "section" or "page" */
  variant?: "section" | "page";
}

const defaultProps: Required<
  Pick<NotFoundStateProps, "resourceType" | "backHref" | "backLabel" | "variant">
> = {
  resourceType: "Content",
  backHref: "/discover",
  backLabel: "Back to Discover",
  variant: "page"
};

const NotFoundState: Component<NotFoundStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "resourceType", "message", "backHref", "backLabel", "variant", "class"
  ]);
  const navigate = useNavigate();

  const defaultMessage = () =>
    `This ${local.resourceType.toLowerCase()} may have been removed or is no longer available.`;

  const containerClasses = () => {
    const base = [
      "flex flex-col items-center justify-center text-center w-full",
      local.variant === "page" ? "min-h-[50vh] gap-5 p-12" : "gap-3 p-6"
    ];
    if (local.class) base.push(local.class);
    return base.join(" ");
  };

  return (
    <div {...rest} class={containerClasses()} role="status" aria-live="polite">
      <div
        class="flex flex-shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-text-muted backdrop-blur-md w-16 h-16"
        style={{ "box-shadow": "0 4px 16px rgba(0,0,0,0.35)" }}
        aria-hidden="true"
      >
        <span
          class="material-symbols-outlined text-3xl"
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        >
          explore_off
        </span>
      </div>
      <div class="flex max-w-[400px] flex-col items-center gap-1">
        <h3 class="font-heading font-bold leading-tight text-text-strong text-lg">
          {local.resourceType} not found
        </h3>
        <p class="font-body leading-relaxed text-text-soft text-sm">
          {local.message ?? defaultMessage()}
        </p>
      </div>
      <button
        type="button"
        class="btn-primary focus-ring mt-1 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-transform active:scale-95"
        onClick={() => navigate(local.backHref)}
        aria-label={local.backLabel}
      >
        <span
          class="material-symbols-outlined text-base"
          style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
          aria-hidden="true"
        >
          arrow_back
        </span>
        {local.backLabel}
      </button>
    </div>
  );
};

export { NotFoundState };
export default NotFoundState;
