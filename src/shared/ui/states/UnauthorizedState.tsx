// src/shared/ui/states/UnauthorizedState.tsx
//
// 401 Unauthenticated state — user needs to sign in.
// Distinct from 403 (forbidden) — show "sign in" CTA, not "access denied".

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

export interface UnauthorizedStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Custom message */
  message?: string;
  /** Called when sign-in is clicked */
  onSignIn?: () => void;
}

const defaultProps: Required<Pick<UnauthorizedStateProps, "message">> = {
  message: "Please sign in to continue."
};

const UnauthorizedState: Component<UnauthorizedStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, ["message", "onSignIn", "class"]);

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
        class="flex flex-shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass text-primary backdrop-blur-md w-16 h-16"
        style={{ "box-shadow": "0 4px 16px rgba(0,0,0,0.35)" }}
        aria-hidden="true"
      >
        <span
          class="material-symbols-outlined text-3xl"
          style={{ "font-variation-settings": "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
        >
          person_off
        </span>
      </div>
      <div class="flex max-w-[400px] flex-col items-center gap-1">
        <h3 class="font-heading font-bold leading-tight text-text-strong text-lg">
          Sign in required
        </h3>
        <p class="font-body leading-relaxed text-text-soft text-sm">
          {local.message}
        </p>
      </div>
      <Show when={local.onSignIn}>
        <button
          type="button"
          class="btn-primary focus-ring mt-1 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-transform active:scale-95"
          onClick={() => local.onSignIn?.()}
          aria-label="Sign in"
        >
          <span
            class="material-symbols-outlined text-base"
            style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            aria-hidden="true"
          >
            login
          </span>
          Sign In
        </button>
      </Show>
    </div>
  );
};

export { UnauthorizedState };
export default UnauthorizedState;
