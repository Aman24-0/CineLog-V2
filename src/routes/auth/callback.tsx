// src/routes/auth/callback.tsx
//
// CineLog V2 — OAuth / Email Confirmation Callback Route (CLIENT-SIDE exchange)
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
// PHASE 7 TASK 5 — REVISED: CLIENT-SIDE EXCHANGE (definitive fix)
// ─────────────────────────────────────────────────────────────────────
// HISTORY (why we ended up here):
//
//   Attempt 1: Original implementation ran `exchangeCodeForSession` in
//   the BROWSER via `onMount`. Worked for a while, then started failing
//   intermittently with "PKCE code verifier not found in storage" after
//   the Phase 7 migration to `@supabase/ssr` cookie storage.
//
//   Attempt 2 (commit 4101324): Moved the exchange to the SERVER via a
//   `GET` handler + SolidStart middleware. Reasoning: the `Cookie`
//   header the server receives should always contain the verifier
//   cookie (SameSite=Lax allows it on the top-level OAuth redirect).
//   FAILED in production — same "PKCE code verifier not found" error.
//
//   Attempt 3 (commit 35667e9): Rewrote the `@supabase/ssr` cookie
//   adapters from scratch with explicit `getAll` / `setAll` on both
//   browser and server, using the `cookie` package's `parse` / `serialize`
//   for byte-identical cookie bytes. Also enabled
//   `experimental.appendPkceFlowIdToRedirects` and added a fallback
//   retry without `flowId` for the legacy verifier key.
//   FAILED in production — same error on BOTH flowId-keyed AND
//   legacy-keyed lookups (see logs from user — both attempts returned
//   `AuthPKCECodeVerifierMissingError`).
//
// ROOT CAUSE (definitive):
//   The browser DID write the verifier cookie (the `setAll` adapter
//   called `document.cookie = serialize(...)` and we have no evidence
//   of that failing). But the SERVER never received it in the
//   incoming `Cookie` header on the OAuth callback request. The most
//   likely reasons:
//
//     • The cookie was set with attributes (path / SameSite / Secure /
//       partitioned) that caused the browser to NOT send it on the
//       cross-site → same-site top-level redirect.
//     • A reverse proxy (Vercel edge / Cloudflare) or service worker
//       stripped the cookie from the request headers before it reached
//       the SolidStart server.
//     • Mobile browser ITP / cookie partitioning caused the verifier
//       cookie to be scoped to a partition that didn't apply on the
//       OAuth redirect.
//
//   We cannot fix this from the server side — by the time the request
//   reaches our server, the cookie is already gone.
//
// FIX (this file):
//   Move the exchange BACK to the browser. The browser WROTE the
//   verifier cookie via `document.cookie` — when the OAuth redirect
//   lands on `/auth/callback` and the page's JS runs, `document.cookie`
//   reads return the same cookies the browser itself wrote (subject
//   only to the cookie's own attributes, which we control: path="/",
//   sameSite="lax", no httpOnly, secure on HTTPS).
//
//   Concretely: this route is a plain SolidStart client component
//   (NO `GET` server handler). On mount, it:
//     1. Reads `code` + `next` from `window.location.href`.
//     2. Calls `supabase.auth.exchangeCodeForSession(code)` using the
//        BROWSER client (`getBrowserClient`).
//     3. On success: `useNavigate()` to the `next` path (default
//        `/discover`).
//     4. On error: shows a branded error UI with the message.
//
//   The browser client's `cookies.getAll` adapter (see
//   `src/lib/supabase/browser.ts`) reads `document.cookie` directly —
//   so it WILL see the verifier cookie that the same client wrote
//   before the OAuth redirect.
//
// WHY THIS IS MORE RELIABLE THAN THE SERVER:
//   • No cross-process cookie handoff (browser → HTTP Cookie header →
//     server middleware → @supabase/ssr getAll adapter). Every step
//     in that chain is a place the cookie can be silently dropped.
//   • No SameSite / Secure / partitioned-cookie surprises — the
//     browser's `document.cookie` read returns cookies based on the
//     cookie's own attributes from the SAME ORIGIN, which is exactly
//     the context that wrote them.
//   • No reverse proxy / CDN stripping — the JS runs in the browser,
//     after all proxies have delivered the HTML.
//
// NOTE on `detectSessionInUrl`:
//   The browser client has `detectSessionInUrl: true`, which means
//   auth-js AUTOMATICALLY calls `exchangeCodeForSession` on mount of
//   the client. Our explicit `onMount` call below is therefore a
//   belt-and-suspenders measure: if auth-js already exchanged the
//   code, our call will fail with a "code already used" error and we
//   fall through to checking `getSession()` (which will return the
//   session that auth-js already established). This is why the
//   `getSession()` fallback is critical — it catches the case where
//   the exchange already happened implicitly.
//
// ─────────────────────────────────────────────────────────────────────
// WHY A SOLID COMPONENT (not a `GET` handler)?
// ─────────────────────────────────────────────────────────────────────
//   SolidStart route files can export HTTP method handlers (`GET`,
//   `POST`, …) OR a default-export Solid component. When a `GET`
//   handler is present, it runs INSTEAD of rendering the component.
//   We previously used a `GET` handler for the server-side exchange.
//
//   For the client-side exchange we MUST render the Solid component
//   (the `onMount` lifecycle hook only runs in the browser, after the
//   component hydrates). So we DELETE the `GET` handler export and
//   only export the default component. SolidStart will then:
//     1. Server-render the component's initial state (the loading
//        spinner) as HTML.
//     2. Send the HTML to the browser.
//     3. Hydrate the component on the client.
//     4. `onMount` fires → exchange runs → navigate away.
//
//   The middleware in `src/middleware.ts` still runs on this route
//   (it runs on every request) and still populates `event.locals.supabase`
//   for any other route that wants it — but this route no longer
//   consumes `event.locals.supabase`. The middleware does NOT
//   interfere with rendering because it only initializes state on
//   `event.locals`; it doesn't return a `Response` that would
//   short-circuit the route.
//

