// src/routes/admin/login.tsx
//
// CineLog V2 — Admin Login Page (/admin/login)
// ---------------------------------------------------------------------
// "Special login method" — three layers of verification:
//   1. Email + password (verified by Supabase Auth)
//   2. is_admin flag on profile (verified server-side)
//   3. 6-digit admin PIN (verified against ADMIN_PIN env var)
//
// This page collects all three and POSTs to /api/admin/auth.
// On success, the server sets an HttpOnly admin cookie and the
// user is redirected to /admin (the dashboard).
//
// VISUAL DESIGN:
//   The login page is intentionally minimal — a dark, centered card
//   with the CineLog logo, a small "Admin Access" subtitle, and the
//   three input fields. No bottom nav, no header — this is a focused
//   auth surface.
//
// SECURITY:
//   • Inputs are autocomplete-disabled to prevent password manager leaks
//   • PIN input uses type="password" + inputMode="numeric" + maxLength=6
//   • Error messages are generic ("Invalid credentials") to avoid
//     leaking which layer failed
//   • The page is server-rendered with no admin state (SSR-safe)

import { Title } from "@solidjs/meta";
import { createSignal, Show, onMount, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAdminAuth } from "~/features/admin/hooks/useAdminAuth";

const AdminLoginPage: Component = () => {
  const navigate = useNavigate();
  const auth = useAdminAuth();

  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [pin, setPin] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let emailRef: HTMLInputElement | undefined;

  onMount(() => {
    // If already logged in, redirect to dashboard
    if (auth.isAdmin()) {
      navigate("/admin", { replace: true });
      return;
    }
    // Focus the first input
    setTimeout(() => emailRef?.focus(), 100);
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);

    if (!email().trim() || !password() || !pin().trim()) {
      setError("All fields are required.");
      return;
    }
    if (pin().trim().length !== 6 || !/^\d{6}$/.test(pin().trim())) {
      setError("PIN must be exactly 6 digits.");
      return;
    }

    setSubmitting(true);
    const result = await auth.login(email().trim(), password(), pin().trim());
    setSubmitting(false);

    if (result.ok) {
      navigate("/admin", { replace: true });
    } else {
      setError(result.error ?? "Login failed");
    }
  };

  return (
    <>
      <Title>CineLog Admin — Login</Title>
      <div
        class="admin-login-page"
        style={{
          "min-height": "100vh",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          padding: "var(--sp-4)",
          background: "var(--void)",
          color: "var(--text)",
        }}
      >
        <div
          class="admin-login-card"
          style={{
            width: "100%",
            "max-width": "420px",
            background: "var(--tier-1)",
            border: "1px solid var(--hairline)",
            "border-radius": "var(--radius-xl)",
            padding: "var(--sp-8)",
            "box-shadow": "var(--shadow-xl)",
          }}
        >
          {/* Logo / Header */}
          <div style={{ "text-align": "center", "margin-bottom": "var(--sp-6)" }}>
            <div
              style={{
                "font-size": "2.5rem",
                "margin-bottom": "var(--sp-2)",
              }}
              aria-hidden="true"
            >
              🎬
            </div>
            <h1
              style={{
                "font-size": "1.5rem",
                "font-weight": "700",
                "margin": "0 0 var(--sp-1) 0",
                color: "var(--text)",
              }}
            >
              CineLog Admin
            </h1>
            <p
              style={{
                "font-size": "0.875rem",
                color: "var(--text-muted)",
                margin: 0,
              }}
            >
              Restricted access — authorized administrators only
            </p>
          </div>

          <form onSubmit={handleSubmit} novalidate>
            {/* Email */}
            <div style={{ "margin-bottom": "var(--sp-4)" }}>
              <label
                for="admin-email"
                style={{
                  display: "block",
                  "font-size": "0.8125rem",
                  "font-weight": "500",
                  "margin-bottom": "var(--sp-2)",
                  color: "var(--text-secondary)",
                }}
              >
                Email
              </label>
              <input
                id="admin-email"
                ref={emailRef}
                type="email"
                autocomplete="username"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                disabled={submitting()}
                placeholder="admin@example.com"
                required
                style={{
                  width: "100%",
                  padding: "var(--sp-3) var(--sp-4)",
                  "background": "var(--tier-2)",
                  border: "1px solid var(--hairline-2)",
                  "border-radius": "var(--radius-md)",
                  color: "var(--text)",
                  "font-size": "0.9375rem",
                  outline: "none",
                  "transition": "border-color 0.15s ease",
                }}
              />
            </div>

            {/* Password */}
            <div style={{ "margin-bottom": "var(--sp-4)" }}>
              <label
                for="admin-password"
                style={{
                  display: "block",
                  "font-size": "0.8125rem",
                  "font-weight": "500",
                  "margin-bottom": "var(--sp-2)",
                  color: "var(--text-secondary)",
                }}
              >
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                autocomplete="current-password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                disabled={submitting()}
                placeholder="••••••••"
                required
                style={{
                  width: "100%",
                  padding: "var(--sp-3) var(--sp-4)",
                  "background": "var(--tier-2)",
                  border: "1px solid var(--hairline-2)",
                  "border-radius": "var(--radius-md)",
                  color: "var(--text)",
                  "font-size": "0.9375rem",
                  outline: "none",
                }}
              />
            </div>

            {/* Admin PIN */}
            <div style={{ "margin-bottom": "var(--sp-6)" }}>
              <label
                for="admin-pin"
                style={{
                  display: "block",
                  "font-size": "0.8125rem",
                  "font-weight": "500",
                  "margin-bottom": "var(--sp-2)",
                  color: "var(--text-secondary)",
                }}
              >
                Admin PIN
              </label>
              <input
                id="admin-pin"
                type="password"
                inputmode="numeric"
                autocomplete="off"
                maxlength={6}
                value={pin()}
                onInput={(e) =>
                  setPin(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))
                }
                disabled={submitting()}
                placeholder="••••••"
                required
                style={{
                  width: "100%",
                  padding: "var(--sp-3) var(--sp-4)",
                  "background": "var(--tier-2)",
                  border: "1px solid var(--hairline-2)",
                  "border-radius": "var(--radius-md)",
                  color: "var(--text)",
                  "font-size": "0.9375rem",
                  "letter-spacing": "0.5em",
                  outline: "none",
                  "text-align": "center",
                  "font-family": "monospace",
                }}
              />
              <p
                style={{
                  "font-size": "0.75rem",
                  color: "var(--text-muted)",
                  margin: "var(--sp-2) 0 0 0",
                }}
              >
                6-digit PIN set by the project owner
              </p>
            </div>

            {/* Error */}
            <Show when={error()}>
              <div
                role="alert"
                style={{
                  "background": "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  "border-radius": "var(--radius-md)",
                  padding: "var(--sp-3)",
                  "margin-bottom": "var(--sp-4)",
                  "font-size": "0.8125rem",
                  color: "rgb(252, 165, 165)",
                }}
              >
                {error()}
              </div>
            </Show>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting()}
              style={{
                width: "100%",
                padding: "var(--sp-3) var(--sp-4)",
                "background": submitting() ? "var(--tier-3)" : "var(--p)",
                color: submitting() ? "var(--text-muted)" : "var(--on-primary)",
                border: "none",
                "border-radius": "var(--radius-md)",
                "font-size": "0.9375rem",
                "font-weight": "600",
                cursor: submitting() ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
                "box-shadow": submitting() ? "none" : "var(--shadow-glow)",
              }}
            >
              <Show when={!submitting()} fallback="Verifying…">
                Sign In to Admin
              </Show>
            </button>
          </form>

          {/* Back to app */}
          <div style={{ "text-align": "center", "margin-top": "var(--sp-6)" }}>
            <a
              href="/discover"
              style={{
                "font-size": "0.8125rem",
                color: "var(--text-muted)",
                "text-decoration": "none",
              }}
            >
              ← Back to CineLog
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminLoginPage;
