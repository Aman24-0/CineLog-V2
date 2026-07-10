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

import { Show, createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import { Portal } from "solid-js/web";
import { signInWithEmail, signUpWithEmail } from "~/shared/hooks/useAuthActions";

export interface AuthModalProps {
  show: Accessor<boolean>;
  onClose: () => void;
}

export default function AuthModal(props: AuthModalProps) {
  const [mode, setMode] = createSignal<"signin" | "signup">("signin");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", handleEsc);
    onCleanup(() => window.removeEventListener("keydown", handleEsc));
  });

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
      // Reset form and close modal
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
          class="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          style={{ background: "rgba(0,0,0,0.85)", "backdrop-filter": "blur(8px)" }}
          onClick={props.onClose}
          role="dialog"
          aria-modal="true"
        >
          <div
            class="w-full max-w-sm relative z-10"
            style={{
              background: "var(--surface, #111)",
              border: "1px solid var(--hairline, rgba(255,255,255,0.08))",
              "border-radius": "var(--radius-xl, 24px)",
              padding: "var(--sp-6, 24px)",
              "padding-bottom": "calc(var(--sp-6, 24px) + env(safe-area-inset-bottom, 0px))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={props.onClose}
              class="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--hairline, rgba(255,255,255,0.08))",
                color: "var(--text-soft, rgba(232,234,240,0.72))",
              }}
              aria-label="Close"
            >
              <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
                close
              </span>
            </button>

            {/* Header */}
            <div style={{ "text-align": "center", "margin-bottom": "var(--sp-5, 20px)" }}>
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "32px", color: "var(--p, #a8ff78)", "margin-bottom": "var(--sp-2, 8px)" }}
                aria-hidden="true"
              >
                movie
              </span>
              <h2 style={{ "font-family": "'Bebas Neue', sans-serif", "font-size": "24px", color: "#fff", margin: 0, "letter-spacing": "0.04em" }}>
                {mode() === "signin" ? "Welcome Back" : "Create Account"}
              </h2>
              <p style={{ "font-size": "13px", color: "var(--text-soft, rgba(232,234,240,0.72))", "margin-top": "4px" }}>
                {mode() === "signin" ? "Sign in to your CineLog vault" : "Start tracking your movies and shows"}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", "flex-direction": "column", gap: "var(--sp-3, 12px)" }}>
              <input
                type="email"
                placeholder="Email address"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "var(--tier-1, #0a0b0e)",
                  border: "1px solid var(--hairline-2, rgba(255,255,255,0.10))",
                  "border-radius": "var(--radius-md, 12px)",
                  color: "#fff",
                  "font-size": "15px",
                  outline: "none",
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
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "var(--tier-1, #0a0b0e)",
                  border: "1px solid var(--hairline-2, rgba(255,255,255,0.10))",
                  "border-radius": "var(--radius-md, 12px)",
                  color: "#fff",
                  "font-size": "15px",
                  outline: "none",
                }}
                aria-label="Password"
                autocomplete={mode() === "signin" ? "current-password" : "new-password"}
                required
              />

              <Show when={error()}>
                <p style={{ color: "#ef4444", "font-size": "13px", "text-align": "center", margin: 0 }}>
                  {error()}
                </p>
              </Show>

              <button
                type="submit"
                disabled={loading()}
                class="btn-primary"
                style={{
                  width: "100%",
                  "margin-top": "var(--sp-2, 8px)",
                  opacity: loading() ? "0.6" : "1",
                }}
              >
                <Show when={!loading()} fallback={<span>Signing in…</span>}>
                  {mode() === "signin" ? "Sign In" : "Create Account"}
                </Show>
              </button>
            </form>

            {/* Toggle mode */}
            <p style={{ "text-align": "center", "margin-top": "var(--sp-4, 16px)", "font-size": "13px", color: "var(--text-muted, rgba(232,234,240,0.48))" }}>
              {mode() === "signin" ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode() === "signin" ? "signup" : "signin");
                  setError(null);
                }}
                style={{
                  color: "var(--p, #a8ff78)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "13px",
                  "font-weight": "700",
                  "text-decoration": "underline",
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
}
