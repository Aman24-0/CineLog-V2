// src/routes/auth/callback.tsx
//
// CineLog V2 — OAuth / Email Confirmation Callback Route (Phase 7 Task 5 fix)
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
// PHASE 7 TASK 5 FIX — SERVER-SIDE EXCHANGE (was: browser-side)
// ─────────────────────────────────────────────────────────────────────
// BUG (production):
//   After migrating to `@supabase/ssr` with cookie storage, Google
//   OAuth sign-in failed with "PKCE code verifier not found in storage".
//
// ROOT CAUSE:
//   The previous implementation ran `exchangeCodeForSession` on the
//   BROWSER (in `onMount`). The browser client (`@supabase/ssr`'s
//   `createBrowserClient`) stores the PKCE code_verifier in a cookie
//   via `document.cookie`. However, the browser client's cookie
//   adapter was not reliably round-tripping the verifier cookie
//   across the OAuth redirect — especially when the verifier cookie
//   was set with attributes (path / SameSite / partitioned) that
//   caused it to be missing from `document.cookie` on the callback
//   page. The result: `exchangeCodeForSession` couldn't find the
//   verifier and failed.
//
// FIX:
//   Move the exchange to the SERVER. The SolidStart middleware
//   (`src/middleware.ts`) initializes a `@supabase/ssr` server client
//   bound to the incoming Request's cookies and stores it on
//   `event.locals.supabase`. This route's `GET` handler reads that
//   client, calls `exchangeCodeForSession(code)`, and commits the
//   resulting session cookies (collected in the cookie jar) to the
//   outgoing 302 redirect `Response`.
//
//   The server reads the PKCE verifier cookie directly from the
//   `Cookie` header (which the browser ALWAYS sends on a same-origin
//   top-level navigation — SameSite=Lax allows it). This is strictly
//   more reliable than the browser reading it from `document.cookie`,
//   because:
//     1. The `Cookie` header is the raw bytes the browser sent —
//        no `httpOnly` / JS-readability concerns.
//     2. The server doesn't depend on the browser client's cookie
//        adapter being correctly configured on the callback page.
//     3. This is the exact pattern `@supabase/ssr`'s docs recommend
//        for every SSR framework (Next.js, Remix, SvelteKit).
//
// PROGRESSIVE UX (preserved):
//   The previous client-side UI showed a "Signing you in…" spinner
//   while the exchange was in flight. With the server-side exchange,
//   the entire exchange happens before the response is sent — the
//   user sees Google's redirect → instantly /discover. No spinner
//   is needed because there's no client-side async work.
//
//   On FAILURE, the server renders a branded HTML error page (dark
//   theme, matching the app) with the error message and a "Back to
//   CineLog" link. This preserves the error UX without requiring
//   client-side JS.
//
// PKCE VERIFIER MISSING — GRACEFUL RECOVERY:
//   If `exchangeCodeForSession` fails with a PKCE verifier error
//   (e.g. the cookie was consumed by a previous attempt, or the
//   browser blocked it), we check `getSession()`. If a valid session
//   already exists (e.g. the OAuth flow succeeded on a previous
//   attempt and the session cookie is set), we treat the login as
//   successful and redirect. Only when BOTH the exchange fails AND
//   no session exists is the error page shown.
//
// ─────────────────────────────────────────────────────────────────────
// WHY A `GET` HANDLER (not a Solid component with onMount)?
// ─────────────────────────────────────────────────────────────────────
//   SolidStart route files can export HTTP method handlers (`GET`,
//   `POST`, …). When a request matches the route's path AND method,
//   the handler runs INSTEAD of rendering the default-export Solid
//   component. The handler runs on the server, has access to the
//   `Request` (and `event.locals` set by the middleware), and
//   returns a `Response`.
//
//   This is exactly what we need: the OAuth callback is a server-side
//   redirect endpoint, not a user-facing page. Returning a 302
//   `Response` with `Set-Cookie` headers is the correct primitive.

import type { APIEvent } from "@solidjs/start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createServerClientFromRequest,
  type CookieJar
} from "~/lib/supabase/server";

/**
 * Check if an error message indicates a missing PKCE verifier.
 * Supabase returns this when the code_verifier cookie was cleared
 * or never set (e.g. user cleared browser cache mid-flow, or the
 * cookie was set with attributes that prevented it from being sent
 * on the OAuth redirect).
 *
 * Case-insensitive — matches both the exact message and common
 * variations.
 */
function isPkceVerifierError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("code verifier not found") ||
    (lower.includes("pkce") && lower.includes("verifier"))
  );
}

