// src/routes/admin/login.tsx
//
// CineLog V2 — Admin Login Page (/admin/login)
// ---------------------------------------------------------------------
// "Special login method" — three layers of verification:
//   1. CineLog identity (Supabase session via Google OAuth OR
//      email + password) — verified server-side
//   2. is_admin flag on profile — verified server-side
//   3. 6-digit admin PIN — verified against ADMIN_PIN env var
//
// LOGIN FLOW (auto-detected based on the visitor's state):
//
//   State A — visitor is already signed into CineLog (has a Supabase
//   session cookie from Google OAuth or any other method):
//     1. Page detects the session via supabase.auth.getSession().
//     2. Email/Google sign-in section is hidden.
//     3. Visitor enters only the Admin PIN.
//     4. POST /api/admin/auth { pin, mode: "session" }
//
//   State B — visitor is NOT signed into CineLog:
//     1. Page shows two options:
//        a) "Sign in with Google" — uses the main app's OAuth flow.
//           After Google redirect, the user lands back on /admin/login
//           and the page transitions to State A.
//        b) Email + password form — for users who have a password
//           set on their account. After successful verification,
//           the visitor enters the PIN and submits.
//
// SECURITY:
//   • PIN input: type="password", inputMode="numeric", maxLength=6
//   • Error messages are generic ("Invalid credentials") to avoid
//     leaking which layer failed
//   • The page is server-rendered with no admin state (SSR-safe)

import { Title } from "@solidjs/meta";
import {
  createSignal,
  Show,
  onMount,
  createResource,
  type Component
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAdminAuth } from "~/features/admin/hooks/useAdminAuth";
import { getClient } from "~/lib/supabase/client";

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Check if the visitor has an active Supabase session (CineLog
 * sign-in via Google OAuth or any other method). Returns the
 * user's email if signed in, or null otherwise.
 *
 * Runs only on the client. During SSR, returns null so the page
 * renders the "not signed in" state, then upgrades after hydration.
 */
async function detectCineLogSession(): Promise<{ email: string } | null> {
  if (typeof window === "undefined") return null;
  try {
    const supabase = getClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) return null;
    const email = data.session.user.email ?? null;
    if (!email) return null;
    return { email };
  } catch {
    return null;
  }
}

/**
 * Sign in to CineLog via Google OAuth. After Google's consent screen,
 * Supabase redirects back to the configured URL (we use /admin/login
 * so the user lands back here and the page transitions to State A).
 */
async function signInWithGoogle(redirectTo: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo }
  });
  if (error) throw error;
  // Browser will redirect — no further code runs
}

// ─── Component ────────────────────────────────────────────────────

