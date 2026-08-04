// src/middleware.ts
//
// CineLog V2 — SolidStart Server Middleware (Phase 7 Task 5 fix)
// ---------------------------------------------------------------------
// BUG BEING FIXED:
//   After the Phase 7 migration to `@supabase/ssr` with cookie storage,
//   Google OAuth sign-in fails with "PKCE code verifier not found in
//   storage". The root cause: the `/auth/callback` route and the SSR
//   server entry were not sharing the Request/Response cookie adapters
//   with the Supabase server client, so the PKCE code_verifier cookie
//   (set by the browser client when `signInWithOAuth` was called) was
//   never read by the server during the OAuth callback.
//
// WHAT THIS MIDDLEWARE DOES:
//   1. `onRequest` — for EVERY incoming request, parse the `Cookie`
//      header, initialize a fresh `@supabase/ssr` server client bound
//      to those cookies, and store the client + cookie jar on
//      `event.locals.supabase`.
//   2. Routes (especially `/auth/callback`) read `event.locals.supabase`
//      to get a request-scoped client that can see the PKCE verifier
//      cookie. Any cookie writes the client makes (e.g. the session
//      cookies set by `exchangeCodeForSession`) are accumulated in the
//      cookie jar, which the route flushes to its outgoing `Response`.
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
//   as `{ body? }` (see @solidjs/start middleware types) — it does not
//   expose the outgoing Response's headers in a way that's safe to
//   mutate across all response shapes (streamed, static, etc.).
//   Instead, each route that uses `event.locals.supabase.client` is
//   responsible for flushing `event.locals.supabase.cookieJar` onto
//   the `Response` it returns. The auth callback does this explicitly
//   (see `src/routes/auth/callback.tsx`). This is the same pattern the
//   existing `/api/stats` and `/api/discover/taste` routes already use
//   with `createServerClientFromRequest`.
//
// FAILURE MODE:
//   If the Supabase env vars (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)
//   are missing — which can happen during build or in a misconfigured
//   env — `createServerClientFromRequest` throws. We catch + log here
//   and leave `event.locals.supabase` undefined. Routes that need
//   Supabase check for its presence and fall back to a direct
//   `createServerClientFromRequest(event.request)` call (which will
//   also throw, but with a clearer stack pointing at the route).
//
// SSR-SAFETY:
//   This file is imported by the SolidStart server entry on the server
//   only. It never runs in the browser. `createServerClientFromRequest`
//   internally calls `createServerClient` which asserts `isServer` —
//   so a misconfigured build that tries to bundle this into the client
//   would fail loudly.

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
//    typed as `App.RequestEventLocals` (see @solidjs/start server
//    types), so declaring this interface globally makes the property
//    visible everywhere `event.locals` is accessed.
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
 * SolidStart auto-discovers `src/middleware.ts` (or `src/middleware/index.ts`)
 * and wires the default export into the request pipeline. Every
 * incoming request — SSR page renders, API routes, the auth callback —
 * passes through `onRequest` before reaching its handler.
 */
export default createMiddleware({
  onRequest: (event) => {
    try {
      const { client, cookies } = createServerClientFromRequest(
        event.request
      );
      event.locals.supabase = { client, cookieJar: cookies };
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
