// src/routes/auth/callback.tsx
//
// CineLog V2 — OAuth / Email Confirmation Callback Route (PASSIVE LISTENER)
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
// ─────────────────────────────────────────────────────────────────────
// PHASE 7 TASK 5 — REVISED v2: PASSIVE LISTENER (definitive fix)
// ─────────────────────────────────────────────────────────────────────
// HISTORY (why we ended up here):
//
//   Attempt 1: Browser-side exchange via onMount + exchangeCodeForSession.
//   FAILED — "PKCE code verifier not found in storage".
//
//   Attempt 2: Server-side exchange via SolidStart middleware + GET
//   handler. FAILED — same PKCE error (verifier cookie lost in
//   cross-site redirect).
//
//   Attempt 3: Rewrote @supabase/ssr cookie adapters + flow-specific
//   verifier lookup + SW cache bust. FAILED — same error on both
//   flowId-keyed AND legacy-keyed lookups.
//
//   Attempt 4 (commit 1c0ccc0): Moved exchange BACK to browser via
//   onMount + exchangeCodeForSession. FAILED — race condition:
//   `detectSessionInUrl: true` on the browser client AUTOMATICALLY
//   calls `exchangeCodeForSession` on client hydration, which races
//   with our explicit `onMount` call. One of them consumes the code
//   first; the other fails with "code already used" or
//   "PKCE verifier not found" (because the verifier cookie is
//   deleted after a successful exchange).
//
// ROOT CAUSE (definitive):
//   The browser client is configured with `detectSessionInUrl: true`
//   (see src/lib/supabase/browser.ts). When the client hydrates on a
//   URL containing `?code=...`, auth-js AUTOMATICALLY parses the code
//   from the URL and calls `exchangeCodeForSession` internally. This
//   is the official, Supabase-recommended way to handle OAuth
//   callbacks in a SPA — the callback page does NOT need to call
//   `exchangeCodeForSession` manually.
//
//   Our previous onMount block was calling `exchangeCodeForSession`
//   AT THE SAME TIME as auth-js's automatic `detectSessionInUrl`
//   exchange. The two calls raced each other:
//     • If auth-js won the race: our call failed with
//       "PKCE verifier not found" (verifier was deleted after the
//       successful exchange). We then fell back to `getSession()`,
//       which returned the session — but this was fragile and
//       depended on timing.
//     • If our call won the race: auth-js's automatic exchange then
//       failed with "code already used" (we consumed it first), and
//       auth-js logged a confusing error to the console.
//
// FIX (this file):
//   Make the callback component completely PASSIVE. It does NOT call
//   `exchangeCodeForSession`. It only:
//     1. Renders a branded loading spinner.
//     2. Sets up an `onAuthStateChange` listener on mount.
//     3. When auth-js fires `SIGNED_IN` or `INITIAL_SESSION` with a
//        valid session (which happens after `detectSessionInUrl`
//        completes the exchange), navigates to the `next` path.
//     4. If no session is detected within 10 seconds, shows the
//        "Sign-in failed" error UI.
//
//   This eliminates the race entirely — only ONE code path exchanges
//   the code (auth-js's automatic `detectSessionInUrl`), and our
//   component just observes the resulting auth state change.
//
// WHY THIS IS THE CORRECT PATTERN:
//   • The Supabase docs for SPA OAuth recommend exactly this:
//     configure `detectSessionInUrl: true` and let auth-js handle
//     the exchange. The callback page is a UI shell that waits for
//     the exchange to complete and then redirects.
//   • No race condition is possible — there's only one exchanger.
//   • No "code already used" errors — auth-js is the only caller.
//   • No "PKCE verifier not found" errors from our code — we never
//     read the verifier; auth-js reads it once, atomically, on
//     hydration.
//
// ─────────────────────────────────────────────────────────────────────
// WHY A SOLID COMPONENT (not a `GET` handler)?
// ─────────────────────────────────────────────────────────────────────
//   SolidStart route files can export HTTP method handlers (`GET`,
//   `POST`, …) OR a default-export Solid component. We render the
//   Solid component because:
//     1. The `onMount` lifecycle hook only runs in the browser
//        (after hydration), which is exactly when auth-js's
//        `detectSessionInUrl` runs.
//     2. The `onAuthStateChange` listener must be registered on the
//        browser client — server-side registration doesn't make sense
//        (the server has no persistent connection to the browser).
//     3. The loading spinner + error UI need to render as HTML for
//        SSR, then hydrate on the client.
//
//   The middleware in `src/middleware.ts` still runs on this route
//   (it runs on every request) but does NOT interfere — it only
//   initializes `event.locals.supabase` for any future server-side
//   route that wants it; it doesn't return a `Response`.
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
 * Determine the redirect target from the `next` search param.
 *
 * Only allows relative paths starting with "/" to prevent open-redirect
 * attacks (e.g. `?next=https://evil.com` would otherwise redirect the
 * user to a phishing site). Falls back to `/discover` when `next` is
 * missing, empty, or not a safe relative path.
 *
 * We ALSO block paths that start with `//` — these are interpreted by
 * browsers as protocol-relative URLs (e.g. `//evil.com` →
 * `https://evil.com`), which would bypass the simple `startsWith("/")`
 * check.
 */
function getRedirectTarget(nextParam: string | null): string {
  if (
    typeof nextParam !== "string" ||
    nextParam.length === 0 ||
    !nextParam.startsWith("/") ||
    nextParam.startsWith("//")
  ) {
    return "/discover";
  }
  return nextParam;
}

