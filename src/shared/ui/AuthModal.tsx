// src/shared/ui/AuthModal.tsx
//
// Phase 3 — Glass System refactor.
// AuthModal now uses <GlassModal> instead of a hand-rolled <Portal> +
// focus-trap + ESC handler. This:
//   • Removes ~80 lines of duplicate focus/ESC/Portal logic that
//     GlassModal already provides correctly (and audited).
//   • Gives the auth modal a consistent visual treatment with every
//     other modal in the app (Details, Collection, NotificationCenter).
//   • Inherits GlassModal's focus trap, restore-focus-to-trigger,
//     and aria-modal="true" behaviour for free.
//
// The auth-specific surface (email/password form, Google OAuth button,
// mode toggle, error display) is passed as `children` to GlassModal.
// The close X is provided by GlassModal's `showCloseButton` (default true).

import { Component, Show, createSignal } from "solid-js";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { getClient } from "~/lib/supabase/client";
import { useToast } from "~/shared/hooks/useToast";
import Icon from "./Icon";
import { GlassModal } from "~/shared/ui/glass";

const AuthModal: Component = () => {
  // useAuthModal() returns { authModalOpen, openAuthModal, closeAuthModal }.
  // Previously this destructured `isOpen` which does not exist on the hook —
  // calling `isOpen()` then threw "isOpen is not a function" (minified to
  // "e is not a function" / "t is not a function"), which was caught by the
  // GlobalErrorBoundary and shown as the full-screen "Something went wrong"
  // fallback on EVERY page load (AuthModal is mounted unconditionally in
  // AppShell). See /upload/Screenshot_2026-07-25-19-24-*.jpg.
  const { authModalOpen: isOpen, closeAuthModal } = useAuthModal();
  const { showToast } = useToast();

  const [mode, setMode] = createSignal<"signin" | "signup">("signin");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // NOTE: ESC + focus trap + restore-focus are all handled by GlassModal.
  // The old createEffect that added a window "keydown" listener for
  // Escape has been removed — GlassModal's onMount registers its own
  // ESC + Tab-trap handler that runs whenever `open` is true.

  const handleEmailAuth = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = getClient();
    try {
      if (mode() === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email(),
          password: password(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        });
        if (signUpError) throw signUpError;
        showToast("Check your email to verify your account.", "success", 5000);
        closeAuthModal();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email(),
          password: password()
        });
        if (signInError) throw signInError;
        showToast("Signed in successfully.", "success");
        closeAuthModal();
      }
    } catch (err: unknown) {
      console.error("Auth error:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "An error occurred during authentication.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error: providerError } = await getClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent"
          }
        }
      });
      if (providerError) throw providerError;
    } catch (err: unknown) {
      console.error("Google auth error:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "An error occurred with Google Sign-In.";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <GlassModal
      open={isOpen()}
      onClose={closeAuthModal}
      // No `title` prop — the auth modal renders its own custom header
      // (animated logo + headline + subtitle) as `children`. GlassModal's
      // default header (icon + title + close button) is suppressed when
      // `title`, `icon`, and `headerRight` are all undefined.
      // `showCloseButton` defaults to true and renders the X in the
      // header-right slot — but since we have no header at all, we set
      // it to false and render our own close button inside the body so
      // it positions correctly relative to the custom header.
      showCloseButton={false}
      strength="strong"
      size="md"
      // AuthModal sits ABOVE every other consumer modal (z-[999999] for
      // DetailsModal, z-[999998] for CollectionModal) so a guest can
      // sign in even when a modal is already open. The previous hand-
      // rolled Portal used z-[9999] which was actually LOWER than the
      // other modals — a latent bug. GlassModal's default zIndexBase is
      // 999990; we bump it to 1000000 so auth always wins.
      zIndexBase={1000000}
      // class passthrough — keeps the existing max-width + layout.
      class="flex w-full max-w-md flex-col gap-6 p-8"
    >
      {/* Close Button — positioned absolute to the modal surface.
          GlassModal's body has `position: relative` via the surface
          styles, so `absolute right-4 top-4` lands in the corner. */}
      <button
        type="button"
        class="focus-ring absolute right-4 top-4"
        onClick={closeAuthModal}
        style={{
          background: "var(--glass-bg-strong)",
          border: "1px solid var(--hairline-2)",
          "border-radius": "50%",
          width: "32px",
          height: "32px",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          color: "var(--text-muted)",
          cursor: "pointer",
          transition: "all 0.2s ease-out"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text-strong)";
          e.currentTarget.style.background = "var(--glass-bg)";
          e.currentTarget.style.borderColor = "var(--hairline)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-muted)";
          e.currentTarget.style.background = "var(--glass-bg-strong)";
          e.currentTarget.style.borderColor = "var(--hairline-2)";
        }}
        aria-label="Close"
      >
        <Icon name="close" style={{ "font-size": "20px" }} />
      </button>

      {/* Header — animated logo + headline + subtitle */}
      <div class="flex flex-col items-center gap-3 text-center">
        {/* Animated logo badge */}
        <div
          class="flex items-center justify-center rounded-2xl"
          style={{
            width: "56px",
            height: "56px",
            background: "var(--glass-bg)",
            border: "1px solid var(--p)",
            "box-shadow":
              "0 0 24px var(--p-glow), inset 0 1px 0 rgb(var(--profile-ambient-primary, 96 112 128) / 0.2)",
            color: "var(--p)",
            animation: "shimmer 3s ease-in-out infinite alternate"
          }}
          aria-hidden="true"
        >
          <Icon name="movie" fill style={{ "font-size": "28px" }} />
        </div>
        <h2
          id="auth-modal-title"
          style={{
            "font-family": "'Bebas Neue', cursive",
            "font-size": "2.25rem",
            "letter-spacing": "0.03em",
            color: "var(--text-strong)",
            "line-height": "1",
            margin: 0
          }}
        >
          {mode() === "signin" ? "Welcome Back" : "Join CineLog"}
        </h2>
        <p
          style={{
            color: "var(--text-muted)",
            "font-size": "0.9375rem",
            "font-family": "'Outfit', sans-serif",
            margin: 0
          }}
        >
          {mode() === "signin"
            ? "Sign in to access your vault and stats."
            : "Create an account to start tracking your journey."}
        </p>
      </div>

      {/* Error Message */}
      <Show when={error()}>
        <div
          role="alert"
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            color: "#fca5a5",
            padding: "0.75rem 1rem",
            "border-radius": "var(--radius-lg)",
            "font-size": "0.875rem",
            display: "flex",
            "align-items": "center",
            gap: "0.5rem"
          }}
        >
          <Icon
            name="error"
            style={{ "font-size": "18px" }}
            aria-hidden="true"
          />
          <span>{error()}</span>
        </div>
      </Show>

      {/* Email/Password Form */}
      <form onSubmit={handleEmailAuth} class="flex flex-col gap-4">
        <div class="flex flex-col gap-3">
          {/* Email Input */}
          <div class="relative">
            <div
              class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
              style={{ color: "var(--text-dim)" }}
            >
              <Icon
                name="mail"
                style={{ "font-size": "18px" }}
                aria-hidden="true"
              />
            </div>
            <input
              type="email"
              required
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              placeholder="Email address"
              class="focus-ring w-full"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--hairline-2)",
                "border-radius": "var(--radius-lg)",
                padding: "0.875rem 1rem 0.875rem 2.5rem",
                color: "var(--text-strong)",
                "font-size": "0.9375rem",
                transition: "all 0.2s ease-out"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--p)";
                e.currentTarget.style.background = "var(--glass-bg-strong)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--hairline-2)";
                e.currentTarget.style.background = "rgba(0,0,0,0.4)";
              }}
              aria-label="Email address"
            />
          </div>

          {/* Password Input */}
          <div class="relative">
            <div
              class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
              style={{ color: "var(--text-dim)" }}
            >
              <Icon
                name="lock"
                style={{ "font-size": "18px" }}
                aria-hidden="true"
              />
            </div>
            <input
              type="password"
              required
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder="Password"
              class="focus-ring w-full"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--hairline-2)",
                "border-radius": "var(--radius-lg)",
                padding: "0.875rem 1rem 0.875rem 2.5rem",
                color: "var(--text-strong)",
                "font-size": "0.9375rem",
                transition: "all 0.2s ease-out"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--p)";
                e.currentTarget.style.background = "var(--glass-bg-strong)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--hairline-2)";
                e.currentTarget.style.background = "rgba(0,0,0,0.4)";
              }}
              aria-label="Password"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading()}
          class="focus-ring relative flex w-full items-center justify-center rounded-lg"
          style={{
            background: "var(--p)",
            color: "#111",
            "font-weight": 700,
            "font-size": "1rem",
            padding: "0.875rem",
            border: "none",
            cursor: loading() ? "not-allowed" : "pointer",
            opacity: loading() ? 0.7 : 1,
            transition: "all 0.2s ease",
            "box-shadow":
              "0 0 20px var(--p-glow), inset 0 1px 0 rgba(255,255,255,0.4)"
          }}
          onMouseEnter={(e) => {
            if (!loading()) {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 4px 24px var(--p-glow), inset 0 1px 0 rgba(255,255,255,0.5)";
            }
          }}
          onMouseLeave={(e) => {
            if (!loading()) {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 0 20px var(--p-glow), inset 0 1px 0 rgba(255,255,255,0.4)";
            }
          }}
          onMouseDown={(e) => {
            if (!loading()) {
              e.currentTarget.style.transform = "translateY(1px)";
            }
          }}
          onMouseUp={(e) => {
            if (!loading()) {
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
        >
          {loading() ? (
            <span class="flex items-center gap-2">
              <Icon
                name="progress_activity"
                class="animate-spin"
                aria-hidden="true"
              />
              Processing...
            </span>
          ) : mode() === "signin" ? (
            "Sign In"
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      {/* Divider */}
      <div class="relative mb-2 mt-2 flex items-center justify-center">
        <div class="absolute inset-0 flex items-center" aria-hidden="true">
          <div
            class="w-full border-t"
            style={{ "border-color": "var(--hairline-2)" }}
          />
        </div>
        <span
          class="type-caption relative px-3"
          style={{
            background: "var(--glass-bg)", // Matches the surface gradient approx
            color: "var(--text-dim)"
          }}
        >
          or
        </span>
      </div>

      {/* Google Auth Button */}
      <button
        type="button"
        onClick={handleGoogleAuth}
        disabled={loading()}
        class="focus-ring flex w-full items-center justify-center gap-3"
        style={{
          background: "var(--glass-bg)",
          border: "1px solid var(--hairline)",
          "border-radius": "var(--radius-lg)",
          color: "var(--text-strong)",
          padding: "0.875rem",
          "font-size": "0.9375rem",
          "font-weight": 600,
          cursor: loading() ? "not-allowed" : "pointer",
          transition: "all 0.2s ease"
        }}
        onMouseEnter={(e) => {
          if (!loading()) {
            e.currentTarget.style.background = "var(--glass-bg-strong)";
            e.currentTarget.style.borderColor = "var(--hairline-2)";
          }
        }}
        onMouseLeave={(e) => {
          if (!loading()) {
            e.currentTarget.style.background = "var(--glass-bg)";
            e.currentTarget.style.borderColor = "var(--hairline)";
          }
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
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
          "font-family": "'Outfit', sans-serif"
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
            "text-underline-offset": "2px"
          }}
        >
          {mode() === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </GlassModal>
  );
};

export default AuthModal;
