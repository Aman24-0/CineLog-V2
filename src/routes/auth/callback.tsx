// src/routes/auth/callback.tsx
//
// CineLog V2 — OAuth / Email Confirmation Callback Route (EXPLICIT EXCHANGE)
// ---------------------------------------------------------------------
// This route is the `emailRedirectTo` / OAuth `redirectTo` target for:
//   • Email confirmation links (signup verification)
//   • Password reset links
//   • OAuth sign-in callbacks (Google, etc.)
//   • Magic link sign-in
//
// Supabase sends the user back to `${origin}/auth/callback?code=...[&sb_flow_id=...]`
// after the user clicks the confirmation link in their email or completes
// the OAuth flow on the provider's site. The `code` is a PKCE authorization
// code that must be exchanged for a session via
// `supabase.auth.exchangeCodeForSession(code, { flowId })`.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 7 TASK 14 — EXPLICIT EXCHANGE (definitive fix)
// ─────────────────────────────────────────────────────────────────────
// HISTORY (why we ended up here):
//
//   Attempt 1: Browser-side exchange via onMount + exchangeCodeForSession.
//   FAILED — "PKCE code verifier not found in storage" (no flowId).
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
//   calls `exchangeCodeForSession` on client hydration, which raced
//   with our explicit `onMount` call.
//
//   Attempt 5 (commit before this one): Made the callback "passive" —
//   removed the manual exchange, relied ENTIRELY on `detectSessionInUrl`
//   to auto-exchange, just listened for `onAuthStateChange`.
//   FAILED in production — `INITIAL_SESSION` arrived with `session: null`
//   and `SIGNED_IN` never fired. The auto-exchange was failing SILENTLY
//   (auth-js swallows the rejection, only logs to console) and our
//   component waited 10s then timed out with a generic error.
//
// ROOT CAUSE (definitive):
//   `detectSessionInUrl: true` runs DURING client construction (BEFORE
//   our `onMount`). When the auto-exchange fails, auth-js logs the error
//   but does NOT propagate it — `onAuthStateChange` only fires
//   `INITIAL_SESSION` with null session. We had no way to see the actual
//   error message, no way to surface it to the user, and no way to
//   recover (the code was already consumed/destroyed).
//
// FIX (this file + `src/lib/supabase/browser.ts`):
//   1. Set `detectSessionInUrl: false` on the browser client. This
//      eliminates the silent auto-exchange — no more race, no more
//      swallowed errors.
//   2. In this callback component's `onMount`, MANUALLY call
//      `exchangeCodeForSession(code, { flowId })` with a try/catch.
//      On success → navigate to `next`.
//      On failure → display the ACTUAL error message (so we can finally
//      see WHY the exchange is failing).
//   3. Keep the 10s timeout as a safety net (in case the exchange
//      hangs — should never happen, but defensive).
//   4. Also set up `onAuthStateChange` as a backup trigger (in case
//      the exchange succeeds but `exchangeCodeForSession` returns
//      before the session is fully persisted in cookies — the
//      `SIGNED_IN` event will fire and we navigate).
//
//   This gives us:
//     • No race condition (only ONE exchanger — our manual call).
//     • Real error messages (try/catch surfaces the actual rejection).
//     • Defensive timeout + listener (covers edge cases).
//
// ─────────────────────────────────────────────────────────────────────
// WHY A SOLID COMPONENT (not a `GET` handler)?
// ─────────────────────────────────────────────────────────────────────
//   SolidStart route files can export HTTP method handlers (`GET`,
//   `POST`, …) OR a default-export Solid component. We render the
//   Solid component because:
//     1. The `onMount` lifecycle hook only runs in the browser
//        (after hydration), which is exactly when we need to call
//        `exchangeCodeForSession` (the browser wrote the verifier
//        cookie, so the browser must read it back).
//     2. The loading spinner + error UI need to render as HTML for
//        SSR, then hydrate on the client.
//     3. We avoid the cross-site cookie loss that plagued the
//        server-side exchange attempts (the server saw the verifier
//        cookie missing because the browser hadn't sent it on the
//        cross-site OAuth redirect — SameSite=Lax allows it but
//        some browsers / privacy modes were dropping it).
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
 * How long to wait for the manual `exchangeCodeForSession` call to
 * complete before showing the "Sign-in failed" error UI.
 *
 * 10 seconds is generous — the exchange is a single HTTP POST to
 * Supabase's token endpoint, which normally completes in <1s even on
 * slow mobile connections. The extra buffer covers:
 *   • Slow 3G / flaky mobile network.
 *   • Cold start of the Supabase auth service.
 *   • The browser's hydration latency (parsing + evaluating the JS
 *     bundle before our `onMount` even fires).
 *
 * If 10 seconds pass with no completion, something is wrong (e.g. the
 * fetch is hanging, the SDK is stuck). We surface a generic error
 * message and let the user retry.
 */
const AUTH_EXCHANGE_TIMEOUT_MS = 10_000;

/**
 * The OAuth / email-confirmation callback page.
 *
 * Calls `exchangeCodeForSession(code, { flowId })` explicitly in
 * `onMount`. See the file header for the full rationale.
 */
