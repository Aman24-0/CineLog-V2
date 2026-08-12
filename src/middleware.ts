// src/middleware.ts
//
// CineLog V2 — SolidStart Server Middleware (Cookie-Scoped Supabase Client)
// ---------------------------------------------------------------------
// WHAT THIS MIDDLEWARE DOES:
//   1. `onRequest` — for EVERY incoming request, parse the `Cookie`
//      header (via `createServerClientFromRequest`, which uses the
//      `cookie` package's `parse()` for byte-identical decoding with
//      the browser client's `serialize()` writes).
//   2. Initialize a fresh `@supabase/ssr` server client bound to
//      those cookies.
//   3. Store the client + cookie jar on `event.locals.supabase`.
//
//   Any future server-side route that wants a request-scoped Supabase
//   client can read `event.locals.supabase`. Any cookie writes the
//   client makes are accumulated in the cookie jar, which the route
//   is responsible for flushing onto its outgoing `Response`.
//
// NOTE (Phase 7 Task 5 — client-side exchange revision):
//   The `/auth/callback` route NO LONGER consumes `event.locals.supabase`.
//   The PKCE code exchange was moved BACK to the browser (see
//   `src/routes/auth/callback.tsx` for the full rationale). This
//   middleware remains in place because:
//     1. It is a clean, official-`@supabase/ssr` pattern that any
//        future server-side route can opt into by reading
//        `event.locals.supabase`.
//     2. The other API routes (`/api/stats`, `/api/discover/taste`,
//        `/api/share-card`) currently call `createServerClientFromRequest`
//        directly — they could be migrated to read `event.locals.supabase`
//        to avoid re-parsing cookies per route, but that's a future
//        optimization, not a correctness issue.
//     3. It does NOT interfere with the `/auth/callback` route
//        rendering as a client component: the middleware only mutates
//        `event.locals` and does not return a `Response`, so SolidStart
//        proceeds to render the default-export Solid component normally.
//
// DEBUG LOGGING:
//   Set the `SUPABASE_DEBUG_COOKIE_LOG=1` env var to enable verbose
//   logging of every `getAll` / `setAll` call on the server cookie
//   adapter. The logs are prefixed with `[supabase-server-cookies]`.
//
// WHY `onRequest` ONLY (no `onBeforeResponse`):
//   The SolidStart `onBeforeResponse` hook's `response` param is typed
//   as `{ body? }` — it does not expose the outgoing Response's headers
//   in a way that's safe to mutate across all response shapes (streamed,
//   static, etc.). Instead, each route that uses `event.locals.supabase.client`
//   is responsible for flushing `event.locals.supabase.cookieJar` onto
//   the `Response` it returns.
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
 * Returns `true` when the `SUPABASE_DEBUG_COOKIE_LOG` env var is set
 * to "1" or "true". When enabled, the server cookie adapter (in
 * `src/lib/supabase/server.ts`) logs every `getAll` / `setAll` call.
 */
function isCookieDebugLoggingEnabled(): boolean {
  const flag =
    import.meta.env.SUPABASE_DEBUG_COOKIE_LOG ??
    (typeof process !== "undefined" && process.env?.SUPABASE_DEBUG_COOKIE_LOG);
  return flag === "1" || flag === "true";
}

/**
 * SolidStart auto-discovers `src/middleware.ts` and wires the default
 * export into the request pipeline. Every incoming request — SSR page
 * renders, API routes, the auth callback — passes through `onRequest`
 * before reaching its handler.
 *
 * NOTE: The `/auth/callback` route is now a client-side component (no
 * `GET` handler) and does NOT consume `event.locals.supabase`. This
 * middleware still runs on that route (it cannot selectively skip),
 * but it is a no-op for the callback's behavior — it only initializes
 * state on `event.locals` that the callback ignores. SolidStart then
 * renders the callback's default-export Solid component normally.
 */
export default createMiddleware({
  onRequest: async (event) => {
    try {
      // Phase 13 Chunk 1: createServerClientFromRequest is now async
      // because it may call `auth.setSession()` to inject a Bearer
      // token from the Authorization header (the browser sends this
      // header on every authenticated fetch since sessions live in
      // localStorage, not cookies).
      const { client, cookies } = await createServerClientFromRequest(
        event.request
      );
      event.locals.supabase = { client, cookieJar: cookies };

      if (isCookieDebugLoggingEnabled()) {
        if (process.env.NODE_ENV !== "production") {
          console.log(
            "[middleware] Supabase client initialized for",
            new URL(event.request.url).pathname,
            "— event.locals.supabase is set."
          );
        }
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
