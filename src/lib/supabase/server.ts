// src/lib/supabase/server.ts
//
// CineLog V2 — Supabase Server Client (Explicit Cookie Adapter)
// ---------------------------------------------------------------------
// Factory for stateless, per-request Supabase clients used during
// SolidStart server-side rendering AND inside API routes.
//
// ─────────────────────────────────────────────────────────────────────
// Phase 7 Task 5 — httpOnly Cookie Storage
// ─────────────────────────────────────────────────────────────────────
// The server client uses `@supabase/ssr`'s `createServerClient`, which:
//   • Reads the access_token + refresh_token + PKCE code_verifier from
//     the request's cookies via `getAll`.
//   • Writes refreshed/exchanged tokens back via `setAll` (which we
//     accumulate into a `CookieJar` and flush to the outgoing Response).
//   • Enforces `flowType: "pkce"` for the OAuth redirect flow.
//
// ─────────────────────────────────────────────────────────────────────
// EXPLICIT ADAPTER (rewrite of the previous version)
// ─────────────────────────────────────────────────────────────────────
// The previous version hand-rolled a `parseCookieHeader` and a
// `serializeCookie` helper. They worked, but:
//
//   1. The hand-rolled parser didn't URI-decode cookie values (the
//      `cookie` package does). When `@supabase/ssr` chunks a long
//      session token across multiple cookies via `encodeURIComponent`,
//      the server-side `combineChunks` expects the raw (URI-decoded)
//      value back. A mismatch here causes `combineChunks` to return
//      a partial value, which `JSON.parse` rejects, and the session
//      is treated as absent.
//
//   2. The hand-rolled serializer didn't apply `path` / `sameSite`
//      defaults consistently with `@supabase/ssr`'s own
//      `DEFAULT_COOKIE_OPTIONS`. A mismatch caused some browsers to
//      reject the session cookie (e.g. `SameSite=None` without
//      `Secure` is rejected, and a missing `Path=/` scopes the
//      cookie to the current path only).
//
// We now use the `cookie` package's `parse` and `serialize` directly
// — the SAME package `@supabase/ssr` uses internally. This guarantees
// byte-identical cookie bytes between client and server.
//
// ─────────────────────────────────────────────────────────────────────
// Why no singleton on the server?
// ─────────────────────────────────────────────────────────────────────
// A Supabase client caches auth state and realtime subscriptions
// internally. On the server, those caches would be shared across
// concurrent requests coming from different users — a security and
// correctness bug. So unlike the browser module (which exposes a
// shared singleton), this module only exposes a factory. Every caller
// gets a fresh, isolated client bound to the request's cookies.
//
// ─────────────────────────────────────────────────────────────────────
// Environment variables
// ─────────────────────────────────────────────────────────────────────
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
//
// The Service Role Key is NEVER read here — even on the server we
// stick to the anon key so RLS policies are enforced. The service
// role key is reserved for trusted admin scripts (see adminClient.ts).
//

import { createServerClient as ssrCreateServerClient } from "@supabase/ssr";
import type { CookieOptions as SupabaseCookieOptions } from "@supabase/ssr";
// Use the `cookie` package directly — it's a transitive dep of
// `@supabase/ssr` (declared in its package.json), so it's always
// available. Using the same parser/serializer the SSR library uses
// internally eliminates any byte-level mismatch between client and
// server cookie handling.
import { parse as parseCookieString, serialize as serializeCookie } from "cookie";
import { isServer } from "solid-js/web";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolved public Supabase configuration.
 */
interface PublicSupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Read and validate the public Supabase environment variables.
 *
 * Reads at call time so importing this file during a build never
 * crashes the build just because env vars are not populated.
 */
function readPublicConfig(): PublicSupabaseConfig {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error(
      "[CineLog Supabase] Missing VITE_SUPABASE_URL. " +
        "Set it in your .env file (server-side). The Service Role Key is NOT used by the application runtime."
    );
  }

  if (typeof anonKey !== "string" || anonKey.trim().length === 0) {
    throw new Error(
      "[CineLog Supabase] Missing VITE_SUPABASE_ANON_KEY. " +
        "Set it in your .env file (server-side). The Service Role Key is NOT used by the application runtime."
    );
  }

  return { url: url.trim(), anonKey: anonKey.trim() };
}

