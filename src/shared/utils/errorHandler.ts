/**
 * CineLog V2 — Unified Error Handler
 * ---------------------------------------------------------------------
 * P4-16 Fix: Standardizes error handling across all layers.
 *
 * The codebase had inconsistent error patterns:
 *   - Repositories: return { data, error }
 *   - Hooks: some throw, some show toasts, some silently fail
 *   - UI components: mix of inline errors and toasts
 *
 * This module provides a single pattern:
 *   1. Repositories return { data, error } (unchanged)
 *   2. Hooks/adapters use `handleError()` to convert errors into
 *      user-friendly messages and optionally show toasts
 *   3. UI components decide whether to show toasts or inline errors
 *      by checking the error signal
 *
 * Usage:
 *   const result = await someRepositoryCall();
 *   if (result.error) {
 *     const userMessage = handleError(result.error, "Failed to save");
 *     showToast(userMessage, "error");
 *   }
 */

import { useToast } from "~/shared/hooks/useToast";

/**
 * Convert a repository/Supabase error into a user-friendly message.
 *
 * @param error          The error from a repository call.
 * @param fallbackMsg    Default message if the error has no useful info.
 * @param showToastMsg   If provided, shows a toast with this message.
 * @returns The user-friendly error message string.
 */
export function handleError(
  error: unknown,
  fallbackMsg: string = "Something went wrong",
  showToastMsg?: boolean,
): string {
  const message = extractErrorMessage(error, fallbackMsg);

  if (showToastMsg) {
    try {
      const { showToast } = useToast();
      showToast(message, "error");
    } catch {
      // useToast called outside owner — silently continue
    }
  }

  return message;
}

/**
 * Extract a user-friendly error message from any error type.
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;

  if (error instanceof Error) {
    const msg = error.message;
    // Strip technical prefixes like "[VaultRepository]"
    const cleaned = msg.replace(/^\[[\w]+\]\s*/, "");
    // If the cleaned message is still useful, return it
    if (cleaned.length > 5 && cleaned.length < 200) return cleaned;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  // Check for Supabase error shape
  const e = error as { message?: string; error_description?: string };
  if (e?.error_description) return e.error_description;
  if (e?.message) return e.message;

  return fallback;
}

/**
 * Type guard: check if a result has an error.
 */
export function hasError<T extends { error: unknown }>(
  result: T
): result is T & { error: NonNullable<T["error"]> } {
  return result.error != null;
}

/**
 * Assert that a result has no error. Throws if it does.
 * Useful for early-return patterns in async functions.
 */
export function assertNoError<T extends { error: unknown }>(
  result: T,
  context?: string
): asserts result is T & { error: null } {
  if (result.error != null) {
    const msg = extractErrorMessage(result.error, "Operation failed");
    throw new Error(`${context ? `[${context}] ` : ""}${msg}`);
  }
}
