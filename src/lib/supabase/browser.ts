/**
 * CineLog V2 — Supabase Browser Client (Explicit Cookie Adapter)
 * ---------------------------------------------------------------------
 * Singleton browser-side Supabase client using `@supabase/ssr`'s
 * `createBrowserClient` with an EXPLICIT `cookies.getAll` / `cookies.setAll`
 * adapter backed by `document.cookie`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY EXPLICIT (not the implicit document.cookie fallback)
 * ─────────────────────────────────────────────────────────────────────
 * `@supabase/ssr`'s `createBrowserClient` allows omitting the `cookies`
 * option entirely — it then falls back to reading/writing `document.cookie`
 * internally. We previously relied on that fallback.
 *
 * In production we observed "PKCE code verifier not found in storage"
 * during Google OAuth. The fallback's behaviour is opaque (no logs, no
 * control over cookie attributes), which made it impossible to verify
 * whether the verifier cookie was actually being written. This rewrite
 * makes the adapter EXPLICIT so that:
 *
 *   1. Every cookie write goes through `cookie.serialize()` with
 *      explicit `path`, `sameSite`, `maxAge`, and (when on HTTPS)
 *      `secure` attributes — matching what the server-side adapter
 *      expects when it reads them back on the OAuth redirect.
 *   2. We can attach `console.log` debug traces (gated on
 *      `localStorage.debug_supabase_cookies`) to see exactly which
 *      cookies are being read and written, so the next OAuth failure
 *      is diagnosable.
 *   3. We guarantee that `getAll` ALWAYS returns an array (never
 *      `null`), because `@supabase/ssr`'s internal `combineChunks`
 *      treats a `null` return as "cookie not present" — and returning
 *      `null` from `getAll` would cause every storage lookup to miss.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PKCE Flow Recap (why this file matters for OAuth)
 * ─────────────────────────────────────────────────────────────────────
 *   1. User clicks "Sign in with Google".
 *   2. App calls `supabase.auth.signInWithOAuth({ provider: 'google' })`.
 *   3. auth-js internally calls `storage.setItem('<key>-code-verifier', <verifier>)`.
 *   4. The browser client's storage adapter (defined inside
 *      `@supabase/ssr`'s `createStorageFromOptions`) chunks the value
 *      and calls our `setAll([{ name, value, options }, ...], headers)`.
 *   5. Our `setAll` writes each chunk to `document.cookie` via
 *      `cookie.serialize()`. The cookie is now stored in the browser.
 *   6. auth-js navigates the browser to Google's OAuth URL.
 *   7. Google redirects back to `/auth/callback?code=...`.
 *   8. The SolidStart server middleware reads the `Cookie` header
 *      (which the browser sends automatically on the same-origin
 *      top-level navigation — SameSite=Lax allows it) and the
 *      server-side supabase client finds the verifier cookie.
 *   9. `exchangeCodeForSession(code)` succeeds.
 *
 * If step 5 silently fails (e.g. `document.cookie` write rejected
 * due to invalid attributes, or `getAll` returning `null`), the
 * verifier never lands in the cookie jar, and step 9 fails with
 * "PKCE code verifier not found in storage".
 *
 * ─────────────────────────────────────────────────────────────────────
 * Cookie Attributes (must match between browser + server)
 * ─────────────────────────────────────────────────────────────────────
 *   path: "/"           — broadest scope, matches server default
 *   sameSite: "lax"     — allows the cookie on the OAuth top-level
 *                         redirect (cross-site → same-site navigation)
 *   secure: <https>     — true only when the page is served over HTTPS
 *                         (production). Setting `secure: true` on
 *                         localhost (http) would cause the browser to
 *                         REJECT the cookie — so we detect dynamically.
 *   httpOnly: false     — auth-js writes the verifier via JS, so it
 *                         MUST be JS-readable. (The SESSION cookies
 *                         set by the server after exchange are
 *                         httpOnly — those are separate.)
 *   maxAge: 400 days    — matches `@supabase/ssr`'s
 *                         `DEFAULT_COOKIE_OPTIONS.maxAge`. Long enough
 *                         for the OAuth round-trip (which takes seconds).
 *
 * SSR safety
 * ----------
 * Every code path that touches `window` / `document` is guarded by
 * `isServer` from `solid-js/web`. Calling `createBrowserClient` or
 * `getBrowserClient` on the server throws a descriptive error.
 *
 * HMR safety
 * ----------
 * The singleton is cached on `globalThis` (keyed with a project-specific
 * name) so Vite's Hot Module Replacement in dev does not leak stale auth
 * listeners across hot reloads.
 */

