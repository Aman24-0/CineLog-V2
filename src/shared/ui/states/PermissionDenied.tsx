// src/shared/ui/states/PermissionDenied.tsx
//
// 403 Forbidden state — user is authenticated but lacks permission.
// Distinct from 401 (not authenticated) — never show "sign in" for 403.

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";
import { useNavigate } from "@solidjs/router";

export interface PermissionDeniedProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Custom message */
  message?: string;
  /** Whether to show a "Go Home" button */
  showHome?: boolean;
}

const defaultProps: Required<Pick<PermissionDeniedProps, "message" | "showHome">> = {
  message: "You don't have permission to access this page.",
  showHome: true
};

const PermissionDenied: Component<PermissionDeniedProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, ["message", "showHome", "class"]);
  const navigate = useNavigate();

  return (
    <div
      {...rest}
      class={[
        "flex min-h-[50vh] flex-col items-center justify-center gap-5 p-12 text-center",
        local.class || ""
      ].join(" ")}
      role="alert"
      aria-live="assertive"
    >
      <div
        class="flex flex-shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-amber-400 backdrop-blur-md w-16 h-16"
        style={{ "box-shadow": "0 4px 16px rgba(0,0,0,0.35)" }}
        aria-hidden="true"
      >
        <span
          class="material-symbols-outlined text-3xl"
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        >
          lock
        </span>
      </div>
      <div class="flex max-w-[400px] flex-col items-center gap-1">
        <h3 class="font-heading font-bold leading-tight text-text-strong text-lg">
          Access denied
        </h3>
        <p class="font-body leading-relaxed text-text-soft text-sm">
          {local.message}
        </p>
      </div>
      <Show when={local.showHome}>
        <button
          type="button"
          class="btn-primary focus-ring mt-1 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-transform active:scale-95"
          onClick={() => navigate("/")}
          aria-label="Go to home page"
        >
          <span
            class="material-symbols-outlined text-base"
            style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            aria-hidden="true"
          >
            home
          </span>
          Go Home
        </button>
      </Show>
    </div>
  );
};

export { PermissionDenied };
export default PermissionDenied;
