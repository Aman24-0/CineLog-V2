// src/routes/auth/callback.tsx
//
// CineLog V2 — OAuth / Email Confirmation Callback Route (DUMB LISTENER)
// ---------------------------------------------------------------------
// This route is the `emailRedirectTo` / OAuth `redirectTo` target for:
//   • Email confirmation links (signup verification)
//   • Password reset links
//   • OAuth sign-in callbacks (Google, etc.)
//   • Magic link sign-in
//
// Supabase sends the user back to `${origin}/auth/callback?code=...`
// after the user clicks the confirmation link in their email or
// completes the OAuth flow on the provider's site.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 7 TASK 15 — DUMB LISTENER (localStorage-based client)
// ─────────────────────────────────────────────────────────────────────
// HISTORY (6 prior failed attempts — see the git log):
//
//   Attempts 1–5 all used `@supabase/ssr`'s `createBrowserClient` with
//   a `document.cookie`-backed adapter for session + PKCE verifier
//   storage. They failed on mobile browsers because:
//     • SameSite=Lax cookies were dropped on the cross-site OAuth
//       redirect (provider → supabase → /auth/callback) in some
//       mobile Safari ITP configurations and Chrome Android incognito.
//     • The PKCE code_verifier cookie was written by the browser but
//       not consistently readable on the callback → "PKCE code verifier
//       not found" on every OAuth attempt.
//
//   Attempt 6 (Task 14, commit 0a3d1fe) disabled `detectSessionInUrl`
//   and called `exchangeCodeForSession` manually with try/catch. This
//   was supposed to surface the real error — but the underlying cookie
//   loss was still happening, so the error was still
//   "PKCE code verifier not found". The cookie adapter was the problem,
//   not the exchange call.
//
// ROOT CAUSE (definitive, Task 15):
//   `@supabase/ssr`'s cookie-based browser storage is fundamentally
//   incompatible with mobile browsers' stricter cookie policies. No
//   amount of cookie adapter tuning (path, sameSite, domain, secure,
//   httpOnly) can fix this — the cookies are dropped at the browser
//   level, not by our code.
//
// FIX (Task 15):
//   1. `src/lib/supabase/browser.ts` now uses the STANDARD
//      `createClient` from `@supabase/supabase-js` with
//      `storage: globalThis.localStorage`. localStorage is first-party
//      only and NEVER blocked by SameSite/ITP/third-party cookie
//      policies. The PKCE verifier is stored in localStorage, where
//      it survives the cross-site OAuth redirect reliably.
//
//   2. `detectSessionInUrl: true` is enabled on the client. auth-js
//      AUTOMATICALLY parses `?code=` from the URL on client hydration
//      and calls `exchangeCodeForSession(code)` internally. It reads
//      the verifier from localStorage (where it wrote it before the
//      redirect) and exchanges the code.
//
//   3. This callback component is now completely DUMB. It does NOT
//      call `exchangeCodeForSession` manually. It does NOT read `code`
//      or `sb_flow_id` from the URL. It only:
//        a. Renders a branded loading spinner.
//        b. Sets up an `onAuthStateChange` listener on mount.
//        c. When `SIGNED_IN` fires (or `INITIAL_SESSION` with a
//           non-null session), navigates to `/discover`.
//        d. 15-second safety-net timeout — if no session is detected,
//           shows an error so the user isn't stuck on a spinner forever.
//
//   This is the official Supabase-recommended pattern for SPA OAuth
//   callbacks. With localStorage as the storage backend, the
//   `detectSessionInUrl` auto-exchange is reliable (no more silent
//   failures like in Task 13, because the verifier is actually in
//   storage this time).
//
// ─────────────────────────────────────────────────────────────────────
// WHY NO `next` PARAM?
// ─────────────────────────────────────────────────────────────────────
// Previous versions read a `?next=<path>` query param to decide where
// to redirect after the exchange (e.g. `?next=/admin/login`). We've
// removed that — the callback now ALWAYS navigates to `/discover`.
//
//   • Simplifies the contract: the callback URL is always exactly
//     `${origin}/auth/callback` (no query string), which makes
//     Supabase's redirect URL allowlist easier to manage.
//   • The `?next=` param was only ever used by `admin/login.tsx` to
//     return to the admin login page after OAuth — but admin users
//     can navigate manually, and the security implication of allowing
//     an arbitrary `next` param (open-redirect risk) outweighs the
//     minor UX convenience.
//   • If we need per-page redirect targets in the future, we can
//     re-add the param — but for now, `/discover` for everyone.
//

