// src/lib/server/rateLimiter.ts
//
// CineLog V2 — DB-Backed Rate Limiter (Server-Only)
// ---------------------------------------------------------------------
// Replaces the 5 in-memory Map-based rate limiters that were effectively
// no-ops on Vercel serverless (every cold start reset the Map).
//
// All state lives in the `rate_limit_buckets` Postgres table, accessed
// via the service-role Supabase client. The table is keyed by
// (bucket, key):
//   - bucket  — logical limiter name (e.g. "account_delete")
//   - key     — rate-limit identity (IP, user_id, "<admin_id>:<action>")
//
// TWO LIMITER SHAPES:
//
//   1. Failure-based (account/delete, admin/auth):
//        - isRateLimited(bucket, key) — is the key currently locked?
//        - recordFailure(bucket, key) — bump the failure counter,
//          lock when count >= max
//        - clearFailures(bucket, key) — wipe the row on success
//
//   2. Count-based (push/send, push/status, email/send):
//        - checkAndIncrement(bucket, key) — atomic increment,
//          returns { allowed, remaining, retryAfterMs }
//
// FAILURE MODE:
//   If the Supabase call fails (network blip, DB outage), the limiter
//   FAILS OPEN — returns "allowed" / "not locked". This is the safer
//   default for a consumer-facing app: a brief outage shouldn't lock
//   legitimate users out of their account. The audit explicitly noted
//   that in-memory limiters were already effectively no-ops, so failing
//   open temporarily is no worse than the status quo.
//
//   The error is logged to stderr so the operator notices.
//
// PERFORMANCE:
//   Each call is one Supabase RPC round-trip (~10-30ms on Vercel→Supabase).
//   For the 5 currently-rate-limited endpoints, this is an acceptable
//   cost — they are not hot paths. The admin mutation limiter adds one
//   round-trip per mutation, also acceptable.

import { isServer } from "solid-js/web";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

/** Configuration for a rate-limit bucket. */
export interface RateLimitConfig {
  /** Max events allowed in the window (for count-based) or failures
   *  before lockout (for failure-based). */
  maxAttempts: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** If > 0, after maxAttempts failures the key is hard-locked for
   *  this long. Only used by failure-based limiters. */
  lockoutMs?: number;
}

/** Pre-defined configs matching the original in-memory limiters. */
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Failure-based: 5 failures → 15-min lockout
  accountDelete: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000
  },
  adminAuth: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000
  },
  // Count-based: max N per window, no hard lockout
  pushSend: {
    maxAttempts: 30,
    windowMs: 60 * 1000
  },
  pushStatus: {
    maxAttempts: 20,
    windowMs: 60 * 1000
  },
  emailSend: {
    maxAttempts: 10,
    windowMs: 24 * 60 * 60 * 1000 // 24 hours
  },
  // Admin mutations: 60 per minute per admin per action
  adminMutation: {
    maxAttempts: 60,
    windowMs: 60 * 1000
  },

  // ─── Phase 13 Chunk 2 — Bug #2: 2FA verify/disable rate limit ────
  // 5 attempts per 5 minutes per admin. Per-admin (NOT per-IP) so a
  // single compromised admin account can't brute-force the 6-digit
  // TOTP code (which has only 1M possibilities — at 5 attempts per
  // 5 min, exhaustively searching takes ~3.5 days, which is plenty
  // of time for the security team to notice + lock the account).
  //
  // The limit is per-admin per action, so verify and disable have
  // independent buckets (an admin can verify once + disable once
  // within the same window without either affecting the other).
  admin2faVerify: {
    maxAttempts: 5,
    windowMs: 5 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000 // 3x the window — slow brute force
  },
  admin2faDisable: {
    maxAttempts: 5,
    windowMs: 5 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000
  },

  // ─── Phase 13 Chunk 2 — Bug #5: share-card rate limit ────────────
  // 20 share cards per hour per user. Headless Chromium is expensive
  // (~50MB RAM per render), so we cap this well below the activity_log-
  // based soft limit (which checked 20 in 60s — far too lenient).
  // The per-user (NOT per-IP) limit means a NAT'd office of users
  // each get their own bucket.
  shareCard: {
    maxAttempts: 20,
    windowMs: 60 * 60 * 1000 // 1 hour
  }
};

/** Bucket names — kept in sync with the configs above. */
export type RateLimitBucket = keyof typeof RATE_LIMIT_CONFIGS;

/** Result of a count-based rate-limit check. */
export interface RateLimitResult {
  /** Whether the request is allowed under the limit. */
  allowed: boolean;
  /** Remaining requests in the current window (0 if blocked). */
  remaining: number;
  /** Milliseconds until the limit resets (for Retry-After headers). */
  retryAfterMs: number;
}

// ─── Failure-based limiter ───────────────────────────────────────────
//
// Used by /api/account/delete and /api/admin/auth.
// Tracks failures per key. After `maxAttempts` failures in `windowMs`,
// the key is hard-locked for `lockoutMs`.