import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import {
  createSignal,
  onMount,
  Show,
  type Component
} from "solid-js";
import { getBrowserClient } from "~/lib/supabase/browser";

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
 * Check if an error message indicates a missing PKCE verifier.
 *
 * Used to decide whether to fall back to `getSession()` — if the
 * verifier is missing, the exchange failed BEFORE hitting Supabase's
 * token endpoint, so the auth code is NOT consumed. But there's a
 * chance `detectSessionInUrl` already exchanged it implicitly on
 * client hydration, in which case `getSession()` will return the
 * session and we can proceed.
 */
function isPkceVerifierError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("code verifier not found") ||
    (lower.includes("pkce") && lower.includes("verifier"))
  );
}

/**
 * The OAuth / email-confirmation callback page.
 *
 * Renders a branded loading spinner while the PKCE code exchange is
 * in flight, then either navigates to the `next` path (success) or
 * shows an error message (failure).
 *
 * This component runs its exchange logic in `onMount`, which only
 * fires in the browser (never during SSR). This is intentional — the
 * PKCE verifier cookie was written by the browser client and is most
 * reliably read back by the browser client.
 */
const AuthCallback: Component = () => {
  const navigate = useNavigate();

  // Three states: loading (initial), error (exchange failed), and
  // success (handled by navigate — no separate signal needed).
  const [status, setStatus] = createSignal<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = createSignal<string>("");

  onMount(async () => {
    // ── 1. Parse the URL ────────────────────────────────────────────
    // We use `window.location.href` (not `useNavigate`'s location)
    // because this is the URL Supabase redirected the browser to
    // after the OAuth flow — we need the raw `?code=...&next=...`
    // query params.
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const nextParam = url.searchParams.get("next");
    const target = getRedirectTarget(nextParam);

    // No code in the URL — the link was likely opened directly or is
    // stale. Show an error rather than navigating nowhere.
    if (!code) {
      console.warn(
        "[auth/callback] No `code` param in URL. Search params:",
        url.searchParams.toString()
      );
      setErrorMessage(
        "No authorization code was found in the URL. The link may be incomplete or expired."
      );
      setStatus("error");
      return;
    }

    // ── 2. Get the browser Supabase client ─────────────────────────
    // `getBrowserClient` returns the singleton browser client. Its
    // cookie adapter (`buildBrowserCookieAdapter` in browser.ts)
    // reads from `document.cookie` — so it WILL see the PKCE
    // verifier cookie that was written before the OAuth redirect.
    const supabase = getBrowserClient();

    // ── 3. Exchange the code for a session ─────────────────────────
    // We pass the code (and optionally the `sb_flow_id` if present)
    // to `exchangeCodeForSession`. The browser client's `getAll`
    // adapter reads `document.cookie`, finds the verifier, and
    // auth-js verifies it against the code.
    //
    // If `sb_flow_id` is in the URL, we pass it as `{ flowId }` so
    // auth-js reads from the flow-specific slot key
    // (`<storageKey>-flow-<flowId>-code-verifier`). This is the
    // modern approach enabled by `appendPkceFlowIdToRedirects: true`
    // on the browser client. If `sb_flow_id` is absent, auth-js
    // falls back to the legacy fixed key (which is dual-written
    // alongside the flow-specific slot — so both lookups should
    // succeed, but flowId is preferred).
    const flowId = url.searchParams.get("sb_flow_id");

    console.log(
      "[auth/callback] onMount exchange — code length:",
      code.length,
      "| has sb_flow_id:",
      !!flowId,
      "| next:",
      nextParam ?? "(none)"
    );

    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined
      );

      if (error) {
        console.warn(
          "[auth/callback] exchangeCodeForSession failed:",
          error.name,
          "—",
          error.message
        );

        // ── Fallback: PKCE verifier missing ──────────────────────
        // This can happen if `detectSessionInUrl: true` already
        // consumed the code on client hydration (race condition).
        // The verifier cookie is then deleted by auth-js, so our
        // explicit exchange sees "verifier missing". In that case,
        // the session IS already established — we just need to read
        // it via `getSession()`.
        if (isPkceVerifierError(error.message)) {
          console.info(
            "[auth/callback] PKCE verifier missing — checking for existing session (detectSessionInUrl may have already exchanged)…"
          );
          const { data: sessionData, error: sessionError } =
            await supabase.auth.getSession();
          if (sessionData?.session && !sessionError) {
            console.info(
              "[auth/callback] Existing session found after PKCE failure. Redirecting to",
              target
            );
            // Use `replace: true` so the callback URL isn't in the
            // browser history — pressing Back doesn't re-trigger the
            // exchange.
            navigate(target, { replace: true });
            return;
          }
          console.warn(
            "[auth/callback] No existing session found after PKCE failure."
          );
        }

        // Non-PKCE error (e.g. "invalid grant" — code expired) OR
        // PKCE error with no existing session — show the error UI.
        setErrorMessage(error.message);
        setStatus("error");
        return;
      }

      // ── 4. Success — navigate to the target path ─────────────────
      // `data.session` and `data.user` are now populated. The session
      // cookies have been written to `document.cookie` by the browser
      // client's `setAll` adapter (sb-access-token, sb-refresh-token).
      // The next page load will be authenticated.
      console.log(
        "[auth/callback] Exchange succeeded. Session present:",
        !!data.session,
        "| User present:",
        !!data.user,
        "| Redirecting to",
        target
      );
      navigate(target, { replace: true });
    } catch (err) {
      // Unexpected runtime error (e.g. network failure during the
      // token exchange HTTP request). Surface it to the user — the
      // message will be generic but at least signals something went
      // wrong.
      console.error("[auth/callback] Unexpected error during exchange:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during sign-in.";
      setErrorMessage(msg);
      setStatus("error");
    }
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