/**
 * How long to wait for `detectSessionInUrl` to complete the PKCE
 * exchange before showing the "Sign-in failed" error UI.
 *
 * 10 seconds is generous — the exchange is a single HTTP POST to
 * Supabase's token endpoint, which normally completes in <1s even on
 * slow mobile connections. The extra buffer covers:
 *   • Slow 3G / flaky mobile network.
 *   • Cold start of the Supabase auth service.
 *   • The browser's hydration latency (parsing + evaluating the JS
 *     bundle before auth-js even starts the exchange).
 *
 * If 10 seconds pass with no `SIGNED_IN` event, something is wrong
 * (e.g. the code expired, the verifier cookie was lost, or the
 * Supabase project is misconfigured). We surface a generic error
 * message and let the user retry.
 */
const AUTH_EXCHANGE_TIMEOUT_MS = 10_000;

/**
 * The OAuth / email-confirmation callback page.
 *
 * Renders a branded loading spinner while `detectSessionInUrl`
 * (configured on the browser client) performs the PKCE exchange
 * automatically. Listens for the resulting `SIGNED_IN` /
 * `INITIAL_SESSION` auth state change and navigates to the `next`
 * path. If no session is detected within 10 seconds, shows an error.
 *
 * This component is intentionally "dumb" — it does NOT call
 * `exchangeCodeForSession` manually. That was the source of the race
 * condition that caused "PKCE code verifier not found" and
 * "code already used" errors. See the file header for the full
 * rationale.
 */
const AuthCallback: Component = () => {
  const navigate = useNavigate();

  // Two states: loading (initial) and error (timeout or no code).
  // Success is handled by navigate() — no separate signal needed.
  const [status, setStatus] = createSignal<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = createSignal<string>("");

  onMount(() => {
    // ── 1. Parse the URL for the `next` redirect target ────────────
    // We DON'T read `code` or `sb_flow_id` — auth-js's
    // `detectSessionInUrl` will parse them itself. We only need
    // `next` so we know where to redirect after the exchange.
    const url = new URL(window.location.href);
    const nextParam = url.searchParams.get("next");
    const target = getRedirectTarget(nextParam);

    console.log(
      "[auth/callback] onMount — passive listener mode. next:",
      nextParam ?? "(none)",
      "| target:",
      target,
      "| has code in URL:",
      url.searchParams.has("code"),
      "| has sb_flow_id:",
      url.searchParams.has("sb_flow_id")
    );

    // ── 2. Get the browser Supabase client ─────────────────────────
    // `getBrowserClient` returns the singleton browser client. Its
    // `detectSessionInUrl: true` config means auth-js ALREADY started
    // parsing the `?code=...` from the URL on client hydration —
    // possibly even before our onMount fires. We just need to listen
    // for the resulting auth state change.
    const supabase = getBrowserClient();

    // ── 3. Set up the 10-second timeout ────────────────────────────
    // If no `SIGNED_IN` / `INITIAL_SESSION` event fires within 10
    // seconds, something went wrong with the exchange. Show the
    // error UI so the user isn't stuck on a spinner forever.
    //
    // We store the timeout id so we can cancel it in the success
    // path (and in onCleanup) — otherwise the timeout would fire
    // AFTER we've navigated away, calling setStatus on an unmounted
    // component (Solid handles this gracefully, but it's wasteful
    // and would log a confusing warning).
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let didSucceed = false;

    timeoutId = setTimeout(() => {
      if (didSucceed) return;
      console.error(
        "[auth/callback] Timed out after",
        AUTH_EXCHANGE_TIMEOUT_MS,
        "ms waiting for SIGNED_IN / INITIAL_SESSION event. The PKCE exchange may have failed silently."
      );
      setErrorMessage(
        "Sign-in timed out. The authorization code may have expired, or the browser blocked the session cookie. Please try again."
      );
      setStatus("error");
    }, AUTH_EXCHANGE_TIMEOUT_MS);

    // ── 4. Set up the onAuthStateChange listener ───────────────────
    // auth-js fires `INITIAL_SESSION` on client load (after
    // `detectSessionInUrl` has processed the URL) and `SIGNED_IN`
    // when a new session is established. Both events carry the
    // session object — if it's non-null, the exchange succeeded.
    //
    // We listen for BOTH events because:
    //   • `INITIAL_SESSION` fires first if the exchange completed
    //     BEFORE our listener was registered (race with hydration).
    //     In that case, the session is already in storage and the
    //     initial event carries it.
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
            "— redirecting to",
            target
          );
          // Use `replace: true` so the callback URL isn't in the
          // browser history — pressing Back doesn't re-trigger the
          // exchange.
          navigate(target, { replace: true });
        }
      }
    );

    // ── 5. Cleanup on unmount ──────────────────────────────────────
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
      // `authListener.subscription.unsubscribe()` is the official
      // way to tear down an onAuthStateChange listener (see
      // https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
      // The optional chaining guards against the edge case where
      // `supabase.auth.onAuthStateChange` returned a malformed
      // result (it never does in practice, but TS wants it).
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
     replaced (was an <a href="/auth/login">). We use a <button> so
     we can call navigate("/discover", { replace: true }) instead of
     reloading the current error URL — which caused a 404 because
     /auth/login doesn't exist as a route. */
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
