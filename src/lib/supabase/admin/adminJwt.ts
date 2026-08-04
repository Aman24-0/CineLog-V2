// src/lib/supabase/admin/adminJwt.ts
//
// CineLog V2 — Admin Session JWT Helpers (Server-Only)
// ---------------------------------------------------------------------
// Minimal HS256 JWT implementation for admin session cookies.
//
// Why not use a library?
//   The admin session is a simple signed token containing only
//   { admin_id, email, exp }. A full JWT library is overkill.
//   This implementation uses Web Crypto (SubtleCrypto) which is
//   available in Vinxi/Nitro's server runtime.
//
// Token lifetime: 4 hours (matches the cookie max-age).
//
// SECURITY:
//   • The signing secret comes from ADMIN_JWT_SECRET env var.
//   • Tokens are signed with HS256 (HMAC-SHA-256).
//   • Token verification checks signature AND expiry.
//   • On any verification failure, the token is rejected.
//
// Why not just use the Supabase session?
//   The Supabase session is for the regular user. Admin access
//   requires the additional PIN check. We can't put "is_admin" in
//   the Supabase JWT because that would require custom JWT claims
//   (a Supabase Pro feature). The admin cookie is a separate,
//   short-lived token that proves the user has passed the PIN gate.

import { isServer } from "solid-js/web";
import { createHmac } from "node:crypto";

const TOKEN_LIFETIME_SECONDS = 4 * 60 * 60; // 4 hours
const COOKIE_NAME = "cinelog_admin_session";

/** Shape of the admin session token payload. */
export interface AdminTokenPayload {
  /** The profiles.id of the admin user. */
  admin_id: string;
  /** The admin's email (for display in the admin UI). */
  email: string;
  /** Issued-at timestamp (seconds since epoch). */
  iat: number;
  /** Expiry timestamp (seconds since epoch). */
  exp: number;
}

/** Returns the admin cookie name (constant). */
export function adminCookieName(): string {
  return COOKIE_NAME;
}

/** Returns the token lifetime in seconds (for setting cookie max-age). */
export function adminTokenLifetime(): number {
  return TOKEN_LIFETIME_SECONDS;
}

/**
 * Base64URL-encode a buffer (no padding, URL-safe chars).
 */
function base64UrlEncode(buf: ArrayBuffer | Buffer): string {
  const bytes = buf instanceof Buffer ? buf : new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64URL-decode a string to a Uint8Array.
 */
function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const decoded = atob(padded + pad);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

/**
 * Read the admin JWT secret from env. Server-only.
 *
 * Enforces a minimum length of 32 characters (Phase 1 audit fix —
 * previously 16 chars, which is too short for an HS256 signing key).
 * 32 chars × 6 bits/char (base64) = 192 bits of entropy, which is
 * well above the 128-bit minimum for HS256. Anything shorter is
 * vulnerable to offline brute-force if the cookie is ever leaked.
 */
function getSecret(): string {
  if (!isServer) {
    throw new Error(
      "[CineLog Admin] adminJwt: server-only function called on browser"
    );
  }
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "[CineLog Admin] ADMIN_JWT_SECRET is missing or too short (<32 chars). " +
        "Generate a 32+ character random string (e.g. `openssl rand -hex 32`)."
    );
  }
  return secret;
}

/**
 * Sign a payload with HS256. Returns "header.payload.signature".
 */
export function signAdminToken(
  payload: Omit<AdminTokenPayload, "iat" | "exp">
): string {
  if (!isServer) {
    throw new Error("[CineLog Admin] signAdminToken: server-only");
  }

  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AdminTokenPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS
  };

  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const secret = getSecret();
  const signature = createHmac("sha256", secret).update(signingInput).digest();
  const signatureB64 = base64UrlEncode(signature);

  return `${signingInput}.${signatureB64}`;
}

/**
 * Verify a token's signature and expiry. Returns the payload, or null
 * if the token is invalid, expired, or malformed.
 *
 * NEVER throws — returns null on any failure so callers can simply
 * treat the user as unauthenticated.
 */
export function verifyAdminToken(
  token: string | null | undefined
): AdminTokenPayload | null {
  if (!isServer) return null;
  if (!token || typeof token !== "string") return null;
  if (token.split(".").length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = token.split(".");
  const signingInput = `${headerB64}.${payloadB64}`;

  // Verify signature (constant-time comparison)
  const secret = getSecret();
  const expectedSignature = createHmac("sha256", secret)
    .update(signingInput)
    .digest();
  const expectedSignatureB64 = base64UrlEncode(expectedSignature);

  // Constant-time comparison to prevent timing attacks
  if (expectedSignatureB64.length !== signatureB64.length) return null;
  let diff = 0;
  for (let i = 0; i < signatureB64.length; i++) {
    diff |= signatureB64.charCodeAt(i) ^ expectedSignatureB64.charCodeAt(i);
  }
  if (diff !== 0) return null;

  // Decode payload
  let payload: AdminTokenPayload;
  try {
    const payloadJson = Buffer.from(base64UrlDecode(payloadB64)).toString(
      "utf-8"
    );
    payload = JSON.parse(payloadJson) as AdminTokenPayload;
  } catch {
    return null;
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;

  // Sanity-check required fields
  if (
    typeof payload.admin_id !== "string" ||
    typeof payload.email !== "string"
  ) {
    return null;
  }

  return payload;
}
