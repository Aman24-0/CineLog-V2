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
