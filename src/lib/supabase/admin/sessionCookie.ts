// src/lib/supabase/admin/sessionCookie.ts
//
// CineLog V2 — Supabase Session Cookie Parser (Server-Only)
// ---------------------------------------------------------------------
// Extracts the Supabase access_token from the Cookie header sent by
// the browser. Supabase stores the auth session under names like
// `sb-<project-ref>-auth-token`. When the session payload is too
// large to fit in a single cookie (~4 KB), Supabase chunks it across
// multiple cookies named `sb-<ref>-auth-token.0`, `sb-<ref>-auth-token.1`,
// etc. We collect every chunk, sort by its numeric suffix, and
// concatenate them before parsing.
//
// The `.code` variant (`sb-<ref>-auth-token.code`) is the PKCE code
// verifier used only during the in-flight OAuth exchange — it is NOT
// a session chunk and is intentionally skipped.
//
// Extracted into a shared module so both /api/admin/auth (login) and
// /api/account/delete (destructive account deletion) can use the
// same parsing logic without duplicating ~90 lines of cookie handling.
//
// SECURITY: This module is server-only. It does not leak any secrets
// to the browser — it only parses cookies that the browser already
// sent us in the request header.

import { isServer } from "solid-js/web";

/**
 * Parse the Cookie header and return the Supabase access_token, if
 * present. Returns null if:
 *   - the cookie header is empty
 *   - no `sb-*-auth-token*` cookies are present
 *   - the session payload can't be parsed (corrupt / malformed)
 *
 * The returned token should still be verified by calling
 * `supabase.auth.getUser(accessToken)` — never trust the cookie
 * payload directly, since cookies can be tampered with by the client.
 */
export function getSupabaseAccessToken(cookieHeader: string): string | null {
  if (!isServer) return null;
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  // Collect the un-chunked cookie (if present) AND any chunked cookies.
  let unchunked: string | null = null;
  const chunks = new Map<number, string>();

  for (const c of cookies) {
    const [rawName, ...rest] = c.trim().split("=");
    if (!rawName) continue;
    const name = rawName.trim();
    if (!name.startsWith("sb-") || !name.includes("-auth-token")) continue;

    // Skip the PKCE code-verifier cookie — it's not a session chunk.
    if (name.endsWith("-auth-token.code")) continue;

    const value = decodeURIComponent(rest.join("="));

    if (name.endsWith("-auth-token")) {
      unchunked = value;
    } else {
      // Chunked: sb-<ref>-auth-token.<N>
      const m = name.match(/-auth-token\.(\d+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        if (Number.isFinite(idx)) chunks.set(idx, value);
      }
    }
  }

  // Prefer the un-chunked cookie when present (older / smaller sessions).
  if (unchunked) return parseAccessTokenFromSessionCookie(unchunked);

  // Otherwise, reassemble chunked cookies in order.
  if (chunks.size > 0) {
    const indices = Array.from(chunks.keys()).sort((a, b) => a - b);
    const assembled = indices.map((i) => chunks.get(i) ?? "").join("");
    return parseAccessTokenFromSessionCookie(assembled);
  }

  return null;
}

/**
 * Supabase stores the session as either:
 *   - A JSON string: {"access_token":"...","refresh_token":"...", ...}
 *   - A base64-URL-encoded string of that JSON (newer versions)
 *   - Or, in some flows, just the access_token directly (rare)
 *
 * We try each in turn.
 */
function parseAccessTokenFromSessionCookie(raw: string): string | null {
  if (!raw) return null;

  // 1. Plain JSON
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.access_token === "string") {
      return parsed.access_token;
    }
  } catch {
    // not JSON, try base64
  }

  // 2. base64-URL → JSON
  try {
    // base64url → base64
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.access_token === "string") {
      return parsed.access_token;
    }
  } catch {
    // not base64 either
  }

  // 3. Raw JWT (fallback — Supabase doesn't usually do this but be safe)
  if (raw.split(".").length === 3 && raw.length > 40) {
    return raw;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Phase 13 Chunk 1 — Authorization Bearer Header Support
// ─────────────────────────────────────────────────────────────────────
// The browser client stores sessions in `localStorage` (NOT cookies) —
// see `src/lib/supabase/browser.ts` for the full rationale. As a
// result, the browser NEVER sends a Supabase auth cookie, so the
// legacy `getSupabaseAccessToken(cookieHeader)` helper returns null
// for any request originating from the browser. All cookie-based
// server-side auth therefore returns 401 for signed-in browser users,
// breaking `/api/auth/trakt/*`, `/api/sync/trakt/*`, and any other
// route that used the cookie path.
//
// The fix is to read the access token from the `Authorization: Bearer
// <token>` header FIRST (the browser sends this header on every
// authenticated fetch), and fall back to the cookie ONLY for backward
// compatibility (e.g. pure SSR routes or server-to-server calls that
// might still rely on cookies).
//
// This helper centralizes that extraction so every API route can
// resolve the caller's access token via a single, consistent entry
// point. The browser client itself is NOT changed — `localStorage`
// remains the correct storage backend for the browser.

/**
 * Extract the Supabase access token from an incoming API Request.
 *
 * Resolution order (first non-empty wins):
 *   1. `Authorization: Bearer <token>` header  ← browser path
 *   2. `sb-*-auth-token` cookie                ← backward-compat / SSR
 *
 * Returns `null` when no token is present — the caller decides
 * whether to return 401 or an empty "signed-out" response.
 *
 * SECURITY: The returned token must still be verified by calling
 * `supabase.auth.getUser(accessToken)` — never trust the header/cookie
 * payload directly, since headers can be tampered with by the client.
 */
export function getSupabaseAccessTokenFromRequest(
  request: Request
): string | null {
  if (!isServer) return null;

  // 1. Authorization: Bearer <token>
  //
  // The browser sends this header on every authenticated fetch (the
  // frontend reads the token from `supabase.auth.getSession()` and
  // attaches it via `headers: { Authorization: \`Bearer ${token}\` }`).
  // This is the PRIMARY auth channel for browser-originated requests.
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token.length > 0) return token;
  }

  // 2. Cookie fallback (backward compatibility)
  //
  // Used by:
  //   • Pure SSR routes that read the session from the Cookie header
  //     (no Authorization header is sent during a navigation).
  //   • Server-to-server calls that forward a captured cookie.
  //   • Any future code path that legitimately uses cookie-based auth.
  //
  // For browser-originated fetches this will typically return null
  // (no Supabase cookie is sent), which is correct — the Bearer path
  // above already returned the token.
  const cookieHeader = request.headers.get("cookie") ?? "";
  return getSupabaseAccessToken(cookieHeader);
}

