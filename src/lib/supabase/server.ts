// src/lib/supabase/server.ts
//
// CineLog V2 — Supabase Server Client (SSR + API Routes)
// ---------------------------------------------------------------------
// Factory for stateless, per-request Supabase clients used during
// SolidStart server-side rendering AND inside API routes.
//
// Phase 7 Task 5 — httpOnly Cookie Storage
// ----------------------------------------
// Previously the server client used `persistSession: false` and
// didn't read auth state from anywhere — it had no way to identify
// the authenticated user from an incoming request. The browser
// client stored the session in `localStorage`, which is accessible
// to any JS running on the page (including XSS payloads).
//
// We now use `@supabase/ssr`'s `createServerClient`, which:
//   • Reads the access_token + refresh_token from the request's
//     `sb-access-token` and `sb-refresh-token` cookies (httpOnly,
//     so JS can't read them — XSS-safe).
//   • Writes refreshed tokens back to the response cookies via the
//     provided `cookies()` adapter.
//   • Enforces `flowType: "pkce"` for the OAuth redirect flow.
//
// This means:
//   1. Sessions are no longer in `localStorage` → XSS can't steal them.
//   2. API routes can call `supabase.auth.getSession()` and get the
//      real session from the cookie — no need to pass a token header.
//   3. SSR pages can be personalized for the authenticated user
//      without a client-side round-trip.
//
// Why no singleton on the server?
// -------------------------------
// A Supabase client caches auth state and realtime subscriptions
// internally. On the server, those caches would be shared across
// concurrent requests coming from different users — a security and
// correctness bug. So unlike the browser module (which exposes a
// shared singleton), this module only exposes a factory. Every caller
// gets a fresh, isolated client bound to the request's cookies.
//
// Cookie adapter
// --------------
// The `cookies()` adapter bridges between Supabase's auth internals
// and the web framework's cookie API. We accept a function that
// returns a `Request`-compatible cookie getter, plus a setter that
// mutates the outgoing response. In SolidStart:
//
//   • SSR routes use `getRequestEvent()` from `solid-js/web` to
//     access the request + set response headers.
//   • API routes receive the `Request` directly and return a
//     `Response`, so they pass their own adapter.
//
// For tests + build-time calls (no request in scope), we provide a
// no-op adapter that returns empty cookies and discards writes —
// the resulting client has no session, which is correct.
//
// Environment variables
// ---------------------
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
//
// The Service Role Key is NEVER read here — even on the server we
// stick to the anon key so RLS policies are enforced. The service
// role key is reserved for trusted admin scripts (see adminClient.ts).
//

import { createServerClient as ssrCreateServerClient } from "@supabase/ssr";
import type { CookieOptions as SupabaseCookieOptions } from "@supabase/ssr";
import { isServer } from "solid-js/web";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolved public Supabase configuration.
 * Mirrors the shape in {@link "./browser.ts"} so the two modules can
 * evolve together if env-var handling ever needs to change.
 */
interface PublicSupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Read and validate the public Supabase environment variables.
 *
 * Same defensive pattern as the browser module: read at call time so
 * importing this file during a build never crashes the build just
 * because env vars are not populated.
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
 * The deprecated `get` / `set` / `remove` API is not used because it
 * misses edge cases (e.g. multiple cookies being set in one transaction).
 *
 *   getAll()    → return ALL cookies as `{ name, value }[]`. Used to
 *                 read the incoming request's auth cookies.
 *   setAll(cookies, headers)  → write a batch of cookies (with options)
 *                 + apply the response headers (Cache-Control, etc.)
 *                 that Supabase requires when auth cookies are set.
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
 * request's cookies.
 *
 * Always returns a NEW instance — never cached, never shared. Each
 * SSR request that needs Supabase should call this once and pass the
 * resulting client down to its repositories / resolvers.
 *
 * @param cookies  The cookie adapter for the current request. If
 *   omitted, a no-op adapter is used (no session — correct for
 *   build-time + tests).
 *
 * @throws Error if called on the browser. The server client's auth
 *   options are wrong for browser use (cookie-based, not localStorage),
 *   so misuse is loud-failed rather than silently producing a broken
 *   auth experience.
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
  //   • Reads auth tokens from the request cookies via `getAll`.
  //   • Writes refreshed tokens to the response via `setAll`.
  //   • Auto-refreshes expired access tokens (calling `setAll` to
  //     persist the new tokens).
  //   • Uses PKCE flow for OAuth redirects (matches the browser client).
  //
  // `persistSession: false` is correct here — the SESSION is in
  // cookies, not in localStorage. The supabase-js option `persistSession`
  // specifically controls localStorage persistence, which we don't
  // want on the server.
  return ssrCreateServerClient(url, anonKey, {
    cookies: {
      getAll: adapter.getAll,
      setAll: adapter.setAll
    },
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce"
    }
  });
}

