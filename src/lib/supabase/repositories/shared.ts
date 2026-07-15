/**
 * CineLog V2 — Shared Repository Utilities
 * ---------------------------------------------------------------------
 * Common helpers used across all repositories. Extracted to eliminate
 * the 6 duplicate `toError` functions that existed in every repository's
 * utils file.
 */

import { getClient } from "../client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

/**
 * Normalise a Supabase / PostgREST error into a plain `Error`.
 *
 * Supabase / PostgREST returns errors as plain objects (NOT Error
 * instances) shaped like:
 *   { message: string, code: string, details: string, hint: string }
 *
 * Previously this function did `new Error(String(error))`, which on a
 * plain object produced `new Error("[object Object]")` — completely
 * hiding the real error reason. Every failed upsert logged as
 * "[object Object]" in the import failure UI, leaving the user with
 * no way to understand what went wrong.
 *
 * Now we extract `.message`, `.code`, `.details`, `.hint` from any
 * object error and build a readable Error. Falls back to `String()`
 * only for primitives (strings, numbers).
 */
export function toError(error: unknown): Error | null {
  if (error === null || error === undefined) return null;
  if (error instanceof Error) return error;

  // Primitive (string / number / boolean) — wrap directly.
  if (typeof error !== "object") return new Error(String(error));

  // Object error — typical Supabase / PostgREST shape.
  const e = error as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    reason?: unknown;
  };

  // Try to assemble a readable message.
  const msgRaw = e.message;
  const msg = typeof msgRaw === "string" ? msgRaw : (msgRaw == null ? "" : String(msgRaw));
  const code = typeof e.code === "string" && e.code.length > 0 ? e.code : "";
  const details = typeof e.details === "string" && e.details.length > 0 ? e.details : "";
  const hint = typeof e.hint === "string" && e.hint.length > 0 ? e.hint : "";
  const reason = typeof e.reason === "string" && e.reason.length > 0 ? e.reason : "";

  // Prefer the assembled message; if every field is empty, fall back to
  // JSON.stringify so the caller at least sees the shape of the error
  // (better than "[object Object]").
  const parts: string[] = [];
  if (msg) parts.push(msg);
  if (reason && reason !== msg) parts.push(reason);
  if (details) parts.push(`Details: ${details}`);
  if (hint) parts.push(`Hint: ${hint}`);

  const assembled = parts.length > 0
    ? parts.join(" | ")
    : `Supabase error: ${JSON.stringify(error)}`;

  const err = new Error(code ? `[${code}] ${assembled}` : assembled);

  // Preserve the original fields on the Error object so callers that
  // inspect `err.code` / `err.details` / `err.hint` still work.
  Object.assign(err, { code, details, hint });
  return err;
}

/** Typed Supabase client alias. */
export type TypedSupabaseClient = SupabaseClient<Database>;

/** Re-export getClient for repository utils that need it. */
export { getClient };
