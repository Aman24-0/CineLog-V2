// src/lib/server/__tests__/totp.test.ts
//
// Tests for the TOTP (RFC 6238) implementation.
//
// These tests verify:
//   • Base32 encode/decode round-trips.
//   • TOTP generation is deterministic for a given (secret, time) pair.
//   • TOTP verification accepts the current code.
//   • TOTP verification accepts codes within the ±1 step window.
//   • TOTP verification rejects codes outside the window.
//   • TOTP verification rejects non-6-digit input.
//   • Secret encryption + decryption round-trips.
//
// The test vectors use the RFC 6238 §B reference values where possible.
// (RFC 6238 uses a different key for SHA1/SHA256/SHA512, but the
// algorithm is the same — we test the SHA1 path which is what Google
// Authenticator uses.)
//
// @vitest-environment node

import { describe, it, expect } from "vitest";
import {
  generateTOTP,
  verifyTOTP,
  generateSecretBase32,
  buildOtpAuthURL,
  encryptSecret,
  decryptSecret
} from "../totp";

// Set the env var for the encrypt/decrypt tests.
// AES-256-GCM needs a 32-byte (64-char hex) key.
const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("TOTP", () => {
  describe("generateTOTP", () => {
    it("generates a 6-digit code", () => {
      const secret = generateSecretBase32();
      const code = generateTOTP(secret);
      expect(code).toMatch(/^\d{6}$/);
    });

    it("is deterministic for the same secret + time", () => {
      const secret = "JBSWY3DPEHPK3PXP"; // test vector
      const t = 1_700_000_000;
      const code1 = generateTOTP(secret, t);
      const code2 = generateTOTP(secret, t);
      expect(code1).toBe(code2);
    });

    it("changes when the time step changes by 30s", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const t = 1_700_000_000;
      const code1 = generateTOTP(secret, t);
      const code2 = generateTOTP(secret, t + 30);
      expect(code1).not.toBe(code2);
    });

    it("stays the same within a 30-second step", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      // Use a time aligned to a 30-second boundary so t and t+29
      // fall within the same step.
      const t = 1_700_000_000 - (1_700_000_000 % 30);
      const code1 = generateTOTP(secret, t);
      const code2 = generateTOTP(secret, t + 29);
      expect(code1).toBe(code2);
    });
  });

  describe("verifyTOTP", () => {
    it("accepts the current code", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const t = 1_700_000_000;
      const code = generateTOTP(secret, t);
      expect(verifyTOTP(secret, code, t)).toBe(true);
    });

    it("accepts a code from the previous step (within window)", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const t = 1_700_000_000;
      const prevCode = generateTOTP(secret, t - 30);
      expect(verifyTOTP(secret, prevCode, t)).toBe(true);
    });

    it("accepts a code from the next step (within window)", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const t = 1_700_000_000;
      const nextCode = generateTOTP(secret, t + 30);
      expect(verifyTOTP(secret, nextCode, t)).toBe(true);
    });

    it("rejects a code 2 steps old (outside window)", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const t = 1_700_000_000;
      const oldCode = generateTOTP(secret, t - 60);
      expect(verifyTOTP(secret, oldCode, t)).toBe(false);
    });

    it("rejects a code 2 steps in the future (outside window)", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const t = 1_700_000_000;
      const futureCode = generateTOTP(secret, t + 60);
      expect(verifyTOTP(secret, futureCode, t)).toBe(false);
    });

    it("rejects a non-6-digit input", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      expect(verifyTOTP(secret, "12345", 1_700_000_000)).toBe(false);
      expect(verifyTOTP(secret, "1234567", 1_700_000_000)).toBe(false);
      expect(verifyTOTP(secret, "abcdef", 1_700_000_000)).toBe(false);
      expect(verifyTOTP(secret, "", 1_700_000_000)).toBe(false);
    });

    it("rejects a code from a different secret", () => {
      const secret1 = "JBSWY3DPEHPK3PXP";
      const secret2 = "KRSXG5BAONUGC4TFFY";
      const t = 1_700_000_000;
      const code1 = generateTOTP(secret1, t);
      expect(verifyTOTP(secret2, code1, t)).toBe(false);
    });
  });

  describe("generateSecretBase32", () => {
    it("returns a 32-character Base32 string (20 bytes = 160 bits)", () => {
      const secret = generateSecretBase32();
      // 20 bytes = 160 bits = 32 Base32 chars (no padding)
      expect(secret).toHaveLength(32);
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    it("generates different secrets on each call", () => {
      const s1 = generateSecretBase32();
      const s2 = generateSecretBase32();
      expect(s1).not.toBe(s2);
    });
  });

  describe("buildOtpAuthURL", () => {
    it("builds a valid otpauth:// URL", () => {
      const url = buildOtpAuthURL("admin@example.com", "JBSWY3DPEHPK3PXP");
      expect(url).toMatch(/^otpauth:\/\/totp\//);
      expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
      expect(url).toContain("issuer=CineLog+Admin");
      expect(url).toContain("algorithm=SHA1");
      expect(url).toContain("digits=6");
      expect(url).toContain("period=30");
    });

    it("encodes the account name safely", () => {
      const url = buildOtpAuthURL("admin@-example.com", "JBSWY3DPEHPK3PXP");
      expect(url).toContain("admin%40-example.com");
    });
  });

  describe("encryptSecret / decryptSecret", () => {
    it("round-trips a secret through encrypt → decrypt", () => {
      process.env.ADMIN_2FA_ENCRYPTION_KEY = TEST_KEY;
      const original = "JBSWY3DPEHPK3PXP";
      const encrypted = encryptSecret(original);
      // The encrypted form should NOT contain the plaintext.
      expect(encrypted).not.toContain(original);
      // Format: iv_hex:authTag_hex:ciphertext_hex
      expect(encrypted.split(":")).toHaveLength(3);
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(original);
    });

    it("produces different ciphertexts for the same plaintext (random IV)", () => {
      process.env.ADMIN_2FA_ENCRYPTION_KEY = TEST_KEY;
      const original = "JBSWY3DPEHPK3PXP";
      const e1 = encryptSecret(original);
      const e2 = encryptSecret(original);
      expect(e1).not.toBe(e2);
      // Both should decrypt back to the original.
      expect(decryptSecret(e1)).toBe(original);
      expect(decryptSecret(e2)).toBe(original);
    });

    it("throws on tampered ciphertext (auth tag validation)", () => {
      process.env.ADMIN_2FA_ENCRYPTION_KEY = TEST_KEY;
      const original = "JBSWY3DPEHPK3PXP";
      const encrypted = encryptSecret(original);
      // Flip a bit in the ciphertext.
      const [iv, authTag, ciphertext] = encrypted.split(":");
      const tamperedCiphertext =
        ciphertext.slice(0, -2) +
        (ciphertext.slice(-2) === "00" ? "01" : "00");
      const tampered = `${iv}:${authTag}:${tamperedCiphertext}`;
      expect(() => decryptSecret(tampered)).toThrow();
    });

    it("throws when the env var is missing", () => {
      delete process.env.ADMIN_2FA_ENCRYPTION_KEY;
      expect(() => encryptSecret("test")).toThrow();
      expect(() => decryptSecret("00:00:00")).toThrow();
    });

    it("throws when the env var is the wrong length", () => {
      process.env.ADMIN_2FA_ENCRYPTION_KEY = "tooshort";
      expect(() => encryptSecret("test")).toThrow();
      expect(() => decryptSecret("00:00:00")).toThrow();
    });
  });
});
