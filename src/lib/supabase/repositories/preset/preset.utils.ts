/**
 * CineLog V2 — Preset Repository: Internal Helpers
 * ---------------------------------------------------------------------
 * Validation + payload mapping + error normalisation.
 */

import type {
  CreatePresetPayload,
  PresetInsert,
  PresetUpdate,
  TypedSupabaseClient
} from "./preset.types";
import { getClient } from "../../client";

// ---------------------------------------------------------------------------
// Validation — fail fast before hitting the database
// ---------------------------------------------------------------------------

/**
 * Validate a preset name. Returns `null` if valid, or an `Error` if
 * the name is empty, blank, or not a string.
 */
export function validateName(name: string): Error | null {
  if (typeof name !== "string" || name.trim().length === 0) {
    return new Error("[PresetRepository] name must be a non-empty string.");
  }
  return null;
}

/**
 * Validate that filters is a non-null object. Returns `null` if valid.
 */
export function validateFilters(filters: unknown): Error | null {
  if (filters === null || filters === undefined || typeof filters !== "object") {
    return new Error("[PresetRepository] filters must be a non-null object.");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Payload mapping — camelCase → snake_case
// ---------------------------------------------------------------------------

/**
 * Map a `CreatePresetPayload` to the snake-case `PresetInsert` shape.
 */
export function toInsert(payload: CreatePresetPayload): PresetInsert {
  return {
    user_id: payload.userId,
    name: payload.name,
    filters: payload.filters as unknown as import("../../database.types").Json,
  };
}

/**
 * Build a `PresetUpdate` for renaming a preset.
 */
export function toRenameUpdate(name: string): PresetUpdate {
  return { name };
}

// ---------------------------------------------------------------------------
// Error normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a Supabase / PostgREST error into a plain `Error`.
 */
export function toError(error: unknown): Error | null {
  if (error === null || error === undefined) return null;
  if (error instanceof Error) return error;
  return new Error(String(error));
}

// ---------------------------------------------------------------------------
// Typed client accessor
// ---------------------------------------------------------------------------

export type { TypedSupabaseClient } from "./preset.types";

export function resolveClient(client?: TypedSupabaseClient): TypedSupabaseClient {
  return client ?? getClient();
}
