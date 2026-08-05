// src/features/sync/backup/errorUtils.ts
//
// Defensive error → string conversion utilities for the backup/restore
// pipeline.
//
// Extracted from BackupService.ts (Phase 8 Chunk 3) so the error helpers
// can be unit-tested in isolation and reused by other modules.
//
// All functions here are PURE — no I/O, no side effects.

/**
 * Is the given error a transient network/rate-limit error that should be
 * retried? Returns true for:
 *   - Supabase rate-limit responses (429, "rate limit", "Too many requests")
 *   - Network errors (Failed to fetch, NetworkError, ERR_*)
 *   - 5xx server errors (matched by HTTP status code, NOT substring)
 *   - Connection reset / timeout errors
 *
 * Returns false for permanent errors (constraint violations, invalid data,
 * RLS denials, etc.) — retrying those would never succeed.
 *
 * ── BUG HISTORY ────────────────────────────────────────────────────
 * Previously this function used `haystack.includes("500")` /
 * `"502"` / `"503"` / `"504"` to detect 5xx HTTP errors. That substring
 * match was catastrophically broken: it also matched PostgreSQL SQLSTATE
 * codes that contain those digit sequences — most notably:
 *
 *   23503 (foreign_key_violation) → contains "503" → misclassified as
 *     "503 Service Unavailable" (transient). FK violations are PERMANENT.
 *
 *   23502 (not_null_violation) → contains "502" → misclassified as
 *     "502 Bad Gateway" (transient). NOT NULL violations are PERMANENT.
 *
 * When a batch upsert failed with one of these permanent errors, the
 * entire batch was put in the transient-retry queue instead of the
 * per-item fallback. The result: `imported=0, failed=0` and a stuck
 * progress bar (the second-pass retry loop has no progress reporting,
 * and per-item exponential backoff takes 19+ minutes for 1029 items).
 *
 * The fix: match 5xx errors by HTTP `status` field (exact number),
 * never by substring. SQLSTATE codes are never 3-digit HTTP statuses
 * and should never be tested with `includes()`.
 */
export function isTransientError(err: unknown): boolean {
  const msg = String(extractErrorMessage(err)).toLowerCase();
  const status = Number(extractErrorStatus(err) ?? 0);
  if (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("over_request_limit") ||
    msg.includes("rate_limit") ||
    status === 429 ||
    msg.includes("429") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("network request failed") ||
    msg.includes("err_") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("connection reset") ||
    msg.includes("connection refused") ||
    msg.includes("socket hang up") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("epipe") ||
    // 5xx server errors — matched by HTTP status code (exact number),
    // NOT by substring. Substring matching caused SQLSTATE codes like
    // 23503 (FK violation) and 23502 (NOT NULL violation) to be
    // misclassified as transient 5xx errors.
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes("service unavailable") ||
    msg.includes("bad gateway") ||
    msg.includes("gateway timeout") ||
    msg.includes("internal server error")
  ) {
    return true;
  }
  return false;
}

/**
 * Defensive error → string conversion. NEVER returns "[object Object]" —
 * always extracts the useful message from any error shape.
 *
 * Handles:
 *   - Error instances (uses .message)
 *   - Supabase / PostgREST objects ({ message, code, details, hint })
 *   - Plain objects (JSON.stringify fallback)
 *   - Primitives (string, number)
 *
 * Used to build the failure log entries shown to the user.
 */
export function extractErrorMessage(err: unknown): string {
  if (err == null) return "";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean") return String(err);
  if (typeof err === "object") {
    const e = err as { message?: unknown; reason?: unknown; error?: unknown };
    if (typeof e.message === "string" && e.message.length > 0) return e.message;
    if (typeof e.reason === "string" && e.reason.length > 0) return e.reason;
    if (typeof e.error === "string" && e.error.length > 0) return e.error;
    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown error";
    }
  }
  return String(err);
}

/** Extract a Postgres / PostgREST error code (e.g. "42703", "23505"). */
export function extractErrorCode(err: unknown): string | number | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const e = err as { code?: unknown };
  if (typeof e.code === "string") return e.code;
  if (typeof e.code === "number") return e.code;
  return undefined;
}

/** Extract an HTTP status code if present (Supabase sometimes attaches one). */
export function extractErrorStatus(err: unknown): number | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const e = err as { status?: unknown };
  if (typeof e.status === "number") return e.status;
  return undefined;
}

/**
 * Build a detailed, human-readable reason string for an error.
 *
 * Used by the import failure log so the user can see WHY each item failed
 * instead of "[object Object]".
 */
export function buildFailureReason(err: unknown): string {
  const msg = extractErrorMessage(err);
  const code = extractErrorCode(err);
  if (code) {
    return `[${code}] ${msg || "Database error"}`;
  }
  return msg || "Unknown error";
}

/** Sleep helper for rate-limit-friendly delays. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
