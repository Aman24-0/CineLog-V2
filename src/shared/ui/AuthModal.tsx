// src/shared/ui/AuthModal.tsx
//
// Email/password authentication modal — replaces the previous Google
// OAuth flow. Shown when a guest user taps "Sign In" on any page.
//
// Two modes:
//   - "signin" (default): email + password login
//   - "signup": email + password registration
//
// The modal is self-contained: it manages its own open/close state via
// a signal that any component can toggle through the `show()` prop.
// It calls signInWithEmail / signUpWithEmail from useAuthActions.
//
// Polished:
//  - Bottom-sheet on mobile (slides up from the bottom), centered dialog
//    on desktop (pops in with spring easing).
//  - Drag-handle affordance on mobile.
//  - Focus is moved to the email input on open and trapped inside the
//    modal (Tab / Shift-Tab cycle within the modal).
//  - Escape key closes the modal (existing behavior, retained).
//  - All inputs use the design-system input style (.filter-input-premium)
//    so the modal feels consistent with the rest of the app.
//  - Error message is role="alert" so screen readers announce it.
//  - Submit button shows a spinner when loading.

import {
  Show,
  createSignal,
  onMount,
  onCleanup,
  createEffect,
  type Accessor,
  type Component,
} from "solid-js";
import { Portal } from "solid-js/web";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
} from "~/shared/hooks/useAuthActions";

export interface AuthModalProps {
  show: Accessor<boolean>;
  onClose: () => void;
}

