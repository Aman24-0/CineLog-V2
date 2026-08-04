// src/middleware.ts
//
// CineLog V2 — SolidStart Server Middleware (Cookie-Scoped Supabase Client)
// ---------------------------------------------------------------------
// BUG BEING FIXED:
//   After the Phase 7 migration to `@supabase/ssr` with cookie storage,
//   Google OAuth sign-in fails with "PKCE code verifier not found in
//   storage". The root cause: the server-side Supabase client was not
//   seeing the PKCE code_verifier cookie (set by the browser client
//   when `signInWithOAuth` was called) because the cookie adapter was
//   not properly round-tripping cookies between the browser and server.
//
// WHAT THIS MIDDLEWARE DOES:
//   1. `onRequest` — for EVERY incoming request, parse the `Cookie`
//      header (via `createServerClientFromRequest`, which uses the
//      `cookie` package's `parse()` for byte-identical decoding with
//      the browser client's `serialize()` writes).
//   2. Initialize a fresh `@supabase/ssr` server client bound to
//      those cookies.
//   3. Store the client + cookie jar on `event.locals.supabase`.
//   4. Routes (especially `/auth/callback`) read `event.locals.supabase`
//      to get a request-scoped client that can see the PKCE verifier
//      cookie. Any cookie writes the client makes (e.g. the session
//      cookies set by `exchangeCodeForSession`) are accumulated in the
//      cookie jar, which the route flushes to its outgoing `Response`.
//
// DEBUG LOGGING:
//   Set the `SUPABASE_DEBUG_COOKIE_LOG=1` env var to enable verbose
//   logging of every `getAll` / `setAll` call on the server cookie
//   adapter. The logs are prefixed with `[supabase-server-cookies]`
//   and show:
//     • `getAll()` — the number of cookies on the request + a summary
//       of auth-relevant cookie names (values are NOT logged).
//     • `setAll()` — each cookie being queued for the response
//       (name, value length, secure flag, httpOnly flag).
//
//   Additionally, this middleware ALWAYS logs a one-line summary of
//   the incoming request's cookie count when the path is `/auth/callback`
//   — so you can immediately see whether the PKCE verifier cookie
//   arrived without needing to enable full debug logging. This is
//   the smallest possible debug aid for the OAuth flow.
//
// WHY A MIDDLEWARE (not just per-route init):
//   • The auth callback needs the client BEFORE it renders — a server
//     route's `GET` handler is the first code that runs for the
//     `/auth/callback?code=...` request, so the client must already
//     exist by then.
//   • Future SSR pages can read `event.locals.supabase` to personalize
//     server-rendered HTML without each page re-parsing the Cookie
//     header.
//   • `@supabase/ssr`'s official docs for every SSR framework (Next,
//     Remix, SvelteKit) recommend this exact middleware pattern.
//
// WHY `onRequest` ONLY (no `onBeforeResponse`):
//   The SolidStart `onBeforeResponse` hook's `response` param is typed
//   as `{ body? }` — it does not expose the outgoing Response's headers
//   in a way that's safe to mutate across all response shapes (streamed,
//   static, etc.). Instead, each route that uses `event.locals.supabase.client`
//   is responsible for flushing `event.locals.supabase.cookieJar` onto
//   the `Response` it returns. The auth callback does this explicitly
//   (see `src/routes/auth/callback.tsx`).
//
// FAILURE MODE:
//   If the Supabase env vars (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)
//   are missing — which can happen during build or in a misconfigured
//   env — `createServerClientFromRequest` throws. We catch + log here
//   and leave `event.locals.supabase` undefined. Routes that need
//   Supabase check for its presence and fall back to a direct
//   `createServerClientFromRequest(event.request)` call.
//

import { createMiddleware } from "@solidjs/start/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createServerClientFromRequest,
  type CookieJar
} from "~/lib/supabase/server";