/**
 * Determine the redirect target from the `next` search param.
 * Only allows relative paths starting with "/" to prevent open
 * redirect attacks. Defaults to "/discover".
 */
function getRedirectTarget(next: string | null): string {
  return typeof next === "string" && next.startsWith("/") ? next : "/discover";
}

/**
 * Escape a string for safe inclusion in HTML text content.
 * Prevents XSS when interpolating user-controlled or error messages
 * into the error page HTML.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build a 302 redirect `Response` with the cookie jar's `Set-Cookie`
 * headers + Cache-Control / Expires / Pragma response headers attached.
 *
 * The `Set-Cookie` headers contain the session cookies (access_token +
 * refresh_token) written by `exchangeCodeForSession` via the server
 * client's `setAll` cookie adapter. Without flushing them here, the
 * session would be lost — the browser would never receive the cookies
 * and the next request would be unauthenticated.
 *
 * The Cache-Control / Expires / Pragma headers are emitted by
 * `@supabase/ssr` whenever auth cookies are written. They instruct
 * CDNs and browsers NOT to cache this response (because it contains
 * per-user auth cookies — caching would leak one user's session to
 * another).
 */
function buildRedirectResponse(
  target: string,
  cookieJar: CookieJar
): Response {
  const headers = new Headers();
  headers.set("Location", target);
  // Append each Set-Cookie header (using `append` so multiple cookies
  // are emitted as separate Set-Cookie headers, not concatenated).
  for (const setCookie of cookieJar.toSetCookieHeaders()) {
    headers.append("Set-Cookie", setCookie);
  }
  // Apply Cache-Control / Expires / Pragma — these OVERRIDE any
  // default we might set because supabase's "no-cache" headers are
  // stricter (correct — a response that sets auth cookies must NOT
  // be cached).
  for (const [key, value] of Object.entries(cookieJar.getResponseHeaders())) {
    headers.set(key, value);
  }
  return new Response(null, { status: 302, headers });
}

/**
 * Render a branded HTML error page for the auth callback failure case.
 *
 * This is a static HTML string (no client-side JS) so it works even
 * if the app bundle fails to load. The styling matches the app's dark
 * theme so the error doesn't feel like a foreign page.
 *
 * The `target` is the URL the "Back to CineLog" link points to
 * (defaults to "/discover").
 */