const AuthModal: Component<AuthModalProps> = (props) => {
  const [mode, setMode] = createSignal<"signin" | "signup">("signin");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let containerRef: HTMLDivElement | undefined;
  let firstInputRef: HTMLInputElement | undefined;

  onMount(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", handleEsc);
    onCleanup(() => window.removeEventListener("keydown", handleEsc));
  });

  // Focus the email input when the modal opens. createEffect re-runs
  // whenever `show` flips to true, so re-opening the modal re-focuses.
  createEffect(() => {
    if (props.show()) {
      // Defer one tick so the input is mounted before we focus it.
      setTimeout(() => firstInputRef?.focus(), 80);
    } else {
      // Reset state when the modal closes.
      setError(null);
    }
  });

  // Trap Tab focus inside the modal while it's open. The container has
  // a single tabbable cycle: email → password → submit → google →
  // toggle → close. We intercept Tab on the close button (last) to
  // loop back to email (first), and Shift+Tab on email to loop forward
  // to close.
  const handleTabTrap = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const focusable = containerRef?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!email().trim() || !password()) {
      setError("Please enter your email and password.");
      return;
    }
    if (password().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    const result =
      mode() === "signin"
        ? await signInWithEmail(email(), password())
        : await signUpWithEmail(email(), password());

    setLoading(false);

    if (result.success) {
      setEmail("");
      setPassword("");
      setError(null);
      props.onClose();
    } else {
      setError(result.error || "Something went wrong.");
    }
  };

  return (
    <Show when={props.show()}>
      <Portal>
        <div
          class="modal-backdrop fixed inset-0 z-[999999] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{
            background: "rgba(0,0,0,0.85)",
            "backdrop-filter": "blur(8px)",
            "-webkit-backdrop-filter": "blur(8px)",
          }}
          onClick={props.onClose}
          role="dialog"
          aria-modal="true"
          aria-label={mode() === "signin" ? "Sign in to CineLog" : "Create a CineLog account"}
        >
          <div
            ref={containerRef}
            class="modal-sheet-enter modal-surface w-full max-w-sm relative z-10"
            style={{
              "border-radius": "var(--radius-xl)",
              padding: "var(--sp-6)",
              "padding-top": "var(--sp-4)",
              "padding-bottom":
                "calc(var(--sp-6) + env(safe-area-inset-bottom, 0px))",
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleTabTrap}
          >
            {/* Drag handle — mobile-only visual affordance */}
            <div
              class="sheet-handle sm:hidden"
              aria-hidden="true"
              style={{ "margin-top": "0", "margin-bottom": "var(--sp-3)" }}
            />

            {/* Close button */}
            <button
              type="button"
              onClick={props.onClose}
              class="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center focus-ring"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--hairline)",
                color: "var(--text-soft)",
                transition:
                  "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.10)";
                e.currentTarget.style.color = "var(--text-strong)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                e.currentTarget.style.color = "var(--text-soft)";
              }}
              aria-label="Close sign-in dialog"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "16px" }}
                aria-hidden="true"
              >
                close
              </span>
            </button>

            {/* Header */}
            <div
              style={{
                "text-align": "center",
                "margin-bottom": "var(--sp-5)",
              }}
            >
              <span
                class="material-symbols-outlined"
                style={{
                  "font-size": "32px",
                  color: "var(--p)",
                  "margin-bottom": "var(--sp-2)",
                  "font-variation-settings":
                    "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 40",
                }}
                aria-hidden="true"
              >
                movie
              </span>
              <h2
                style={{
                  "font-family": "'Bebas Neue', sans-serif",
                  "font-size": "1.75rem",
                  color: "var(--text-strong)",
                  margin: "0",
                  "letter-spacing": "0.04em",
                  "line-height": "1",
                }}
              >
                {mode() === "signin" ? "Welcome Back" : "Create Account"}
              </h2>
              <p
                style={{
                  "font-size": "0.8125rem",
                  color: "var(--text-soft)",
                  "margin-top": "var(--sp-1)",
                  "font-family": "'Outfit', sans-serif",
                }}
              >
                {mode() === "signin"
                  ? "Sign in to your CineLog watchlist"
                  : "Start tracking your movies and shows"}
              </p>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                "flex-direction": "column",
                gap: "var(--sp-3)",
              }}
            >
              <input
                ref={firstInputRef}
                type="email"
                placeholder="Email address"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class="filter-input-premium focus-ring"
                style={{
                  padding: "0.75rem 1rem",
                  "font-size": "0.9375rem",
                }}
                aria-label="Email"
                autocomplete="email"
                required
              />
              <input
                type="password"
                placeholder="Password (min 6 characters)"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                class="filter-input-premium focus-ring"
                style={{
                  padding: "0.75rem 1rem",
                  "font-size": "0.9375rem",
                }}
                aria-label="Password"
                autocomplete={
                  mode() === "signin" ? "current-password" : "new-password"
                }
                required
              />

              <Show when={error()}>
                <p
                  role="alert"
                  style={{
                    color: "#f87171",
                    "font-size": "0.8125rem",
                    "text-align": "center",
                    margin: "0",
                    "font-family": "'Outfit', sans-serif",
                    "font-weight": 500,
                    padding: "0.5rem 0.75rem",
                    "border-radius": "var(--radius-sm)",
                    background: "rgba(248,113,113,0.08)",
                    border: "1px solid rgba(248,113,113,0.2)",
                  }}
                >
                  {error()}
                </p>
              </Show>

              <button
                type="submit"
                disabled={loading()}
                class="btn-primary focus-ring"
                style={{
                  width: "100%",
                  "margin-top": "var(--sp-2)",
                  opacity: loading() ? "0.7" : "1",
                  "pointer-events": loading() ? "none" : "auto",
                }}
              >
                <Show
                  when={!loading()}
                  fallback={
                    <span
                      style={{
                        display: "inline-flex",
                        "align-items": "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span
                        class="material-symbols-outlined animate-soft-pulse"
                        style={{ "font-size": "16px" }}
                        aria-hidden="true"
                      >
                        progress_activity
                      </span>
                      {mode() === "signin" ? "Signing in…" : "Creating…"}
                    </span>
                  }
                >
                  {mode() === "signin" ? "Sign In" : "Create Account"}
                </Show>
              </button>
            </form>

            {/* Divider */}
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "0.75rem",
                "margin-top": "var(--sp-4)",
                "margin-bottom": "var(--sp-4)",
              }}
            >
              <div
                style={{
                  flex: "1",
                  height: "1px",
                  background: "var(--hairline)",
                }}
              />
              <span
                style={{
                  "font-size": "0.6875rem",
                  color: "var(--text-muted)",
                  "text-transform": "uppercase",
                  "letter-spacing": "0.14em",
                  "font-family": "'Azeret Mono', monospace",
                  "font-weight": 700,
                }}
              >
                or
              </span>
              <div
                style={{
                  flex: "1",
                  height: "1px",
                  background: "var(--hairline)",
                }}
              />
            </div>

            {/* Google sign-in */}
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              class="focus-ring"
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                gap: "0.625rem",
                background: "#fff",
                color: "#1a1a1a",
                border: "none",
                "border-radius": "var(--radius-md)",
                "font-size": "0.9375rem",
                "font-weight": 600,
                "font-family": "'Outfit', sans-serif",
                cursor: "pointer",
                transition:
                  "transform var(--dur-fast) var(--ease-spring), opacity var(--dur-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.opacity = "0.92")
              }
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseDown={(e) =>
                (e.currentTarget.style.transform = "scale(0.98)")
              }
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            {/* Toggle mode */}
            <p
              style={{
                "text-align": "center",
                "margin-top": "var(--sp-4)",
                "font-size": "0.8125rem",
                color: "var(--text-muted)",
                "font-family": "'Outfit', sans-serif",
              }}
            >
              {mode() === "signin"
                ? "Don't have an account? "
                : "Already have an account? "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode() === "signin" ? "signup" : "signin");
                  setError(null);
                }}
                class="focus-ring"
                style={{
                  color: "var(--p)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "0.8125rem",
                  "font-weight": 700,
                  "text-decoration": "underline",
                  "text-underline-offset": "2px",
                }}
              >
                {mode() === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default AuthModal;