/**
 * Cookie adapter contract.
 *
 * Uses the modern `getAll` / `setAll` API (recommended by `@supabase/ssr`).
 *
 *   getAll()    → return ALL cookies as `{ name, value }[]`. Used to
 *                 read the incoming request's auth cookies + PKCE
 *                 code_verifier cookie.
 *
 *   setAll(cookies, headers)  → write a batch of cookies (with options)
 *                 + apply the response headers (Cache-Control, Expires,
 *                 Pragma) that Supabase requires when auth cookies are
 *                 set (to prevent CDN caching of per-user responses).
 */
export interface ServerCookieAdapter {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookies: { name: string; value: string; options: SupabaseCookieOptions }[],
    headers: Record<string, string>
  ) => void;
}

/**
 * Cookie options passed by `@supabase/ssr`. Re-exported for callers
 * that need to construct their own adapter (e.g. tests).
 */
export type CookieOptions = SupabaseCookieOptions;

/**
 * No-op cookie adapter for use when no request is in scope (build-
 * time, tests, scripts). All reads return [] (no session), all writes
 * are discarded. The resulting client has no session, which is the
 * correct behavior outside of a request lifecycle.
 */
function noopCookieAdapter(): ServerCookieAdapter {
  return {
    getAll: () => [],
    setAll: () => {}
  };
}

/**
 * Create a fresh server-side Supabase client bound to the given
 * cookie adapter.
 *
 * Always returns a NEW instance — never cached, never shared. Each
 * SSR request that needs Supabase should call this once and pass the
 * resulting client down to its repositories / resolvers.
 *
 * @param cookies  The cookie adapter for the current request. If
 *   omitted, a no-op adapter is used (no session — correct for
 *   build-time + tests).
 *
 * @throws Error if called on the browser.
 */
export function createServerClient(
  cookies?: ServerCookieAdapter
): SupabaseClient {
  if (!isServer) {
    throw new Error(
      "[CineLog Supabase] createServerClient() was called on the browser. " +
        'Use getBrowserClient() from "src/lib/supabase/browser.ts" instead, ' +
        'or the environment-aware getClient() from "src/lib/supabase/client.ts".'
    );
  }

  const { url, anonKey } = readPublicConfig();
  const adapter = cookies ?? noopCookieAdapter();

  // `@supabase/ssr`'s createServerClient is the cookie-aware variant
  // of `@supabase/supabase-js`'s createClient. It:
  //   • Reads auth tokens + PKCE verifier from the request cookies
  //     via `getAll`.
  //   • Writes refreshed/exchanged tokens via `setAll`.
  //   • Auto-refreshes expired access tokens (calling `setAll` to
  //     persist the new tokens — make sure your `setAll` accumulates
  //     them so the response carries them).
  //   • Uses PKCE flow for OAuth redirects (matches the browser client).
  //
  // `persistSession: false` is correct here — the SESSION is in
  // cookies, not in localStorage. The supabase-js option `persistSession`
  // specifically controls localStorage persistence, which we don't
  // want on the server.
  //
  // CRITICAL — experimental.appendPkceFlowIdToRedirects:
  //   MUST match the browser client's setting. When the browser
  //   enables this, it appends `sb_flow_id=<flowId>` to the OAuth
  //   redirect URL. The server-side callback reads `sb_flow_id`
  //   from the URL and passes it to `exchangeCodeForSession(code,
  //   { flowId })`. The server client uses this option to know
  //   that flow-specific slot keys are in play.
  //
  //   See `src/lib/supabase/browser.ts` for the full rationale.
  return ssrCreateServerClient(url, anonKey, {
    cookies: {
      getAll: adapter.getAll,
      setAll: adapter.setAll
    },
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      experimental: {
        appendPkceFlowIdToRedirects: true
      }
    }
  });
}

/**
 * Header name constants for the auth cookies.
 *
 * `@supabase/ssr` uses these names by default. We export them so:
 *   1. Tests can stub them on the Request.
 *   2. The SolidStart server middleware can reference them by name
 *      instead of magic strings.
 *   3. Debug logs can filter to just the auth cookies.
 *
 * Note: PKCE verifier cookies have a DIFFERENT name — they're keyed
 * by `<storageKey>-code-verifier` (and chunked as
 * `<storageKey>-code-verifier.0`, `.1`, ...). The storage key is
 * derived from the project URL by supabase-js. We don't hard-code
 * it here because it varies per project.
 */
export const SUPABASE_AUTH_COOKIE_NAMES = {
  access: "sb-access-token",
  refresh: "sb-refresh-token"
} as const;

