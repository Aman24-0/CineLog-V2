// src/lib/server/totp.ts
//
// TOTP (Time-based One-Time Password) — RFC 6238 implementation.
//
// Phase 6 Part 3 — Task 4: Admin 2FA.
//
// This module is SERVER-ONLY. It uses Node's `crypto` module to
// generate and verify TOTP codes. The shared secret is stored
// AES-encrypted in the `admin_2fa_secrets` table (see migration
// 20260810_add_admin_2fa.sql); this module handles the TOTP math
// and the secret encryption/decryption.
//
// TOTP parameters (RFC 6238 §5.1, matching Google Authenticator):
//   • Algorithm: HMAC-SHA1 (the de-facto standard — every authenticator app supports it)
//   • Digit count: 6
//   • Time step: 30 seconds
//   • T0: 0 (Unix epoch)
//
// WINDOW: We accept codes from the previous step + current step +
// next step (±30s) to tolerate minor clock drift between the user's
// phone and the server. This matches Google Authenticator's behavior.
//
// SECURITY:
//   • The shared secret is 20 bytes (160 bits) — RFC 4226 §4 §R6
//     recommends at least 160 bits.
//   • The secret is Base32-encoded for the QR code (Google
//     Authenticator's expected format).
//   • Server-side, the secret is stored AES-256-GCM-encrypted with
//     a key from ADMIN_2FA_ENCRYPTION_KEY env var.

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

// ─── Constants ──────────────────────────────────────────────────────

const STEP_SECONDS = 30;
const DIGITS = 6;
const T0 = 0;
const SECRET_BYTES = 20; // 160 bits — RFC 4226 minimum
const WINDOW = 1; // ±1 step (±30s) — total 3 steps accepted

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// ─── Base32 encode/decode (RFC 4648) ────────────────────────────────

/**
 * Encode bytes to a Base32 string (no padding — Google Authenticator
 * doesn't require padding for the otpauth URL).
 */
