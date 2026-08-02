// src/routes/auth/callback.tsx
//
// CineLog V2 — OAuth / Email Confirmation Callback Route
// ---------------------------------------------------------------------
// This route is the `emailRedirectTo` / OAuth `redirectTo` target for:
//   • Email confirmation links (signup verification)
//   • Password reset links
//   • OAuth sign-in callbacks (Google, etc.)
//   • Magic link sign-in
//
// Supabase sends the user back to `${origin}/auth/callback?code=...`
// after the user clicks the confirmation link in their email or
// completes the OAuth flow on the provider's site. The `code` is a
// PKCE authorization code that must be exchanged for a session via
// `supabase.auth.exchangeCodeForSession(code)`.
//
// PKCE VERIFIER MISSING — GRACEFUL RECOVERY (v2 fix):
// ---------------------------------------------------------------------
// BUG: After logout + clear browser cache + login, the PKCE code
// verifier cookie is missing from localStorage. This causes
// `exchangeCodeForSession()` to return:
//   { error: { message: "PKCE code verifier not found." } }
//
// However, the Supabase auth flow has ALREADY succeeded — the OAuth
// provider confirmed the user's identity and Supabase created the
// session. The only thing that failed was the CLIENT-SIDE PKCE
// verifier check (which is a localStorage cookie that was cleared).
//
// The user sees "PKCE code verifier not found." error, presses
// "Back to CineLog", and everything works — because the session
// IS valid, it just wasn't exchanged via PKCE.
//
// FIX: When `exchangeCodeForSession()` fails with a PKCE verifier
// error, immediately check `supabase.auth.getSession()`. If a valid
// session exists, treat the login as successful and redirect. Only
// show the error page when BOTH the exchange fails AND no
// authenticated session exists.
//
// PROGRESSIVE UX:
// ---------------------------------------------------------------------
// Instead of immediately showing errors, the UI progresses through:
//   1. "Signing you in…" — initial exchangeCodeForSession attempt
//   2. "Checking session…" — getSession fallback after PKCE error
//   3. "Finalizing authentication…" — session found, preparing redirect
//   4. "Redirecting…" — about to navigate away
//
// Only after EVERY check fails is the error page shown.
//
// SSR-SAFETY:
//   The Supabase browser client stores sessions in localStorage, so
//   we MUST run `exchangeCodeForSession` on the browser. We guard
//   with `isServer` and render a loading spinner during SSR — the
//   actual exchange happens in `onMount` on the client.

import { Title } from "@solidjs/meta";
import {
  useNavigate,
  useSearchParams,
  A
} from "@solidjs/router";
import {
  Show,
  createSignal,
  onMount,
  type Component
} from "solid-js";
import { isServer } from "solid-js/web";
import { getClient } from "~/lib/supabase/client";

/**
 * Progressive status messages shown to the user during the auth flow.
 * Each message corresponds to a step in the authentication pipeline,
 * giving the user confidence that something is happening rather than
 * staring at a static spinner.
 */
type AuthStep =
  | "exchanging"   // Step 1: Calling exchangeCodeForSession
  | "checking"     // Step 2: Calling getSession fallback
  | "finalizing"   // Step 3: Session found, preparing redirect
  | "redirecting"  // Step 4: About to navigate away
  | "done";        // Terminal: error state

const STEP_LABELS: Record<AuthStep, string> = {
  exchanging: "Signing you in\u2026",
  checking: "Checking session\u2026",
  finalizing: "Finalizing authentication\u2026",
  redirecting: "Redirecting\u2026",
  done: ""
};

/**
 * Check if an error message indicates a missing PKCE verifier.
 * Supabase returns this when the code_verifier cookie was cleared
 * from localStorage (e.g., user cleared browser cache mid-flow).
 *
 * The check is case-insensitive and matches both the exact message
 * and common variations.
 */
function isPkceVerifierError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("code verifier not found") ||
    lower.includes("pkce") && lower.includes("verifier")
  );
}

/**
 * Determine the redirect target from the `next` search param.
 * Only allows relative paths starting with "/" to prevent open
 * redirect attacks.
 *
 * Solid Router's searchParams can return `string | string[] | undefined`
 * for array-style query params. We only accept a single string.
 */
function getRedirectTarget(
  next: string | string[] | undefined | null
): string {
  return typeof next === "string" && next.startsWith("/") ? next : "/discover";
}