/**
 * Container for cookies + headers to be set on the outgoing Response.
 *
 * `createServerClientFromRequest` collects writes from the supabase
 * client (which calls `setAll` on the adapter when tokens are
 * refreshed / exchanged) and exposes them via:
 *   - `toSetCookieHeaders()`  → Set-Cookie header values for the Response.
 *   - `getResponseHeaders()`  → Cache-Control / Expires / Pragma headers
 *     that Supabase requires when auth cookies are set (prevents CDNs
 *     from caching per-user sessions).
 */
export interface CookieJar {
  /**
   * Returns the `Set-Cookie` headers accumulated so far. Each entry
   * is a fully-formed Set-Cookie header value, ready to be added to
   * a Response's headers.
   */
  toSetCookieHeaders(): string[];
  /**
   * Returns the response headers (Cache-Control, Expires, Pragma)
   * that must be set alongside the cookies to prevent CDN caching
   * of per-user responses.
   */
  getResponseHeaders(): Record<string, string>;
}

/**
 * Returns `true` when the `SUPABASE_DEBUG_COOKIE_LOG` env var is set
 * to "1" or "true". When enabled, the server middleware logs every
 * `getAll` / `setAll` call so OAuth flow issues can be diagnosed.
 *
 * This is a server-only flag — it has no effect on the browser client
 * (which uses `localStorage.debug_supabase_cookies` instead).
 */
function isServerCookieDebugLoggingEnabled(): boolean {
  if (!isServer) return false;
  const flag =
    import.meta.env.SUPABASE_DEBUG_COOKIE_LOG ??
    (typeof process !== "undefined" && process.env?.SUPABASE_DEBUG_COOKIE_LOG);
  return flag === "1" || flag === "true";
}

/**
 * Filter a list of parsed cookies down to just the names relevant to
 * Supabase auth — used for debug logging so we don't dump every
 * unrelated cookie (analytics, etc.) into the server logs.
 *
 * Returns a compact `{ name, valueLength }[]` so the actual cookie
 * VALUES are never logged (they contain session tokens + the PKCE
 * verifier).
 */
function summarizeAuthCookies(
  cookies: { name: string; value: string }[]
): { name: string; valueLength: number }[] {
  return cookies
    .filter((c) => {
      const n = c.name;
      return (
        n === "sb-access-token" ||
        n === "sb-refresh-token" ||
        n.includes("-code-verifier") ||
        n.startsWith("sb-")
      );
    })
    .map((c) => ({ name: c.name, valueLength: c.value.length }));
}

/**
 * Create a server Supabase client bound to a specific Request's
 * cookies (AND Authorization Bearer header). Returns the client + a
 * `CookieJar` that accumulates any cookie writes the client makes
 * (e.g. token refresh, session exchange) so the caller can attach
 * them to its Response.
 *
 * USAGE in an API route:
 *
 *   export async function GET(event) {
 *     const { client, cookies } = await createServerClientFromRequest(event.request);
 *     const { data } = await client.auth.getSession();
 *     ...
 *     const response = new Response(...);
 *     for (const header of cookies.toSetCookieHeaders()) {
 *       response.headers.append("Set-Cookie", header);
 *     }
 *     for (const [k, v] of Object.entries(cookies.getResponseHeaders())) {
 *       response.headers.set(k, v);
 *     }
 *     return response;
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────
 * Phase 13 Chunk 1 — Authorization Bearer Header Support
 * ─────────────────────────────────────────────────────────────────────
 * The browser client stores sessions in `localStorage` (NOT cookies),
 * so the browser NEVER sends a Supabase auth cookie. Without the
 * bearer-header path below, every `getSession()` call from a
 * browser-originated request returns null, breaking `/api/stats`,
 * `/api/discover/taste`, and `/api/share-card`.
 *
 * Resolution order (matches `getSupabaseAccessTokenFromRequest`):
 *   1. `Authorization: Bearer <token>` header  → inject via setSession
 *   2. `sb-*-auth-token` cookie                → existing cookie path
 *
 * When a Bearer token is present, we create the cookie-based client
 * as usual (so the CookieJar machinery still works for any writes the
 * client makes), then call `client.auth.setSession({ access_token,
 * refresh_token: "" })` to inject the bearer as the active session.
 * `setSession` internally calls `getUser(access_token)` to verify the
 * token and populate the user object, so the caller's existing
 * `data.session?.user?.id` lookup works unchanged.
 *
 * The function is async because `setSession` is async. Callers must
 * `await` it. The middleware (`src/middleware.ts`) also awaits.
 *
 * Cookie parsing:
 *   The incoming `Cookie` header is parsed with the `cookie` package's
 *   `parse()` — the SAME parser `@supabase/ssr` uses internally. This
 *   guarantees that values written by the browser client (which go
 *   through `cookie.serialize` → `document.cookie` → `Cookie` header)
 *   are decoded identically on the server. A parser mismatch would
 *   cause `combineChunks` to return partial/corrupted values, which
 *   would manifest as "PKCE code verifier not found in storage" even
 *   when the cookie is present.
 *
 * Cookie serialization:
 *   Outgoing cookies are serialized with `cookie.serialize()` — again
 *   the same serializer `@supabase/ssr` uses. We apply defaults
 *   (`path: "/"`, `sameSite: "lax"`, `httpOnly: true`) that match
 *   `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS`, but allow supabase's
 *   explicit options to override them (e.g. `maxAge: 0` for deletion).
 *
 *   `httpOnly: true` is the default for SESSION cookies (set by
 *   `exchangeCodeForSession`) — they MUST be unreadable by client-side
 *   JS (the whole point of the Phase 7 migration). The PKCE verifier
 *   cookie is set by the BROWSER client (not the server), so it's
 *   `httpOnly: false` there — the server only READS it.
 *
 *   `secure` is set based on the request's protocol: if the request
 *   came in over HTTPS (or via the `X-Forwarded-Proto: https` header
 *   set by Vercel's edge), the cookie is marked `Secure`. On plain
 *   HTTP (localhost dev), `Secure` is omitted so the browser accepts
 *   the cookie.
 */