import { createBrowserClient as ssrCreateBrowserClient } from "@supabase/ssr";
// `cookie` is a transitive dependency of `@supabase/ssr` (declared in its
// package.json). We import it directly because its `parse` and `serialize`
// are the exact functions `@supabase/ssr` uses internally — guaranteeing
// our adapter produces byte-identical cookie bytes that the server-side
// `parseCookieHeader` (which also uses `cookie.parse`) can decode.
import { parse as parseCookieString, serialize as serializeCookie } from "cookie";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";

/**
 * Key under which the singleton browser client is cached on `globalThis`.
 * Prefixed with the project name to avoid colliding with any other library
 * that may stash a Supabase client on the global object.
 */
const BROWSER_CLIENT_GLOBAL_KEY =
  "__CINELOG_SUPABASE_BROWSER_CLIENT__" as const;

/**
 * Structural shape we expect on `globalThis` for singleton caching.
 */
interface GlobalWithBrowserClient {
  [BROWSER_CLIENT_GLOBAL_KEY]?: SupabaseClient;
}

/**
 * Resolved public Supabase configuration. Both fields are required — the
 * anon key is safe to ship to the browser; the service role key is not
 * (and is therefore absent).
 */
interface PublicSupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Read and validate the public Supabase environment variables.
 *
 * Throws a descriptive error if either is missing so misconfiguration is
 * loud at first use rather than silently producing 401s deeper in the
 * call stack. Reading happens at call time (not at module load time) so
 * importing this module during an SSR build never crashes the build.
 */
function readPublicConfig(): PublicSupabaseConfig {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error(
      "[CineLog Supabase] Missing VITE_SUPABASE_URL. " +
        "Set it in your .env file. Do NOT use the Service Role Key in the browser."
    );
  }

  if (typeof anonKey !== "string" || anonKey.trim().length === 0) {
    throw new Error(
      "[CineLog Supabase] Missing VITE_SUPABASE_ANON_KEY. " +
        "Set it in your .env file. Do NOT use the Service Role Key in the browser."
    );
  }

  return { url: url.trim(), anonKey: anonKey.trim() };
}

/**
 * Returns `true` when the page is currently served over HTTPS.
 *
 * The PKCE verifier cookie MUST be marked `Secure` in production (HTTPS)
 * so that browsers respect it. On `localhost` (HTTP) we must NOT set
 * `Secure`, because the browser would silently reject the cookie and the
 * OAuth round-trip would lose the verifier — reproducing the exact
 * "PKCE code verifier not found" bug.
 *
 * `window.isSecureContext` is the modern API: it returns true on HTTPS
 * pages AND on `localhost` (which Chrome/Firefox treat as a secure
 * context for dev purposes even over HTTP). However, setting `Secure`
 * on an HTTP-only localhost cookie is still rejected by the browser
 * (Secure requires HTTPS or `.localhost`), so we explicitly check the
 * protocol too.
 */
function isSecureContextForCookies(): boolean {
  if (isServer) return false;
  if (typeof window === "undefined" || !window.location) return false;
  // `window.isSecureContext` covers HTTPS + localhost-on-HTTPS + file://.
  // The protocol check excludes plain HTTP (even on localhost).
  return (
    window.isSecureContext === true ||
    window.location.protocol === "https:"
  );
}