import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import {
  createSignal,
  onMount,
  onCleanup,
  Show,
  type Component
} from "solid-js";
import { getBrowserClient } from "~/lib/supabase/browser";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

/**
 * How long to wait for `detectSessionInUrl` to complete the PKCE
 * exchange before showing the "Sign-in failed" error UI.
 *
 * 15 seconds is generous — the exchange is a single HTTP POST to
 * Supabase's token endpoint, which normally completes in <1s even on
 * slow mobile connections. The extra buffer covers:
 *   • Slow 3G / flaky mobile network.
 *   • Cold start of the Supabase auth service.
 *   • The browser's hydration latency (parsing + evaluating the JS
 *     bundle before auth-js even starts the exchange).
 *   • Mobile browsers' stricter resource loading policies (which can
 *     delay script evaluation by a few seconds on cold loads).
 *
 * If 15 seconds pass with no `SIGNED_IN` event, something is wrong
 * (e.g. the code expired, the verifier is missing from localStorage,
 * or the Supabase project is misconfigured). We surface a generic
 * error message and let the user retry.
 */
const AUTH_EXCHANGE_TIMEOUT_MS = 15_000;

/**
 * The OAuth / email-confirmation callback page.
 *
 * This component is intentionally "dumb" — it does NOT call
 * `exchangeCodeForSession` manually. The browser client (configured
 * with `detectSessionInUrl: true` in `src/lib/supabase/browser.ts`)
 * handles the entire exchange automatically. This component just:
 *   1. Renders a loading spinner.
 *   2. Listens for `onAuthStateChange`.
 *   3. Navigates to `/discover` when `SIGNED_IN` (or `INITIAL_SESSION`
 *      with a session) fires.
 *   4. Shows an error after 15 seconds if nothing happened.
 */
const AuthCallback: Component = () => {
  const navigate = useNavigate();

  // Two states: loading (initial) and error (timeout).
  // Success is handled by navigate() — no separate signal needed.
  const [status, setStatus] = createSignal<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = createSignal<string>("");

  onMount(() => {
    console.log(
      "[auth/callback] onMount — dumb listener mode. " +
        "Waiting for detectSessionInUrl + onAuthStateChange..."
    );

    // ── 1. Get the browser Supabase client ─────────────────────────
    // `getBrowserClient` returns the singleton browser client. Its
    // `detectSessionInUrl: true` config means auth-js AUTOMATICALLY
    // parses `?code=...` from the URL on client hydration and calls
    // `exchangeCodeForSession(code)` internally. The verifier is read
    // from `localStorage` (where it was written before the OAuth
    // redirect). We don't need to do ANYTHING — just listen for the
    // resulting auth state change.
    const supabase = getBrowserClient();

    // ── 2. Set up the 15-second safety-net timeout ─────────────────
    // If no `SIGNED_IN` / `INITIAL_SESSION` event fires within 15
    // seconds, something went wrong with the exchange. Show the
    // error UI so the user isn't stuck on a spinner forever.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let didSucceed = false;

    timeoutId = setTimeout(() => {
      if (didSucceed) return;
      console.error(
        "[auth/callback] Timed out after",
        AUTH_EXCHANGE_TIMEOUT_MS,
        "ms waiting for SIGNED_IN event. The PKCE exchange via " +
          "detectSessionInUrl may have failed."
      );
      setErrorMessage(
        "Sign-in timed out. The authorization code may have expired, " +
          "or the session could not be persisted. Please try again."
      );
      setStatus("error");
    }, AUTH_EXCHANGE_TIMEOUT_MS);

    // ── 3. Set up the onAuthStateChange listener ───────────────────
    // auth-js fires `INITIAL_SESSION` on client load (after
    // `detectSessionInUrl` has processed the URL) and `SIGNED_IN`
    // when a new session is established. Both events carry the
    // session object — if it's non-null, the exchange succeeded.
    //
    // We listen for BOTH events because:
    //   • `INITIAL_SESSION` fires first if the exchange completed
    //     BEFORE our listener was registered (race with hydration).
    //     In that case, the session is already in localStorage and
    //     the initial event carries it.
    //   • `SIGNED_IN` fires when the exchange completes AFTER our
    //     listener is registered. This is the normal case when the
    //     exchange takes >0ms (which it always does — it's an HTTP
    //     POST).
    //
    // Listening for either event with a non-null session covers
    // both timing windows.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        console.log(
          "[auth/callback] onAuthStateChange — event:",
          event,
          "| session present:",
          !!session,
          "| user present:",
          !!session?.user
        );

        if (
          (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
          session
        ) {
          didSucceed = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }
          console.info(
            "[auth/callback] Session detected via",
            event,
            "— redirecting to /discover"
          );
          // Use `replace: true` so the callback URL isn't in the
          // browser history — pressing Back doesn't re-trigger the
          // exchange.
          navigate("/discover", { replace: true });
        }
      }
    );

    // ── 4. Cleanup on unmount ──────────────────────────────────────
    // When the component unmounts (either because we navigated away
    // OR because SolidStart tore down the route), unsubscribe the
    // auth listener and clear the timeout. Without this, the listener
    // would leak across route changes and the timeout could fire on
    // an unrelated page.
    onCleanup(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      authListener?.subscription?.unsubscribe?.();
    });
  });

  return (
    <>
      <Title>Signing you in · CineLog</Title>
      <div class="auth-callback-root">
        <Show
          when={status() === "loading"}
          fallback={
            <div class="auth-callback-card" role="alert">
              <div class="auth-callback-icon" aria-hidden="true">
                ⚠
              </div>
              <h1 class="auth-callback-title">Sign-in failed</h1>
              <p class="auth-callback-message">
                Sign-in failed: {errorMessage()}
              </p>
              <div class="auth-callback-actions">
                <a class="auth-callback-primary" href="/discover">
                  Back to CineLog
                </a>
                <button
                  type="button"
                  class="auth-callback-secondary"
                  onClick={() => navigate("/discover", { replace: true })}
                >
                  Try again
                </button>
              </div>
            </div>
          }
        >
          <div class="auth-callback-card">
            <div class="auth-callback-spinner" aria-label="Signing you in" />
            <h1 class="auth-callback-title">Signing you in…</h1>
            <p class="auth-callback-message">
              You'll be redirected in a moment.
            </p>
          </div>
        </Show>
      </div>
    </>
  );
};