/**
 * Returns true if the key is currently hard-locked.
 * Fails OPEN (returns false) on DB error so legitimate users aren't
 * locked out by a Supabase outage.
 */
export async function isRateLimited(
  bucket: RateLimitBucket,
  key: string
): Promise<boolean> {
  if (!isServer) return false;
  if (!key) return false;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("is_rate_limited", {
      p_bucket: bucket,
      p_key: key
    });

    if (error) {
      console.error(
        `[rateLimiter] is_rate_limited RPC failed for ${bucket}/${key}:`,
        error.message
      );
      return false; // fail open
    }

    return Boolean(data);
  } catch (err) {
    console.error(
      `[rateLimiter] is_rate_limited threw for ${bucket}/${key}:`,
      err
    );
    return false; // fail open
  }
}

/**
 * Record a failure for the given key. Bumps the counter; if the counter
 * crosses `maxAttempts`, the key is locked for `lockoutMs`.
 *
 * Implementation note: we use bump_rate_limit with p_max = maxAttempts - 1
 * so that the maxAttempts-th failure (the one that crosses the threshold)
 * triggers the lockout. After lockout, the counter is reset to 0 so the
 * next window starts fresh.
 */
export async function recordFailure(
  bucket: RateLimitBucket,
  key: string
): Promise<void> {
  if (!isServer) return;
  if (!key) return;

  const config = RATE_LIMIT_CONFIGS[bucket];
  if (!config) {
    console.error(`[rateLimiter] unknown bucket: ${bucket}`);
    return;
  }

  try {
    const supabase = createAdminClient();
    // p_max = maxAttempts - 1 means: the maxAttempts-th failure (count ==
    // maxAttempts) is the one that gets "allowed = false" and triggers
    // the lockout.
    const { error } = await supabase.rpc("bump_rate_limit", {
      p_bucket: bucket,
      p_key: key,
      p_window_ms: config.windowMs,
      p_lockout_ms: config.lockoutMs ?? 0,
      p_max: Math.max(0, config.maxAttempts - 1)
    });

    if (error) {
      console.error(
        `[rateLimiter] recordFailure RPC failed for ${bucket}/${key}:`,
        error.message
      );
    }
  } catch (err) {
    console.error(
      `[rateLimiter] recordFailure threw for ${bucket}/${key}:`,
      err
    );
  }
}

/**
 * Clear all failures for the given key. Called on successful auth so
 * a user who eventually gets the right credentials isn't penalized.
 */
export async function clearFailures(
  bucket: RateLimitBucket,
  key: string
): Promise<void> {
  if (!isServer) return;
  if (!key) return;

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("reset_rate_limit", {
      p_bucket: bucket,
      p_key: key
    });

    if (error) {
      console.error(
        `[rateLimiter] clearFailures RPC failed for ${bucket}/${key}:`,
        error.message
      );
    }
  } catch (err) {
    console.error(
      `[rateLimiter] clearFailures threw for ${bucket}/${key}:`,
      err
    );
  }
}

// ─── Count-based limiter ─────────────────────────────────────────────
//
// Used by /api/push/send, /api/push/status, /api/email/send.
// Allows up to `maxAttempts` events in `windowMs`, no hard lockout.
// Each call atomically increments the counter.

/**
 * Atomically increment the counter for the given key and return whether
 * the request is allowed.
 *
 * Returns { allowed: true, remaining: N } if under the limit.
 * Returns { allowed: false, remaining: 0, retryAfterMs: M } if over.
 *
 * Fails OPEN (allowed: true) on DB error — see module docstring.
 */
export async function checkAndIncrement(
  bucket: RateLimitBucket,
  key: string
): Promise<RateLimitResult> {
  if (!isServer) {
    return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
  }
  if (!key) {
    return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
  }

  const config = RATE_LIMIT_CONFIGS[bucket];
  if (!config) {
    console.error(`[rateLimiter] unknown bucket: ${bucket}`);
    return { allowed: true, remaining: 0, retryAfterMs: 0 };
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("bump_rate_limit", {
      p_bucket: bucket,
      p_key: key,
      p_window_ms: config.windowMs,
      p_lockout_ms: 0, // count-based: no hard lockout
      p_max: config.maxAttempts
    });

    if (error) {
      console.error(
        `[rateLimiter] checkAndIncrement RPC failed for ${bucket}/${key}:`,
        error.message
      );
      return { allowed: true, remaining: 0, retryAfterMs: 0 }; // fail open
    }

    const result = data as
      | { allowed: boolean; count: number; retry_after_ms: number }
      | null;

    if (!result) {
      return { allowed: true, remaining: 0, retryAfterMs: 0 };
    }

    return {
      allowed: Boolean(result.allowed),
      remaining: Math.max(0, config.maxAttempts - (result.count as number)),
      retryAfterMs: Number(result.retry_after_ms ?? 0)
    };
  } catch (err) {
    console.error(
      `[rateLimiter] checkAndIncrement threw for ${bucket}/${key}:`,
      err
    );
    return { allowed: true, remaining: 0, retryAfterMs: 0 }; // fail open
  }
}
