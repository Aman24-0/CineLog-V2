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
// Without this route, every confirmation email link 404s — the user
// clicks the link, sees a 404 page, and has no idea their account
// was actually confirmed (it was, on the Supabase side, but the
// client never got the session).
//
// FLOW:
//   1. Read `code` and `next` from the URL search params.
//   2. If `code` is missing → show an error.
//   3. Call `supabase.auth.exchangeCodeForSession(code)`.
//   4. On success → redirect to `next` (default: `/discover`).
//   5. On error → show an error message with a "Back to sign-in" link.
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

const AuthCallback: Component = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<"loading" | "done">("loading");

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
      setStatus("done");
      return;
    }

    try {
      const supabase = getClient();
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        // Common errors:
        //   - "invalid request: invalid grant"  → code already used or expired
        //   - "code verifier not found"         → PKCE verifier cookie missing
        //     (browser cleared cookies mid-flow)
        console.error(
          "[auth/callback] exchangeCodeForSession failed:",
          exchangeError.message
        );
        setError(
          exchangeError.message ||
            "We couldn't verify your account. The link may have expired."
        );
        setStatus("done");
        return;
      }

      // Success — session is now stored in localStorage. Redirect
      // to the `next` URL or default to /discover.
      // Use a hard navigation (window.location) instead of navigate()
      // because the auth state change needs to propagate through the
      // root layout's onSessionChange listener before the new page
      // renders. A soft navigation would render the new page with
      // the old (signed-out) auth state for one frame.
      const target =
        typeof next === "string" && next.startsWith("/")
          ? next
          : "/discover";
      window.location.assign(target);
    } catch (err) {
      console.error("[auth/callback] Unexpected error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during sign-in."
      );
      setStatus("done");
    }
  });

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
        <Show when={status() === "loading"}>
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
            Signing you in…
          </h1>
          <p class="type-body-soft" style={{ "font-size": "0.875rem" }}>
            Verifying your account. You'll be redirected in a moment.
          </p>
        </Show>

        <Show when={status() === "done" && error()}>
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