type RequestSupabaseContext = {
  client: SupabaseClient;
  cookies: CookieJar;
};

// Middleware and a downstream API handler receive the same Request object.
// Keep one request-scoped initialization promise so Bearer-token injection,
// cookie parsing, and the CookieJar are not recreated or re-verified by the
// second caller. WeakMap ensures completed requests are not retained.
const requestSupabaseContextCache = new WeakMap<
  Request,
  Promise<RequestSupabaseContext>
>();

export function createServerClientFromRequest(
  request: Request
): Promise<RequestSupabaseContext> {
  const cached = requestSupabaseContextCache.get(request);
  if (cached) return cached;

  const pending = createServerClientFromRequestUncached(request);
  requestSupabaseContextCache.set(request, pending);

  // Preserve the existing retry behavior if initialization fails (for
  // example, because deployment environment variables are unavailable).
  void pending.catch(() => {
    if (requestSupabaseContextCache.get(request) === pending) {
      requestSupabaseContextCache.delete(request);
    }
  });

  return pending;
}

async function createServerClientFromRequestUncached(
  request: Request
): Promise<RequestSupabaseContext> {
  // ── Parse the incoming Cookie header ───────────────────────────
  // Use the `cookie` package's `parse()` for byte-identical decoding
  // with the browser client's `serialize()` writes.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const parsedCookieMap = parseCookieString(cookieHeader);
  const incomingCookies: { name: string; value: string }[] = [];
  for (const name of Object.keys(parsedCookieMap)) {
    incomingCookies.push({ name, value: parsedCookieMap[name] ?? "" });
  }

  // ── Determine if the request is over HTTPS ────────────────────
  // Vercel terminates TLS at the edge and forwards requests to the
  // SolidStart server over HTTP. The original protocol is in the
  // `X-Forwarded-Proto` header. We trust this header to decide
  // whether to mark outgoing cookies as `Secure`.
  //
  // Why this matters: if we set `Secure: true` on a cookie in
  // response to a request that the browser sees as HTTP, the browser
  // will REJECT the cookie. Conversely, if we omit `Secure` on an
  // HTTPS response, the cookie is sent over HTTP too (less secure).
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isHttps =
    (forwardedProto && forwardedProto.split(",")[0].trim() === "https") ||
    new URL(request.url).protocol === "https:";

  // ── Accumulate Set-Cookie writes + response headers here ──────
  // The supabase client calls `setAll` on the adapter when tokens
  // are refreshed or a session is exchanged. We collect them so the
  // caller can flush them to the Response.
  const setCookieHeaders: string[] = [];
  const responseHeaders: Record<string, string> = {};

  const debug = isServerCookieDebugLoggingEnabled();

  const adapter: ServerCookieAdapter = {
    getAll: () => {
      if (debug && process.env.NODE_ENV !== "production") {
        console.log(
          "[supabase-server-cookies] getAll() →",
          incomingCookies.length,
          "cookies from request. Auth-relevant:",
          JSON.stringify(summarizeAuthCookies(incomingCookies))
        );
      }
      // ALWAYS return an array — never null. `@supabase/ssr`'s
      // `combineChunks` treats a null return as "no cookies present"
      // and the PKCE verifier lookup would miss even when the cookie
      // exists.
      return incomingCookies;
    },
    setAll: (
      cookiesToSet: { name: string; value: string; options: SupabaseCookieOptions }[],
      headers: Record<string, string>
    ) => {
      for (const { name, value, options } of cookiesToSet) {
        // Merge with defaults that match `@supabase/ssr`'s
        // `DEFAULT_COOKIE_OPTIONS`. Supabase's explicit options win
        // (e.g. `maxAge: 0` for deletion is preserved).
        const mergedOptions: SupabaseCookieOptions = {
          path: "/",
          sameSite: "lax",
          httpOnly: true,
          ...options,
          // `secure` is environment-derived (protocol-based), not
          // caller-derived. Always wins.
          secure: isHttps
        };
        const serialized = serializeCookie(
          name,
          value,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mergedOptions as any
        );
        setCookieHeaders.push(serialized);
        if (debug && process.env.NODE_ENV !== "production") {
          console.log(
            "[supabase-server-cookies] setAll() → queued",
            name,
            "(value length:",
            value.length,
            ", secure:",
            isHttps,
            ", httpOnly:",
            mergedOptions.httpOnly !== false,
            ")"
          );
        }
      }
      // Merge the response headers (Cache-Control, Expires, Pragma)
      // into our accumulator. Later writes win on conflict (which is
      // correct — Supabase sends the same headers each time).
      for (const [key, value] of Object.entries(headers)) {
        responseHeaders[key] = value;
      }
    }
  };

  const client = createServerClient(adapter);

  // ── Phase 13 Chunk 1 — Authorization Bearer Header Injection ─────
  // The browser client stores sessions in `localStorage` (NOT cookies),
  // so the cookie adapter above sees no Supabase auth cookie for
  // browser-originated requests. Without this injection, every
  // `client.auth.getSession()` call returns null for signed-in browser
  // users, breaking `/api/stats`, `/api/discover/taste`, and
  // `/api/share-card`.
  //
  // When the Bearer token is present, we call `auth.setSession()` to
  // inject it as the active session on the client. `setSession`:
  //   • Internally calls `getUser(access_token)` to verify the token
  //     with Supabase's auth server and populate the user object.
  //   • Stores the session in the client's in-memory state so
  //     subsequent `getSession()` calls return it (and
  //     `data.session?.user?.id` works for the caller).
  //   • Enables RLS-scoped queries on the same client (the access
  //     token is attached to all subsequent Supabase REST calls).
  //
  // `refresh_token: ""` is intentional — we don't have the browser's
  // refresh token (it lives in localStorage, never sent to the server).
  // This is fine because:
  //   • `setSession` uses the access_token for the immediate request.
  //   • If the access_token is expired, `getUser()` will fail and
  //     `setSession` returns an error — the caller's `getSession()`
  //     then returns null, which the caller surfaces as a 401. The
  //     browser's `autoRefreshToken` will have already refreshed the
  //     token before it expires, so this only happens if the user has
  //     been offline for >1 hour AND the token has truly expired.
  //   • This mirrors the proven pattern in
  //     `src/routes/api/sync/trakt/preview.ts:loadUserVault()`.
  //
  // Errors are caught + logged but do NOT throw — the caller's
  // `getSession()` will simply return null and surface a 401, which
  // is the correct behavior for an unauthenticated request.
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice("Bearer ".length).trim();
    if (bearerToken.length > 0) {
      try {
        const { error: setSessionError } = await client.auth.setSession({
          access_token: bearerToken,
          refresh_token: ""
        });
        if (setSessionError) {
          // Most common cause: the access_token has expired. The
          // browser should have refreshed it, but if the user has
          // been offline for a long time, the refresh may have failed
          // silently. Log + fall through — getSession() will return
          // null and the caller returns 401.
          console.warn(
            "[supabase-server] setSession failed for Bearer token:",
            setSessionError.message
          );
        }
      } catch (err) {
        console.warn(
          "[supabase-server] Failed to inject Bearer token session:",
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  const cookies: CookieJar = {
    toSetCookieHeaders: () => [...setCookieHeaders],
    getResponseHeaders: () => ({ ...responseHeaders })
  };
  return { client, cookies };
}

export type { SupabaseClient };