/**
 * Header name constants for the auth cookies.
 *
 * `@supabase/ssr` uses these names by default. We export them so:
 *   1. Tests can stub them on the Request.
 *   2. The SolidStart server middleware (which sets them on the
 *      response after a successful login redirect) can reference
 *      them by name instead of magic strings.
 *
 * Note: the cookies are httpOnly, so client-side JS can't read them
 * by design. They're set by the server (either by the SSR client's
 * `set` adapter, or by Supabase's redirect callback) and read by
 * the server client's `get` adapter.
 */
export const SUPABASE_AUTH_COOKIE_NAMES = {
  access: "sb-access-token",
  refresh: "sb-refresh-token"
} as const;

/**
 * Parse a `Cookie` header value into a list of `{ name, value }`.
 *
 * Used by `createServerClientFromRequest` to extract the auth cookies
 * from an incoming Request without needing a full cookie parser
 * dependency. Returns a list (not a map) because the `getAll` adapter
 * contract returns `{ name, value }[]` — duplicates are preserved
 * (multiple cookies with the same name can exist, though it's rare).
 */
function parseCookieHeader(
  headerValue: string
): { name: string; value: string }[] {
  if (!headerValue) return [];
  const out: { name: string; value: string }[] = [];
  for (const part of headerValue.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (name) out.push({ name, value });
  }
  return out;
}

/**
 * Container for cookies + headers to be set on the outgoing Response.
 *
 * `createServerClientFromRequest` collects writes from the supabase
 * client (which calls `setAll` on the adapter when tokens are
 * refreshed) and exposes them via:
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
 * Create a server Supabase client bound to a specific Request's
 * cookies. Returns the client + a `CookieJar` that accumulates any
 * cookie writes the client makes (e.g. token refresh) so the caller
 * can attach them to its Response.
 *
 * Usage in an API route:
 *
 *   export async function GET(event) {
 *     const { client, cookies } = createServerClientFromRequest(event.request);
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
 * This is the recommended pattern for SolidStart API routes —
 * `getRequestEvent()` is not always available inside route handlers,
 * so we read directly from the Request and write to the Response.
 */
export function createServerClientFromRequest(
  request: Request
): { client: SupabaseClient; cookies: CookieJar } {
  // Parse the incoming Cookie header into a list of { name, value }.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const incomingCookies = parseCookieHeader(cookieHeader);

  // Accumulate Set-Cookie writes + response headers here. The supabase
  // client calls `setAll` on the adapter when tokens are refreshed,
  // and we collect them so the caller can flush them to the Response.
  const setCookieHeaders: string[] = [];
  const responseHeaders: Record<string, string> = {};

  /**
   * Serialize a cookie write to a Set-Cookie header value.
   */
  const serializeCookie = (
    name: string,
    value: string,
    options: SupabaseCookieOptions
  ): string => {
    const parts: string[] = [`${name}=${value}`];
    // `SupabaseCookieOptions` is `Partial<SerializeOptions>` from the
    // `cookie` package, so it has all the standard cookie attributes.
    const opts = options as Partial<{
      maxAge: number;
      expires: Date;
      path: string;
      domain: string;
      secure: boolean;
      httpOnly: boolean;
      sameSite: "strict" | "lax" | "none";
    }>;
    if (opts.maxAge !== undefined) {
      parts.push(`Max-Age=${opts.maxAge}`);
    }
    if (opts.expires) {
      parts.push(`Expires=${opts.expires.toUTCString()}`);
    }
    if (opts.path) {
      parts.push(`Path=${opts.path}`);
    } else {
      parts.push("Path=/");
    }
    if (opts.domain) {
      parts.push(`Domain=${opts.domain}`);
    }
    if (opts.secure) {
      parts.push("Secure");
    }
    // httpOnly defaults to true for auth cookies — they MUST be
    // unreadable by client-side JS (that's the whole point of the
    // Phase 7 Task 5 migration). Note: `@supabase/ssr` sets
    // httpOnly: true by default in its cookieOptions, so this is
    // belt-and-suspenders.
    if (opts.httpOnly !== false) {
      parts.push("HttpOnly");
    }
    if (opts.sameSite) {
      parts.push(`SameSite=${opts.sameSite}`);
    } else {
      // Default to "lax" — allows the cookie to be sent on top-level
      // navigations (so OAuth redirects work) but not on cross-site
      // requests (so CSRF is mitigated).
      parts.push("SameSite=Lax");
    }
    return parts.join("; ");
  };

  const adapter: ServerCookieAdapter = {
    getAll: () => incomingCookies,
    setAll: (
      cookiesToSet: { name: string; value: string; options: SupabaseCookieOptions }[],
      headers: Record<string, string>
    ) => {
      for (const { name, value, options } of cookiesToSet) {
        setCookieHeaders.push(serializeCookie(name, value, options));
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
  const cookies: CookieJar = {
    toSetCookieHeaders: () => [...setCookieHeaders],
    getResponseHeaders: () => ({ ...responseHeaders })
  };
  return { client, cookies };
}

export type { SupabaseClient };