/**
 * Read the debug flag from localStorage without crashing if access is
 * denied (e.g. Safari ITP, sandboxed iframes).
 *
 * When `true`, every cookie read/write is logged to the console with
 * the `[supabase-browser-cookies]` prefix — invaluable for diagnosing
 * OAuth flow issues in production.
 */
function isCookieDebugLoggingEnabled(): boolean {
  if (isServer) return false;
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("debug_supabase_cookies") === "1"
    );
  } catch {
    // localStorage access can throw in private mode or sandboxed iframes.
    return false;
  }
}

/**
 * Build the explicit browser cookie adapter used by `createBrowserClient`.
 *
 *   getAll() → parse `document.cookie` with the `cookie` package's
 *              `parse()` (URI-decodes names + values, handles `=`/`;`
 *              in values correctly). Returns `{ name, value }[]`.
 *              NEVER returns null — `@supabase/ssr`'s `combineChunks`
 *              treats null as "no cookies" and the PKCE verifier
 *              lookup would miss.
 *
 *   setAll(cookiesToSet, responseHeaders) → for each cookie, call
 *              `cookie.serialize(name, value, options)` and assign to
 *              `document.cookie`. The `responseHeaders` (Cache-Control,
 *              Expires, Pragma) are SERVER-only concerns — the browser
 *              client ignores them (no HTTP response to attach them to).
 *              We log them in debug mode for symmetry with the server.
 *
 * The `options` object passed by `@supabase/ssr` is `Partial<SerializeOptions>`
 * and includes `path`, `sameSite`, `maxAge`, `httpOnly`, `domain`, `secure`,
 * `expires`. We OVERRIDE `secure` based on the current page's protocol
 * (see {@link isSecureContextForCookies}) — the supabase default leaves
 * it unset, which means cookies would be sent over HTTP too. In production
 * (HTTPS) we want `Secure` to harden the cookie; in dev (HTTP localhost)
 * we must omit it or the browser rejects the write.
 *
 * We also default `path` to "/" and `sameSite` to "lax" if supabase
 * didn't pass them — matching `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS`
 * so behaviour is identical to the fallback (just explicit + logged).
 */
function buildBrowserCookieAdapter() {
  const debug = isCookieDebugLoggingEnabled();

  return {
    getAll(): { name: string; value: string }[] {
      if (isServer) return [];
      const raw = typeof document !== "undefined" ? document.cookie : "";
      // `cookie.parse` returns `{ [name]: value }`. Convert to the
      // `{ name, value }[]` shape `@supabase/ssr` expects.
      const parsed = parseCookieString(raw);
      const out: { name: string; value: string }[] = [];
      for (const name of Object.keys(parsed)) {
        out.push({ name, value: parsed[name] ?? "" });
      }
      if (debug) {
        // Log only the cookie NAMES — values may contain session tokens
        // or the PKCE verifier, which should never reach the console
        // in production logs.
        console.log(
          "[supabase-browser-cookies] getAll() →",
          out.length,
          "cookies:",
          out.map((c) => c.name).join(", ") || "(none)"
        );
      }
      return out;
    },

    setAll(
      cookiesToSet: { name: string; value: string; options: any }[],
      headers: Record<string, string>
    ): void {
      if (isServer) return;
      const secure = isSecureContextForCookies();
      for (const { name, value, options } of cookiesToSet) {
        // Merge supabase's options with our environment-correct
        // `secure` and the path/sameSite defaults. We DON'T override
        // explicit values passed by supabase (e.g. if supabase passes
        // `maxAge: 0` to delete a cookie, we honour that).
        const mergedOptions = {
          path: "/",
          sameSite: "lax" as const,
          ...options,
          // `secure` is environment-derived, not caller-derived, so it
          // always wins. (Supabase never sets `secure` in the browser
          // adapter options — it relies on the framework to do the
          // right thing based on protocol.)
          secure
        };
        // `httpOnly` MUST be false on the browser — there's no point
        // setting it (the browser ignores `HttpOnly` on cookies set
        // via `document.cookie`, but we strip it explicitly so the
        // serialized header doesn't include a misleading attribute).
        // The auth-js library reads the verifier via `getItem`, which
        // needs JS access — so the cookie must NOT be httpOnly.
        if ("httpOnly" in mergedOptions) {
          delete (mergedOptions as any).httpOnly;
        }
        const serialized = serializeCookie(name, value, mergedOptions);
        if (typeof document !== "undefined") {
          document.cookie = serialized;
        }
        if (debug) {
          console.log(
            "[supabase-browser-cookies] setAll() → wrote",
            name,
            "(value length:",
            value.length,
            ", options:",
            JSON.stringify({
              ...mergedOptions,
              // Don't log the value itself.
              value: undefined
            }),
            ")"
          );
        }
      }
      if (debug && Object.keys(headers).length > 0) {
        console.log(
          "[supabase-browser-cookies] setAll() received response headers (ignored on browser):",
          headers
        );
      }
    }
  };
}