function base32Encode(bytes: Buffer): string {
  let output = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

/**
 * Decode a Base32 string (with or without padding) back to bytes.
 */
function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

// ─── TOTP core ──────────────────────────────────────────────────────

/**
 * Compute the TOTP counter for a given time (seconds since epoch).
 * The counter is floor((time - T0) / STEP_SECONDS).
 */
function counterForTime(timeSeconds: number): number {
  return Math.floor((timeSeconds - T0) / STEP_SECONDS);
}

/**
 * Compute the HMAC-SHA1 of a counter (8-byte big-endian) using the
 * shared secret. Returns the 20-byte HMAC digest.
 */
function hmacForCounter(
  secretBytes: Buffer,
  counter: number
): Buffer {
  const buf = Buffer.alloc(8);
  // Write as big-endian 64-bit. counter is a positive integer ≤ 2^48
  // in practice (it would take ~9 million years of 30s steps).
  buf.writeBigUInt64BE(BigInt(counter));
  return createHmac("sha1", secretBytes).update(buf).digest();
}

/**
 * Dynamic truncation (RFC 4226 §5.3): take the low 4 bits of the
 * last HMAC byte as the offset, then extract 4 bytes at that offset
 * and mask the high bit (to avoid signed/unsigned ambiguity in
// different languages).
 */
function dynamicTruncate(hmac: Buffer): number {
  const offset = hmac[hmac.length - 1] & 0x0f;
  // Mask the high bit per RFC 4226 §5.3
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return binary;
}

/**
 * Generate a 6-digit TOTP code for the given counter.
 *
 * Returns the code as a string (zero-padded to 6 digits).
 */
function codeForCounter(
  secretBytes: Buffer,
  counter: number
): string {
  const hmac = hmacForCounter(secretBytes, counter);
  const truncated = dynamicTruncate(hmac);
  const code = truncated % 10 ** DIGITS;
  return code.toString().padStart(DIGITS, "0");
}

/**
 * Generate the current TOTP code for the given Base32 secret.
 *
 * @param secretBase32 - The shared secret as a Base32 string (no padding).
 * @param atTimeSeconds - Optional: the time to compute the code at
 *   (defaults to now). Useful for testing.
 */
export function generateTOTP(
  secretBase32: string,
  atTimeSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const secretBytes = base32Decode(secretBase32);
  const counter = counterForTime(atTimeSeconds);
  return codeForCounter(secretBytes, counter);
}

/**
 * Verify a TOTP code against the given Base32 secret.
 *
 * Accepts codes from the previous step, current step, and next step
 * (±30s window) to tolerate minor clock drift between the user's
 * phone and the server.
 *
 * @returns true if the code is valid for any of the accepted steps.
 */
export function verifyTOTP(
  secretBase32: string,
  code: string,
  atTimeSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  // Strict format check — code must be a 6-digit string.
  if (!/^\d{6}$/.test(code)) return false;

  const secretBytes = base32Decode(secretBase32);
  const currentCounter = counterForTime(atTimeSeconds);

  // Check current ± WINDOW steps. Constant-time comparison is
  // important here to prevent timing attacks that could narrow
  // down the valid code window.
  for (let offset = -WINDOW; offset <= WINDOW; offset++) {
    const candidate = codeForCounter(secretBytes, currentCounter + offset);
    if (constantTimeEquals(candidate, code)) {
      return true;
    }
  }
  return false;
}

// ─── Phase 13 Chunk 2 — TOTP Replay Protection ──────────────────────
//
// RFC 6238 TOTP codes are valid for ~30s (one step), and we accept
// codes within a ±1 step window (±30s) to tolerate clock drift.
// That means a single code is accepted for up to 90 seconds — so
// an attacker who intercepts a code can reuse it within that window.
//
// `verifyTOTPWithReplay` returns BOTH the validity flag AND the
// time-step counter that produced the matching code. Callers persist
// the counter as `last_used_counter` and reject any future code
// whose counter is <= that value. Since the counter strictly
// increases over time, this means each TOTP code can be used at
// most ONCE — closing the replay window.
//
// The existing `verifyTOTP` (above) is kept unchanged so all
// existing tests + callers continue to work.

/**
 * Result of a replay-protected TOTP verification.
 *
 *   valid          — true iff the code is well-formed, matches a
 *                    step within the ±WINDOW window, AND that step's
 *                    counter is strictly greater than `lastUsedCounter`
 *                    (i.e. the code hasn't been used before).
 *
 *   matchedCounter — the time-step counter that produced the matching
 *                    code. Callers should persist this as the new
 *                    `last_used_counter` ONLY when `valid === true`.
 *                    Returns `null` when no match was found (so the
 *                    caller can skip the DB update).
 */
export interface TOTPReplayResult {
  valid: boolean;
  matchedCounter: number | null;
}

/**
 * Verify a TOTP code with replay protection.
 *
 * @param secretBase32     The shared secret as a Base32 string.
 * @param code             The 6-digit code from the user's authenticator.
 * @param lastUsedCounter  The highest counter previously accepted for
 *                         this secret (NULL or 0 = no prior use). Codes
 *                         whose counter is <= this value are rejected.
 * @param atTimeSeconds    Optional: the time to verify at (defaults to now).
 *
 * @returns { valid, matchedCounter } — see `TOTPReplayResult`.
 *
 * SECURITY:
 *   • Constant-time comparison is used to prevent timing attacks.
 *   • The replay check is "<=" (NOT "<") so the SAME code can never
 *     be accepted twice, even within the ±WINDOW window.
 *   • `matchedCounter` is returned even when the code is valid but
 *     stale (counter <= lastUsedCounter)? — NO: it's only returned
 *     when the code MATCHES a step. When valid=false because of
 *     replay, matchedCounter IS set so the caller can log which
 *     counter was rejected (useful for debugging).
 */
export function verifyTOTPWithReplay(
  secretBase32: string,
  code: string,
  lastUsedCounter: number | null,
  atTimeSeconds: number = Math.floor(Date.now() / 1000)
): TOTPReplayResult {
  // Strict format check — code must be a 6-digit string.
  if (!/^\d{6}$/.test(code)) {
    return { valid: false, matchedCounter: null };
  }

  const secretBytes = base32Decode(secretBase32);
  const currentCounter = counterForTime(atTimeSeconds);

  // Find the first matching counter in the ±WINDOW window. We
  // iterate from the OLDEST step (-WINDOW) to the NEWEST (+WINDOW)
  // so we return the smallest matching counter — but actually for
  // replay protection we want the EXACT counter that matched, and
  // only one offset will match (the function is bijective over
  // the window for a given code at a given time).
  for (let offset = -WINDOW; offset <= WINDOW; offset++) {
    const candidateCounter = currentCounter + offset;
    const candidateCode = codeForCounter(secretBytes, candidateCounter);
    if (constantTimeEquals(candidateCode, code)) {
      // Found the matching counter. Now check replay protection:
      // reject if this counter has been used before (or is the
      // same as the last-used counter).
      const lastUsed = lastUsedCounter ?? 0;
      if (candidateCounter <= lastUsed) {
        // Replay detected — the code matches but the counter is
        // stale. Return the matched counter so the caller can log
        // which step was rejected, but flag valid=false.
        return { valid: false, matchedCounter: candidateCounter };
      }
      return { valid: true, matchedCounter: candidateCounter };
    }
  }

  return { valid: false, matchedCounter: null };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Secret generation + encryption ─────────────────────────────────

/**
 * Generate a new random 20-byte (160-bit) shared secret, returned
 * as a Base32 string (no padding) for inclusion in the otpauth URL.
 */
export function generateSecretBase32(): string {
  // Server-only — relies on node:crypto (not bundled for the browser).
  const bytes = randomBytes(SECRET_BYTES);
  return base32Encode(bytes);
}

/**
 * Build the otpauth:// URL that QR code generators expect.
 *
 * Format (Google Authenticator spec):
 *   otpauth://totp/<issuer>:<account>?secret=<secret>&issuer=<issuer>&algorithm=SHA1&digits=6&period=30
 */
export function buildOtpAuthURL(
  account: string,
  secretBase32: string,
  issuer: string = "CineLog Admin"
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS)
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * AES-256-GCM encrypt a TOTP secret (Base32 string) for storage.
 *
 * Uses the ADMIN_2FA_ENCRYPTION_KEY env var as the encryption key.
 * The key must be a 64-character hex string (32 bytes = 256 bits).
 *
 * Returns a single string in the format:
 *   "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 * so the entire encrypted blob fits in a single TEXT column.
 */
export function encryptSecret(secretBase32: string): string {
  // Server-only — relies on node:crypto (not bundled for the browser).
  const keyHex = process.env.ADMIN_2FA_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "ADMIN_2FA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)"
    );
  }
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12); // 96-bit IV — recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secretBase32, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypt a TOTP secret from storage.
 *
 * Reverses `encryptSecret`. Throws if the auth tag doesn't validate
 * (i.e. the ciphertext was tampered with).
 */
export function decryptSecret(storedCipher: string): string {
  // Server-only — relies on node:crypto (not bundled for the browser).
  const keyHex = process.env.ADMIN_2FA_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "ADMIN_2FA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)"
    );
  }
  const key = Buffer.from(keyHex, "hex");
  const parts = storedCipher.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format (expected iv:authTag:ciphertext)");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}