/**
 * Per-request Supabase context stored on `event.locals`.
 *
 *   client     — a fresh `@supabase/ssr` server client bound to the
 *                incoming request's cookies. Reads auth state (session,
 *                PKCE verifier) from the Cookie header. Writes (token
 *                refresh, session exchange) go to `cookieJar`.
 *   cookieJar  — accumulates Set-Cookie headers + Cache-Control /
 *                Expires / Pragma response headers emitted by the
 *                supabase client. Routes flush these onto their
 *                outgoing `Response` so refreshed tokens persist on
 *                the browser and CDNs don't cache per-user responses.
 */
export interface SupabaseRequestContext {
  client: SupabaseClient;
  cookieJar: CookieJar;
}

// ── Augment the global App namespace so TypeScript knows about
//    `event.locals.supabase`. SolidStart's `FetchEvent.locals` is
//    typed as `App.RequestEventLocals`, so declaring this interface
//    globally makes the property visible everywhere `event.locals`
//    is accessed.
//
//    The property is OPTIONAL because the middleware may fail to
//    create the client (e.g. missing env vars during build). Routes
//    that need it must null-check before use.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace App {
    interface RequestEventLocals {
      supabase?: SupabaseRequestContext;
    }
  }
}

/**
 * Check whether a URL path is the OAuth callback. Used to gate the
 * always-on debug log so we can see the PKCE verifier arriving
 * without enabling full cookie debug logging.
 */
function isAuthCallbackPath(pathname: string): boolean {
  return pathname === "/auth/callback" || pathname.startsWith("/auth/callback?");
}

/**
 * Returns `true` when the `SUPABASE_DEBUG_COOKIE_LOG` env var is set
 * to "1" or "true". When enabled, the server cookie adapter (in
 * `src/lib/supabase/server.ts`) logs every `getAll` / `setAll` call.
 */
function isCookieDebugLoggingEnabled(): boolean {
  const flag =
    (import.meta as any).env?.SUPABASE_DEBUG_COOKIE_LOG ??
    (typeof process !== "undefined" && process.env?.SUPABASE_DEBUG_COOKIE_LOG);
  return flag === "1" || flag === "true";
}

/**
 * SolidStart auto-discovers `src/middleware.ts` and wires the default
 * export into the request pipeline. Every incoming request — SSR page
 * renders, API routes, the auth callback — passes through `onRequest`
 * before reaching its handler.
 */
export default createMiddleware({
  onRequest: (event) => {
    const url = new URL(event.request.url);
    const isCallback = isAuthCallbackPath(url.pathname);
    const cookieHeader = event.request.headers.get("cookie") ?? "";

    // Always log on the auth callback path — this is the diagnostic
    // aid the user asked for. We log the cookie NAMES (not values,
    // which may contain session tokens / the PKCE verifier).
    if (isCallback) {
      const cookieNames = cookieHeader
        ? cookieHeader
            .split(";")
            .map((c) => c.trim().split("=")[0])
            .filter(Boolean)
        : [];
      console.log(
        "[middleware] /auth/callback incoming request —",
        cookieNames.length,
        "cookies:",
        cookieNames.join(", ") || "(none)",
        "| has code param:",
        url.searchParams.has("code"),
        "| has flow_id param:",
        url.searchParams.has("flow_id")
      );
    }

    try {
      const { client, cookies } = createServerClientFromRequest(
        event.request
      );
      event.locals.supabase = { client, cookieJar: cookies };

      if (isCallback && isCookieDebugLoggingEnabled()) {
        // The adapter's own getAll() will log the detailed summary
        // when debug logging is enabled — here we just confirm the
        // middleware initialized the client.
        console.log(
          "[middleware] Supabase client initialized for /auth/callback. event.locals.supabase is set."
        );
      }
    } catch (err) {
      // Don't crash the request — log and let downstream routes handle
      // the missing client. This keeps the server alive even if the
      // Supabase env vars are temporarily missing (e.g. during a
      // misconfigured deploy). Routes that need Supabase will either
      // fall back to `createServerClientFromRequest` directly or
      // return a clear error.
      console.error(
        "[middleware] Failed to initialize Supabase server client:",
        err instanceof Error ? err.message : err
      );
    }
  }
});