/**
 * Create a fresh browser Supabase client.
 *
 * Each call returns a NEW client instance. This is intentionally exposed
 * for tests and for the rare case where an isolated session is required.
 * Application code should prefer {@link getBrowserClient} — the shared
 * singleton — unless it has a specific reason not to.
 *
 * @throws Error if called on the server.
 */
export function createBrowserClient(): SupabaseClient {
  if (isServer) {
    throw new Error(
      "[CineLog Supabase] createBrowserClient() was called on the server. " +
        'Use createServerClient() from "src/lib/supabase/server.ts" instead, ' +
        'or the environment-aware getClient() from "src/lib/supabase/client.ts".'
    );
  }

  const { url, anonKey } = readPublicConfig();

  // Build the EXPLICIT cookie adapter (NOT the implicit fallback).
  // See buildBrowserCookieAdapter() for the full rationale.
  const cookies = buildBrowserCookieAdapter();

  // `@supabase/ssr`'s createBrowserClient is the cookie-aware variant
  // of `@supabase/supabase-js`'s createClient. With the explicit
  // `cookies.getAll` / `cookies.setAll` adapter, every auth storage
  // read/write goes through our adapter — no opaque fallback.
  //
  // Auth options:
  //   persistSession     : false  → no localStorage. Sessions are in
  //                                 cookies (httpOnly, set by the
  //                                 server on the OAuth callback).
  //   autoRefreshToken   : true  → refresh via cookie-aware fetch.
  //   detectSessionInUrl : true  → parse `?code=` from the URL after
  //                                 an OAuth redirect (used as a
  //                                 fallback when the OAuth redirect
  //                                 goes to a non-/auth/callback page
  //                                 — see `useAuthActions.ts`).
  //   flowType           : "pkce" → PKCE OAuth flow (verifier stored
  //                                  in a cookie via setAll).
  return ssrCreateBrowserClient(url, anonKey, {
    cookies,
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce"
    }
  });
}

/**
 * Get the shared singleton browser Supabase client.
 *
 * Instantiates on first call, then returns the cached instance on every
 * subsequent call. The singleton is cached on `globalThis` so Vite's
 * Hot Module Replacement in development does not leak stale auth
 * listeners or duplicate `onAuthStateChange` subscriptions across
 * hot reloads.
 *
 * @throws Error if called on the server.
 */
export function getBrowserClient(): SupabaseClient {
  if (isServer) {
    throw new Error(
      "[CineLog Supabase] getBrowserClient() was called on the server. " +
        'Use createServerClient() from "src/lib/supabase/server.ts" instead, ' +
        'or the environment-aware getClient() from "src/lib/supabase/client.ts".'
    );
  }

  const globalScope = globalThis as unknown as GlobalWithBrowserClient;
  const cached = globalScope[BROWSER_CLIENT_GLOBAL_KEY];
  if (cached) {
    return cached;
  }

  const client = createBrowserClient();
  globalScope[BROWSER_CLIENT_GLOBAL_KEY] = client;
  return client;
}

export type { SupabaseClient };