const AuthCallback: Component = () => {
  const navigate = useNavigate();

  // Two states: loading (initial) and error (exchange failed or timed out).
  // Success is handled by navigate() — no separate signal needed.
  const [status, setStatus] = createSignal<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = createSignal<string>("");

  onMount(() => {
    // ── 1. Parse the URL for `code`, `sb_flow_id`, and `next` ───────
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const flowId = url.searchParams.get("sb_flow_id");
    const nextParam = url.searchParams.get("next");
    const target = getRedirectTarget(nextParam);
    const errorParam = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    console.log(
      "[auth/callback] onMount — explicit exchange mode. next:",
      nextParam ?? "(none)",
      "| target:",
      target,
      "| has code:",
      !!code,
      "| has sb_flow_id:",
      !!flowId,
      "| has error param:",
      !!errorParam
    );

    // ── 2. If Supabase sent an error param, surface it immediately ──
    // The OAuth provider or Supabase may redirect back with
    // `?error=access_denied&error_description=...` if the user denied
    // consent or something went wrong on the provider side. In that
    // case there's no `code` to exchange — we just show the error.
    if (errorParam) {
      const msg =
        errorDescription ||
        errorParam ||
        "The OAuth provider returned an error.";
      console.error(
        "[auth/callback] OAuth provider returned error:",
        errorParam,
        "— description:",
        errorDescription
      );
      setErrorMessage(msg);
      setStatus("error");
      return;
    }

    // ── 3. If no `code`, we can't exchange — show error immediately ──
    // This should never happen in practice (the callback URL is only
    // reached with a `code`), but defensive: a user might manually
    // navigate to `/auth/callback` without a code.
    if (!code) {
      console.error(
        "[auth/callback] No `code` parameter in URL — cannot exchange."
      );
      setErrorMessage(
        "No authorization code was found in the URL. Please try signing in again."
      );
      setStatus("error");
      return;
    }

    // ── 4. Get the browser Supabase client ─────────────────────────
    // `getBrowserClient` returns the singleton browser client. With
    // `detectSessionInUrl: false` (set in `src/lib/supabase/browser.ts`),
    // the client does NOT auto-exchange the code — we do it manually
    // below. This is the ONLY code path that exchanges.
    const supabase = getBrowserClient();

    // ── 5. Set up the 10-second timeout (safety net) ───────────────
    // If `exchangeCodeForSession` doesn't resolve within 10s, something
    // is wrong (network hang, SDK stuck). Show the error UI.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let didComplete = false;

    timeoutId = setTimeout(() => {
      if (didComplete) return;
      console.error(
        "[auth/callback] Timed out after",
        AUTH_EXCHANGE_TIMEOUT_MS,
        "ms waiting for exchangeCodeForSession to resolve."
      );
      setErrorMessage(
        "Sign-in timed out. The authorization code may have expired, or the network is too slow. Please try again."
      );
      setStatus("error");
    }, AUTH_EXCHANGE_TIMEOUT_MS);

    // ── 6. Set up onAuthStateChange as a BACKUP success trigger ────
    // `exchangeCodeForSession` resolves with `{ data: { session, user },
    // error: null }` on success. But in some edge cases (e.g. cookie
    // write latency), the session is set in storage BEFORE the promise
    // resolves, and `onAuthStateChange` fires `SIGNED_IN` slightly
    // earlier. Listening for it lets us redirect the user the instant
    // the session is available, with no perceptible delay.
    //
    // We also listen for `INITIAL_SESSION` with a non-null session as
    // a further fallback (covers the case where the session was already
    // in cookies from a prior tab — rare but possible).
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
          if (didComplete) return;
          didComplete = true;
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

    // ── 7. Call exchangeCodeForSession manually ────────────────────
    // This is the PRIMARY code path. We pass `{ flowId }` if
    // `sb_flow_id` is in the URL — this tells the SDK to look up the
    // verifier in the flow-specific slot (the modern, reliable
    // approach). Without flowId, it falls back to the legacy
    // `<storageKey>-code-verifier` key (which has dual-write race
    // issues in some browsers).
    //
    // The promise resolves with `{ data: { session, user }, error }`.
    // On success, `session` is non-null and we navigate. On failure,
    // `error` is non-null and we display the ACTUAL error message
    // (this is the whole point of the explicit exchange — we finally
    // get to see WHY it's failing).
    (async () => {
      try {
        console.log(
          "[auth/callback] Calling exchangeCodeForSession — flowId:",
          flowId ?? "(none)"
        );

        const { data, error } = await supabase.auth.exchangeCodeForSession(
          code,
          flowId ? { flowId } : undefined
        );

        if (didComplete) return; // listener already navigated

        if (error) {
          didComplete = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }
          console.error(
            "[auth/callback] exchangeCodeForSession returned error:",
            error.name,
            "—",
            error.message,
            "(status:",
            error.status ?? "n/a",
            ")"
          );
          setErrorMessage(
            error.message ||
              "The authorization code could not be exchanged. Please try again."
          );
          setStatus("error");
          return;
        }

        if (data?.session) {
          didComplete = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }
          console.info(
            "[auth/callback] exchangeCodeForSession succeeded — redirecting to",
            target
          );
          navigate(target, { replace: true });
          return;
        }

        // No error and no session — unusual but not impossible (the
        // session may arrive via the onAuthStateChange listener
        // shortly). We do nothing here and let the listener or the
        // timeout handle it.
        console.warn(
          "[auth/callback] exchangeCodeForSession resolved with no error and no session — waiting for onAuthStateChange."
        );
      } catch (err) {
        if (didComplete) return;
        didComplete = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "An unexpected error occurred during sign-in.";
        console.error(
          "[auth/callback] exchangeCodeForSession threw:",
          err instanceof Error ? err : JSON.stringify(err)
        );
        setErrorMessage(msg);
        setStatus("error");
      }
    })();

    // ── 8. Cleanup on unmount ──────────────────────────────────────
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