function renderErrorPage(message: string, target: string): Response {
  const safeMessage = escapeHtml(message);
  const safeTarget = escapeHtml(target);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Sign-in failed \u00b7 CineLog</title>
  <meta name="theme-color" content="#0a0a0a" />
  <style>
    *,*::before,*::after { box-sizing: border-box; }
    body {
      margin: 0;
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
    .card {
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
    .icon {
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
    h1 {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0 0 0.5rem;
      color: #fca5a5;
    }
    p {
      font-size: 0.875rem;
      line-height: 1.5;
      color: rgba(250,250,250,0.65);
      margin: 0 0 1.5rem;
      word-break: break-word;
    }
    .actions { display: flex; flex-direction: column; gap: 0.5rem; align-items: center; }
    a.primary {
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
    a.primary:hover { background: #4f46e5; }
    a.secondary {
      color: rgba(250,250,250,0.5);
      font-size: 0.8125rem;
      text-decoration: none;
    }
    a.secondary:hover { color: rgba(250,250,250,0.8); }
  </style>
</head>
<body>
  <main class="card" role="alert">
    <div class="icon" aria-hidden="true">\u26a0</div>
    <h1>Sign-in failed</h1>
    <p>${safeMessage}</p>
    <div class="actions">
      <a class="primary" href="${safeTarget}">Back to CineLog</a>
      <a class="secondary" href="/discover">Go to discover</a>
    </div>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Don't cache the error page — the underlying issue may be
      // resolved on the next attempt (e.g. the user re-tries OAuth).
      "Cache-Control": "no-store, max-age=0"
    }
  });
}

/**
 * Resolve the request-scoped Supabase client + cookie jar.
 *
 * Prefers the client initialized by `src/middleware.ts` (stored on
 * `event.locals.supabase`). If the middleware didn't run or failed
 * (e.g. env vars missing during a misconfigured deploy), falls back
 * to creating one directly from the request. Both paths produce an
 * equivalent client — the middleware just avoids re-parsing the
 * Cookie header on every call site.
 */
function resolveSupabase(
  event: APIEvent
): { client: SupabaseClient; cookieJar: CookieJar } {
  if (event.locals.supabase) {
    return {
      client: event.locals.supabase.client,
      cookieJar: event.locals.supabase.cookieJar
    };
  }
  // Fallback: middleware didn't populate event.locals.supabase.
  // This shouldn't happen in production, but handles the edge case
  // gracefully (e.g. if the middleware file is accidentally deleted
  // or the env is misconfigured).
  const direct = createServerClientFromRequest(event.request);
  return { client: direct.client, cookieJar: direct.cookies };
}

/**
 * GET /auth/callback?code=...&next=/path
 *
 * Server-side PKCE code exchange + redirect.
 *
 *   1. Read `code` + `next` from the URL.
 *   2. Resolve the request-scoped supabase client (from middleware).
 *   3. Call `exchangeCodeForSession(code)` — Supabase verifies the
 *      PKCE code_verifier (read from the request's cookies) and
 *      returns the session. The session cookies are written to the
 *      cookie jar via the server client's `setAll` adapter.
 *   4. On success: 302 redirect to `next` with Set-Cookie headers.
 *   5. On PKCE verifier error: check `getSession()` — if a valid
 *      session already exists (e.g. from a previous attempt),
 *      redirect. Otherwise, render the error page.
 *   6. On other errors: render the error page.
 */
export async function GET(event: APIEvent): Promise<Response> {
  const url = new URL(event.request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const target = getRedirectTarget(next);

  if (!code) {
    return renderErrorPage(
      "No authorization code was found in the URL. The link may be incomplete or expired.",
      target
    );
  }

  const { client, cookieJar } = resolveSupabase(event);

  try {
    // ── Step 1: Exchange the PKCE code for a session ──────────────
    // The server client reads the code_verifier from the request's
    // cookies (via the `getAll` adapter). Supabase verifies the
    // verifier against the code, and if valid, returns the session.
    // The session cookies (sb-access-token, sb-refresh-token) are
    // written to the cookie jar via the `setAll` adapter.
    console.log(
      "[auth/callback] Calling exchangeCodeForSession with code length:",
      code.length
    );
    const exchangeResult = await client.auth.exchangeCodeForSession(code);
    console.log(
      "[auth/callback] exchangeCodeForSession result —",
      "error:",
      exchangeResult.error
        ? `${exchangeResult.error.name}: ${exchangeResult.error.message}`
        : "(none)",
      "| session present:",
      !!exchangeResult.data?.session,
      "| user present:",
      !!exchangeResult.data?.user
    );

    const { error: exchangeError } = exchangeResult;

    if (!exchangeError) {
      // Success — flush the session cookies to the redirect Response.
      const setCookies = cookieJar.toSetCookieHeaders();
      console.log(
        "[auth/callback] Exchange succeeded. Flushing",
        setCookies.length,
        "Set-Cookie headers to the redirect response. Cookie names:",
        setCookies
          .map((h) => h.split("=")[0])
          .join(", ") || "(none)"
      );
      return buildRedirectResponse(target, cookieJar);
    }

    // ── Step 2: PKCE verifier missing — check for existing session ─
    // When the PKCE code_verifier cookie is missing (e.g. consumed by
    // a previous attempt, or blocked by the browser), the exchange
    // fails. But the OAuth flow may have ALREADY succeeded on a
    // previous attempt — Supabase created the session and the session
    // cookie is present. We check `getSession()` to recover.
    if (isPkceVerifierError(exchangeError.message)) {
      console.warn(
        "[auth/callback] PKCE verifier missing, checking for existing session\u2026"
      );
      const { data: sessionData } = await client.auth.getSession();
      if (sessionData?.session) {
        console.info(
          "[auth/callback] Valid session found after PKCE failure. Treating login as successful."
        );
        return buildRedirectResponse(target, cookieJar);
      }
      console.warn(
        "[auth/callback] No valid session found after PKCE failure. Login failed."
      );
    } else {
      // Non-PKCE error (e.g. "invalid grant" — code already used or
      // expired). Check for existing session as a fallback.
      console.warn(
        "[auth/callback] exchangeCodeForSession failed:",
        exchangeError.message,
        "\u2014 checking for existing session\u2026"
      );
      const { data: sessionData } = await client.auth.getSession();
      if (sessionData?.session) {
        console.info(
          "[auth/callback] Valid session found despite exchange error. Redirecting."
        );
        return buildRedirectResponse(target, cookieJar);
      }
    }

    // ── All recovery attempts failed — show error page ────────────
    console.error(
      "[auth/callback] All authentication attempts failed:",
      exchangeError.message
    );
    return renderErrorPage(
      exchangeError.message ||
        "We couldn\u2019t verify your account. The link may have expired.",
      target
    );
  } catch (err) {
    console.error("[auth/callback] Unexpected error:", err);
    return renderErrorPage(
      err instanceof Error
        ? err.message
        : "An unexpected error occurred during sign-in.",
      target
    );
  }
}