// ─────────────────────────────────────────────────────────────────────
// Phase 13 Chunk 2 — Bug #3: HTTPS-Aware Admin Cookie Writer
// ─────────────────────────────────────────────────────────────────────
// PREVIOUSLY, `src/routes/api/admin/auth.ts` built the admin session
// cookie with `Secure` HARDCODED into the Set-Cookie string:
//
//   `${name}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`
//
// On `http://localhost:3000` (the standard local dev URL), the
// browser SILENTLY REJECTS any cookie marked `Secure`. The admin
// login route would respond 200 OK with a Set-Cookie header, but
// the cookie never made it into the browser's cookie jar. The next
// request to `/api/admin/*` would arrive with no admin cookie →
// `requireAdmin` returned 401 → the admin panel kept bouncing back
// to the login screen.
//
// THE FIX:
//   • Centralize the admin cookie builder HERE (in sessionCookie.ts,
//     the same module that parses Supabase cookies) so there's one
//     source of truth for cookie attributes.
//   • Make `Secure` conditional on `isHttps` — true in production
//     (Vercel terminates TLS at the edge and forwards as HTTPS via
//     `X-Forwarded-Proto`), false on `http://localhost`.
//   • Provide a single `isRequestHttps(request)` helper so every
//     cookie-writing route uses the same detection logic.
//
// SECURITY:
//   • `Secure` is ALWAYS set in production (HTTPS). The only
//     environment where it's omitted is plain HTTP — which only a
//     developer running `npm run dev` on localhost should ever see.
//   • `HttpOnly` and `SameSite=Strict` are ALWAYS set, even on
//     localhost — these protect against XSS and CSRF respectively,
//     and there's no reason to relax them in dev.
//   • The cookie is `Path=/` so it covers the entire origin.

/**
 * Determine if a request is over HTTPS.
 *
 * Vercel terminates TLS at the edge and forwards the request to the
 * SolidStart server over plain HTTP. The original protocol is preserved
 * in the `X-Forwarded-Proto` header. We check that header first, then
 * fall back to the URL's protocol.
 *
 * Returns `true` for:
 *   • `https://anything` (direct HTTPS)
 *   • Any request with `X-Forwarded-Proto: https` (Vercel / proxy)
 *
 * Returns `false` for:
 *   • `http://localhost:3000` (local dev)
 *   • Any plain HTTP request without the forwarded-proto header
 */
export function isRequestHttps(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto && forwardedProto.split(",")[0].trim() === "https") {
    return true;
  }
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Build the `Set-Cookie` header value for the admin session cookie.
 *
 * Attributes:
 *   • HttpOnly          — never readable by client-side JS (XSS hardening)
 *   • SameSite=Strict   — never sent on cross-site requests (CSRF hardening)
 *   • Path=/            — covers the entire origin
 *   • Max-Age=<seconds> — session lifetime (matches the JWT's `exp` claim)
 *   • Secure            — ONLY when `isHttps` is true. On localhost dev
 *                         (http://), omitting `Secure` is required so the
 *                         browser actually persists the cookie. In
 *                         production (https://), `Secure` is always set
 *                         so the cookie never leaks over plain HTTP.
 *
 * @param token   The signed admin JWT.
 * @param isHttps Whether the originating request was over HTTPS.
 *                Use `isRequestHttps(request)` to compute this.
 * @param cookieName     The admin cookie name (from `adminCookieName()`).
 * @param maxAgeSeconds  Cookie lifetime in seconds (from
 *                       `adminTokenLifetime()` — defaults to 4 hours).
 */
export function buildAdminCookieHeader(
  token: string,
  isHttps: boolean,
  cookieName: string = "cinelog_admin_session",
  maxAgeSeconds: number = 4 * 60 * 60
): string {
  const parts = [
    `${cookieName}=${token}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`
  ];
  if (isHttps) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Build the `Set-Cookie` header value that CLEARS the admin session
 * cookie (sent on logout). Mirrors `buildAdminCookieHeader` — same
 * attributes, but `Max-Age=0` and an empty value, which instructs
 * the browser to delete the cookie immediately.
 *
 * The `Secure` attribute is conditional for the same reason as above:
 * on localhost dev, a `Secure` clear-cookie would be ignored by the
 * browser, so the cookie wouldn't actually be cleared (it'd persist
 * until its natural expiry — 4 hours — which is confusing during
 * local dev testing).
 */
export function buildAdminCookieClearHeader(
  isHttps: boolean,
  cookieName: string = "cinelog_admin_session"
): string {
  const parts = [
    `${cookieName}=`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    "Max-Age=0"
  ];
  if (isHttps) parts.push("Secure");
  return parts.join("; ");
}
