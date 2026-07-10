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
 */
export function toError(error: unknown): Error | null {
  if (error === null || error === undefined) return null;
  if (error instanceof Error) return error;
  return new Error(String(error));
}

/** Typed Supabase client alias. */
export type TypedSupabaseClient = SupabaseClient<Database>;

/** Re-export getClient for repository utils that need it. */
export { getClient };