const AdminLoginPage: Component = () => {
  const navigate = useNavigate();
  const auth = useAdminAuth();

  // Detect existing CineLog session (client-only)
  const [session] = createResource(detectCineLogSession);

  // Form state
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [pin, setPin] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [oauthLoading, setOauthLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [showPasswordForm, setShowPasswordForm] = createSignal(false);

  let pinRef: HTMLInputElement | undefined;
  let emailRef: HTMLInputElement | undefined;

  onMount(() => {
    // If already an admin, skip login
    if (auth.isAdmin()) {
      navigate("/admin", { replace: true });
      return;
    }
    // After hydration, focus the appropriate field once we know the session state.
    // We poll session() because createResource resolves async.
    let attempts = 0;
    const tryFocus = () => {
      attempts++;
      if (auth.isAdmin()) return; // navigating away
      if (session.loading) {
        if (attempts < 20) setTimeout(tryFocus, 100);
        return;
      }
      if (session()?.email) {
        pinRef?.focus();
      } else {
        emailRef?.focus();
      }
    };
    setTimeout(tryFocus, 100);
  });

  // ─── PIN-only submit (State A: session-based) ───────────────────
  const handlePinSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);

    if (
      !pin().trim() ||
      pin().trim().length !== 6 ||
      !/^\d{6}$/.test(pin().trim())
    ) {
      setError("PIN must be exactly 6 digits.");
      return;
    }

    setSubmitting(true);
    const result = await auth.loginWithPin(pin().trim());
    setSubmitting(false);

    if (result.ok) {
      navigate("/admin", { replace: true });
    } else {
      setError(result.error ?? "Login failed");
      setPin("");
    }
  };

  // ─── Email + password + PIN submit (State B: password mode) ─────
  const handlePasswordSubmit = async (e: Event) => {
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

  // ─── Google OAuth button ────────────────────────────────────────
  const handleGoogle = async () => {
    setError(null);
    setOauthLoading(true);
    try {
      await signInWithGoogle("/admin/login");
      // Browser will redirect — code below never runs
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed.";
      setError(msg);
      setOauthLoading(false);
    }
  };

  // ─── Style helpers ──────────────────────────────────────────────
  const inputStyle = {
    width: "100%",
    padding: "var(--sp-3) var(--sp-4)",
    background: "var(--tier-2)",
    border: "1px solid var(--hairline-2)",
    "border-radius": "var(--radius-md)",
    color: "var(--text)",
    "font-size": "0.9375rem",
    outline: "none",
    transition: "border-color 0.15s ease"
  } as const;

  const labelStyle = {
    display: "block",
    "font-size": "0.8125rem",
    "font-weight": "500",
    "margin-bottom": "var(--sp-2)",
    color: "var(--text-secondary)"
  } as const;

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
          color: "var(--text)"
        }}
      >
        <div
          class="admin-login-card"
          style={{
            width: "100%",
            "max-width": "460px",
            background: "var(--tier-1)",
            border: "1px solid var(--hairline)",
            "border-radius": "var(--radius-xl)",
            padding: "var(--sp-8)",
            "box-shadow": "var(--shadow-xl)"
          }}
        >
          {/* Header */}
          <div
            style={{ "text-align": "center", "margin-bottom": "var(--sp-6)" }}
          >
            <div
              style={{ "font-size": "2.5rem", "margin-bottom": "var(--sp-2)" }}
              aria-hidden="true"
            >
              🎬
            </div>
            <h1
              style={{
                "font-size": "1.5rem",
                "font-weight": "700",
                margin: "0 0 var(--sp-1) 0",
                color: "var(--text)"
              }}
            >
              CineLog Admin
            </h1>
            <p
              style={{
                "font-size": "0.875rem",
                color: "var(--text-muted)",
                margin: 0
              }}
            >
              Restricted access — authorized administrators only
            </p>
          </div>

          {/* Loading state — checking for CineLog session */}
          <Show
            when={!session.loading}
            fallback={<LoadingBlock label="Checking CineLog session…" />}
          >
            {/* ════════════════════════════════════════════════════════════
                STATE A — visitor is signed into CineLog
                Show only the PIN field. The server will read the
                Supabase session cookie and verify the user.
            ════════════════════════════════════════════════════════════ */}
            <Show when={session()?.email}>
              <div
                style={{
                  background: "var(--tier-2)",
                  border: "1px solid var(--hairline-2)",
                  "border-radius": "var(--radius-md)",
                  padding: "var(--sp-3) var(--sp-4)",
                  "margin-bottom": "var(--sp-5)",
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--sp-3)"
                }}
              >
                <span style={{ "font-size": "1.125rem" }} aria-hidden="true">
                  ✅
                </span>
                <div style={{ "min-width": "0", flex: 1 }}>
                  <div
                    style={{
                      "font-size": "0.75rem",
                      color: "var(--text-muted)"
                    }}
                  >
                    Signed in as
                  </div>
                  <div
                    style={{
                      "font-size": "0.875rem",
                      color: "var(--text)",
                      "font-weight": "500",
                      "white-space": "nowrap",
                      overflow: "hidden",
                      "text-overflow": "ellipsis"
                    }}
                  >
                    {session()?.email}
                  </div>
                </div>
              </div>

              <form onSubmit={handlePinSubmit} novalidate>
                <div style={{ "margin-bottom": "var(--sp-6)" }}>
                  <label for="admin-pin-session" style={labelStyle}>
                    Admin PIN
                  </label>
                  <input
                    id="admin-pin-session"
                    ref={pinRef}
                    type="password"
                    inputmode="numeric"
                    autocomplete="off"
                    maxlength={6}
                    value={pin()}
                    onInput={(e) =>
                      setPin(
                        e.currentTarget.value.replace(/\D/g, "").slice(0, 6)
                      )
                    }
                    disabled={submitting()}
                    placeholder="••••••"
                    required
                    style={{
                      ...inputStyle,
                      "letter-spacing": "0.5em",
                      "text-align": "center",
                      "font-family": "monospace"
                    }}
                  />
                  <p
                    style={{
                      "font-size": "0.75rem",
                      color: "var(--text-muted)",
                      margin: "var(--sp-2) 0 0 0"
                    }}
                  >
                    6-digit PIN set by the project owner
                  </p>
                </div>

                <Show when={error()}>
                  <ErrorBlock message={error()!} />
                </Show>

                <button
                  type="submit"
                  disabled={submitting()}
                  style={{
                    width: "100%",
                    padding: "var(--sp-3) var(--sp-4)",
                    background: submitting() ? "var(--tier-3)" : "var(--p)",
                    color: submitting()
                      ? "var(--text-muted)"
                      : "var(--on-primary)",
                    border: "none",
                    "border-radius": "var(--radius-md)",
                    "font-size": "0.9375rem",
                    "font-weight": "600",
                    cursor: submitting() ? "not-allowed" : "pointer",
                    transition: "all 0.15s ease",
                    "box-shadow": submitting() ? "none" : "var(--shadow-glow)"
                  }}
                >
                  <Show when={!submitting()} fallback="Verifying…">
                    Enter Admin
                  </Show>
                </button>
              </form>
            </Show>

            {/* ════════════════════════════════════════════════════════════
                STATE B — visitor is NOT signed into CineLog
                Show Google sign-in button + (optional) email/password
                fallback form
            ════════════════════════════════════════════════════════════ */}
            <Show when={!session()?.email}>
              {/* Google OAuth button — primary path for OAuth users */}
              <button
                type="button"
                onClick={handleGoogle}
                disabled={oauthLoading()}
                style={{
                  width: "100%",
                  padding: "var(--sp-3) var(--sp-4)",
                  background: "#fff",
                  color: "#1f2937",
                  border: "1px solid #d1d5db",
                  "border-radius": "var(--radius-md)",
                  "font-size": "0.9375rem",
                  "font-weight": "600",
                  cursor: oauthLoading() ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  gap: "var(--sp-3)",
                  "margin-bottom": "var(--sp-4)"
                }}
              >
                <Show when={!oauthLoading()} fallback="Redirecting to Google…">
                  <GoogleIcon />
                  Sign in with Google
                </Show>
              </button>

              {/* Divider */}
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--sp-3)",
                  margin: "var(--sp-5) 0",
                  color: "var(--text-muted)",
                  "font-size": "0.75rem"
                }}
              >
                <div
                  style={{
                    flex: 1,
                    height: "1px",
                    background: "var(--hairline)"
                  }}
                />
                <span>OR USE EMAIL + PASSWORD</span>
                <div
                  style={{
                    flex: 1,
                    height: "1px",
                    background: "var(--hairline)"
                  }}
                />
              </div>

              {/* Toggle: show/hide the email+password form */}
              <Show
                when={showPasswordForm()}
                fallback={
                  <button
                    type="button"
                    onClick={() => setShowPasswordForm(true)}
                    style={{
                      width: "100%",
                      padding: "var(--sp-2) var(--sp-4)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      border: "1px dashed var(--hairline-2)",
                      "border-radius": "var(--radius-md)",
                      "font-size": "0.8125rem",
                      "font-weight": "500",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    Show email + password form
                  </button>
                }
              >
                <form onSubmit={handlePasswordSubmit} novalidate>
                  {/* Email */}
                  <div style={{ "margin-bottom": "var(--sp-4)" }}>
                    <label for="admin-email" style={labelStyle}>
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
                      style={inputStyle}
                    />
                  </div>

                  {/* Password */}
                  <div style={{ "margin-bottom": "var(--sp-4)" }}>
                    <label for="admin-password" style={labelStyle}>
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
                      style={inputStyle}
                    />
                  </div>

                  {/* PIN */}
                  <div style={{ "margin-bottom": "var(--sp-6)" }}>
                    <label for="admin-pin-pw" style={labelStyle}>
                      Admin PIN
                    </label>
                    <input
                      id="admin-pin-pw"
                      type="password"
                      inputmode="numeric"
                      autocomplete="off"
                      maxlength={6}
                      value={pin()}
                      onInput={(e) =>
                        setPin(
                          e.currentTarget.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                      disabled={submitting()}
                      placeholder="••••••"
                      required
                      style={{
                        ...inputStyle,
                        "letter-spacing": "0.5em",
                        "text-align": "center",
                        "font-family": "monospace"
                      }}
                    />
                    <p
                      style={{
                        "font-size": "0.75rem",
                        color: "var(--text-muted)",
                        margin: "var(--sp-2) 0 0 0"
                      }}
                    >
                      6-digit PIN set by the project owner
                    </p>
                  </div>

                  <Show when={error()}>
                    <ErrorBlock message={error()!} />
                  </Show>

                  <button
                    type="submit"
                    disabled={submitting()}
                    style={{
                      width: "100%",
                      padding: "var(--sp-3) var(--sp-4)",
                      background: submitting() ? "var(--tier-3)" : "var(--p)",
                      color: submitting()
                        ? "var(--text-muted)"
                        : "var(--on-primary)",
                      border: "none",
                      "border-radius": "var(--radius-md)",
                      "font-size": "0.9375rem",
                      "font-weight": "600",
                      cursor: submitting() ? "not-allowed" : "pointer",
                      transition: "all 0.15s ease",
                      "box-shadow": submitting() ? "none" : "var(--shadow-glow)"
                    }}
                  >
                    <Show when={!submitting()} fallback="Verifying…">
                      Sign In to Admin
                    </Show>
                  </button>
                </form>
              </Show>
            </Show>

            {/* Common error display for OAuth errors */}
            <Show when={error() && !session()?.email && !showPasswordForm()}>
              <div style={{ "margin-top": "var(--sp-4)" }}>
                <ErrorBlock message={error()!} />
              </div>
            </Show>
          </Show>

          {/* Footer */}
          <div style={{ "text-align": "center", "margin-top": "var(--sp-6)" }}>
            <a
              href="/discover"
              style={{
                "font-size": "0.8125rem",
                color: "var(--text-muted)",
                "text-decoration": "none"
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

// ─── Sub-components ───────────────────────────────────────────────

function LoadingBlock(props: { label: string }) {
  return (
    <div
      style={{
        padding: "var(--sp-8)",
        "text-align": "center",
        color: "var(--text-muted)",
        "font-size": "0.875rem"
      }}
    >
      <div style={{ "font-size": "1.5rem", "margin-bottom": "var(--sp-3)" }}>
        ⏳
      </div>
      {props.label}
    </div>
  );
}

function ErrorBlock(props: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        background: "rgba(239, 68, 68, 0.1)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        "border-radius": "var(--radius-md)",
        padding: "var(--sp-3)",
        "margin-bottom": "var(--sp-4)",
        "font-size": "0.8125rem",
        color: "rgb(252, 165, 165)"
      }}
    >
      {props.message}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      style={{ "flex-shrink": "0" }}
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export default AdminLoginPage;