const AuthCallback: Component = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = createSignal<string | null>(null);
  const [step, setStep] = createSignal<AuthStep>("exchanging");

  onMount(async () => {
    // Skip on the server — exchangeCodeForSession only works on the
    // browser where it can write to localStorage.
    if (isServer) return;

    const code = searchParams.code;
    const next = searchParams.next;

    if (!code || typeof code !== "string") {
      setError(
        "No authorization code was found in the URL. The link may be incomplete or expired."
      );
      setStep("done");
      return;
    }

    const target = getRedirectTarget(next);

    try {
      const supabase = getClient();

      // ── Step 1: Exchange the PKCE code for a session ────────────
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);

      if (!exchangeError) {
        // Success — session is now stored in localStorage. Redirect.
        setStep("redirecting");
        window.location.assign(target);
        return;
      }

      // ── Step 2: PKCE verifier missing — check for existing session
      //
      // When the PKCE code verifier is missing from localStorage (e.g.,
      // the user cleared browser cache between the OAuth redirect and
      // the callback), `exchangeCodeForSession` fails. But the OAuth
      // flow may have ALREADY succeeded — Supabase's server created
      // the session, and the browser may have received it via a
      // different mechanism (e.g., the auth cookie set by the
      // redirect). We check `getSession()` to see if a valid session
      // already exists.
      if (isPkceVerifierError(exchangeError.message)) {
        console.warn(
          "[auth/callback] PKCE verifier missing, checking for existing session\u2026"
        );
        setStep("checking");

        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (!sessionError && sessionData?.session) {
          // Valid session exists — login is successful.
          console.info(
            "[auth/callback] Valid session found after PKCE failure. Treating login as successful."
          );
          setStep("finalizing");

          // Small delay so the user sees "Finalizing authentication…"
          // before the redirect. This gives a sense of completion.
          await new Promise((r) => setTimeout(r, 300));

          setStep("redirecting");
          window.location.assign(target);
          return;
        }

        // No session found — the login truly failed. Fall through
        // to the error page.
        console.warn(
          "[auth/callback] No valid session found after PKCE failure. Login failed."
        );
      } else {
        // Non-PKCE error (e.g., "invalid grant" — code already used
        // or expired). Check for existing session as a fallback — in
        // some cases the code was already exchanged on a previous
        // attempt and the session is still valid.
        console.warn(
          "[auth/callback] exchangeCodeForSession failed:",
          exchangeError.message,
          "\u2014 checking for existing session\u2026"
        );
        setStep("checking");

        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (!sessionError && sessionData?.session) {
          console.info(
            "[auth/callback] Valid session found despite exchange error. Redirecting."
          );
          setStep("finalizing");
          await new Promise((r) => setTimeout(r, 300));
          setStep("redirecting");
          window.location.assign(target);
          return;
        }
      }

      // ── All recovery attempts failed — show error ───────────────
      console.error(
        "[auth/callback] All authentication attempts failed:",
        exchangeError.message
      );
      setError(
        exchangeError.message ||
          "We couldn\u2019t verify your account. The link may have expired."
      );
      setStep("done");
    } catch (err) {
      console.error("[auth/callback] Unexpected error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during sign-in."
      );
      setStep("done");
    }
  });

  // Current label to display based on the auth step
  const currentLabel = () => STEP_LABELS[step()];

  return (
    <div
      class="flex min-h-[100dvh] items-center justify-center px-4"
      style={{
        background: "var(--bg-base)",
        color: "var(--text-strong)"
      }}
    >
      <Title>Signing you in · CineLog</Title>
      <div
        class="flex w-full max-w-md flex-col items-center rounded-3xl p-8 text-center"
        style={{
          background: "var(--glass-bg-strong)",
          "backdrop-filter": "blur(28px)",
          "-webkit-backdrop-filter": "blur(28px)",
          border: "1px solid var(--hairline)",
          "box-shadow": "var(--shadow-elevated)"
        }}
      >
        {/* Loading / progressive states — shown while authenticating */}
        <Show when={step() !== "done"}>
          <div
            class="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            style={{
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.25)"
            }}
            aria-hidden="true"
          >
            <span
              class="material-symbols-outlined animate-spin"
              style={{
                "font-size": "24px",
                color: "var(--accent-primary, #818cf8)"
              }}
            >
              progress_activity
            </span>
          </div>
          <h1
            class="type-headline mb-2"
            style={{ "font-size": "1.125rem", margin: 0 }}
          >
            {currentLabel()}
          </h1>
          <p class="type-body-soft" style={{ "font-size": "0.875rem" }}>
            {step() === "exchanging"
              ? "Verifying your account. You\u2019ll be redirected in a moment."
              : step() === "checking"
                ? "Looking for an existing session\u2026"
                : step() === "finalizing"
                  ? "Almost there\u2026"
                  : "You\u2019ll be redirected in a moment."}
          </p>
        </Show>

        {/* Error state — shown only when ALL authentication attempts fail */}
        <Show when={step() === "done" && error()}>
          <div
            class="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            style={{
              background: "rgba(248, 113, 113, 0.1)",
              border: "1px solid rgba(248, 113, 113, 0.25)"
            }}
            aria-hidden="true"
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "24px", color: "#f87171" }}
            >
              error
            </span>
          </div>
          <h1
            class="type-headline mb-2"
            style={{ "font-size": "1.125rem", margin: 0, color: "#fca5a5" }}
          >
            Sign-in failed
          </h1>
          <p class="type-body-soft" style={{ "font-size": "0.875rem" }}>
            {error()}
          </p>
          <div class="mt-6 flex flex-col gap-2">
            <A
              href="/discover"
              class="btn-primary focus-ring"
              aria-label="Back to discover"
            >
              Back to CineLog
            </A>
            <button
              type="button"
              class="btn-ghost focus-ring"
              onClick={() => navigate("/discover")}
            >
              Try again
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default AuthCallback;
