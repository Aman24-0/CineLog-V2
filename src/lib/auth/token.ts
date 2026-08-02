// src/lib/auth/token.ts
//
// CineLog V2 — Unified Access Token Extraction (Server-Only)
// ---------------------------------------------------------------------
// Single source of truth for resolving the caller's Supabase access
// token from an incoming API request.
//
// CineLog stores Supabase sessions in localStorage (NOT cookies), so
// the standard cookie-based session lookup returns null in the
// deployed app. The browser therefore sends the access token via
// one of several channels depending on the request method:
//
//   • GET requests  → Authorization: Bearer <token> header
//                     (or ?accessToken=<token> query param as fallback)
//   • POST/DELETE    → { accessToken: "<token>" } in the JSON body
//                     (or Authorization header as fallback)
//
// This helper tries every channel in priority order and returns the
// first non-empty token found. It NEVER throws — returns null when
// no token is present (caller decides how to handle: 401 or
// "signed-out" empty response).
//
// PRIORITY ORDER
//   1. Authorization: Bearer <token> header
//   2. ?accessToken=<token> query parameter (GET fallback)
//   3. accessToken field in the JSON body (POST fallback)
//   4. sb-*-auth-token cookie (server-side callers / future cookie auth)
//
// The body fallback (3) requires awaiting request.json(), which
// consumes the body stream. Callers that need to read the body
// afterwards should pass `body` as the pre-parsed body so we don't
// double-consume the stream.

import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";

interface APIEvent {
  request: Request;
}

interface ExtractOptions {
  /**
   * Pre-parsed request body (so we don't consume the stream twice).
   * If provided, the helper reads `body.accessToken` from this
   * object instead of awaiting request.json().
   */
  body?: unknown;
}

/**
 * Extract the caller's Supabase access token from an API request.
 *
 * Tries (in order): Authorization header → query param → body → cookie.
 *
 * @returns The token string, or null when no token is present.
 */
export function extractAccessToken(
  event: APIEvent,
  options?: ExtractOptions
): string | null {
  // 1. Authorization: Bearer <token> header
  const authHeader = event.request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token.length > 0) return token;
  }

  // 2. ?accessToken=<token> query parameter (mainly for GET requests
  //    where setting a header is awkward, e.g. <img src> tags).
  try {
    const url = new URL(event.request.url);
    const queryToken = url.searchParams.get("accessToken");
    if (queryToken && queryToken.length > 0) return queryToken;
  } catch {
    // URL parsing can fail in edge cases — skip.
  }

  // 3. accessToken field in the JSON body (mainly for POST/DELETE).
  //    We use the pre-parsed body if provided; otherwise we can't
  //    read the body here (it's a stream that can only be consumed
  //    once). The caller should parse the body first and pass it via
  //    options.body.
  if (options?.body && typeof options.body === "object") {
    const bodyToken = (options.body as { accessToken?: unknown }).accessToken;
    if (typeof bodyToken === "string" && bodyToken.length > 0) {
      return bodyToken;
    }
  }

  // 4. sb-*-auth-token cookie (server-side callers, future cookie auth).
  const cookieHeader = event.request.headers.get("cookie") ?? "";
  const cookieToken = getSupabaseAccessToken(cookieHeader);
  if (cookieToken && cookieToken.length > 0) return cookieToken;

  return null;
}

/**
 * Variant of extractAccessToken that also reads the body stream if
 * needed. Use this for POST/DELETE routes where the body hasn't been
 * parsed yet.
 *
 * @returns The token string (or null) + the parsed body (or null).
 */
export async function extractAccessTokenAsync(
  event: APIEvent
): Promise<{ token: string | null; body: unknown }> {
  // Try the non-body channels first (cheap).
  const headerToken = extractAccessToken(event);
  if (headerToken) {
    // We still need to parse the body for the caller — but since we
    // haven't consumed it yet, the caller can parse it themselves.
    // Return null body to signal "body not yet parsed".
    return { token: headerToken, body: null };
  }

  // No token from header/query — try the body.
  try {
    const body = await event.request.json();
    const token = extractAccessToken(event, { body });
    return { token, body };
  } catch {
    // Body isn't JSON or is empty — fall through to cookie check.
    return { token: extractAccessToken(event), body: null };
  }
}