export default AuthCallback;

// ─────────────────────────────────────────────────────────────────────
// Scoped styles for the callback page.
// We use plain CSS (not a CSS module) because this page is rare (only
// hits on OAuth redirects) and keeping the styles inline avoids a
// network round-trip for a tiny stylesheet. The styles are scoped to
// the `.auth-callback-*` class prefix and inserted via a `<style>` tag
// in the document head by SolidStart's `inline` style mechanism.
//
// The dark theme matches the rest of the app (#0a0a0a bg, glass card).
// ─────────────────────────────────────────────────────────────────────
const style = `
.auth-callback-root {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: #0a0a0a;
  color: #fafafa;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.auth-callback-card {
  max-width: 28rem;
  width: 100%;
  text-align: center;
  padding: 2rem;
  border-radius: 1.5rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
}
.auth-callback-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 9999px;
  background: rgba(248,113,113,0.10);
  border: 1px solid rgba(248,113,113,0.25);
  margin-bottom: 1rem;
  font-size: 1.5rem;
  color: #f87171;
  line-height: 1;
}
.auth-callback-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  color: #fca5a5;
}
.auth-callback-message {
  font-size: 0.875rem;
  line-height: 1.5;
  color: rgba(250,250,250,0.65);
  margin: 0 0 1.5rem;
  word-break: break-word;
}
.auth-callback-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
}
.auth-callback-primary {
  display: inline-block;
  padding: 0.625rem 1.25rem;
  border-radius: 0.75rem;
  background: #6366f1;
  color: #fff;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.15s ease;
}
.auth-callback-primary:hover { background: #4f46e5; }
.auth-callback-secondary {
  color: rgba(250,250,250,0.5);
  font-size: 0.8125rem;
  text-decoration: none;
  /* Reset button defaults so it looks like the secondary link it
     replaced. We use a <button> so we can call
     navigate("/discover", { replace: true }) instead of reloading. */
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}
.auth-callback-secondary:hover { color: rgba(250,250,250,0.8); }
.auth-callback-spinner {
  width: 2rem;
  height: 2rem;
  margin: 0 auto 1rem;
  border: 2px solid rgba(255,255,255,0.15);
  border-top-color: #6366f1;
  border-radius: 9999px;
  animation: auth-callback-spin 0.8s linear infinite;
}
@keyframes auth-callback-spin {
  to { transform: rotate(360deg); }
}
`;

// Inject the styles into the document head. This runs once per page
// load (the module is evaluated when the component is first imported).
// Using a `<style>` tag with a unique `data-` attribute makes it
// idempotent — HMR or route re-renders won't insert duplicates.
if (typeof document !== "undefined") {
  const STYLE_ID = "auth-callback-styles";
  if (!document.getElementById(STYLE_ID)) {
    const styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = style;
    document.head.appendChild(styleEl);
  }
}
