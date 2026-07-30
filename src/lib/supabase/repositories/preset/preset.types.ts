/**
 * CineLog V2 — Preset Repository: Shared Types
 * ---------------------------------------------------------------------
 * Phase 12.1 — Supabase Presets Foundation
 *
 * Type definitions for the `user_presets` table. Stores user-saved
 * vault filter presets (name + 14-field VaultFilters object as JSONB).
 *
 * Hard deletes only (no soft delete / deleted_at column).
 */

import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate
} from "../../database.types";
import type { VaultFilters } from "~/shared/types";

// ---------------------------------------------------------------------------
// Row / Insert / Update aliases
// ---------------------------------------------------------------------------

export type PresetRow = Tables<"user_presets">;
export type PresetInsert = TablesInsert<"user_presets">;
export type PresetUpdate = TablesUpdate<"user_presets">;

// ---------------------------------------------------------------------------
// Input payload types
// ---------------------------------------------------------------------------

/**
 * Payload for creating a new preset.
 */
export interface CreatePresetPayload {
  readonly userId: string;
  readonly name: string;
  readonly filters: VaultFilters;
}

// ---------------------------------------------------------------------------
// Result types — uniform { data, error } pattern
// ---------------------------------------------------------------------------

export interface PresetResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
}

export interface PresetListResult<T> {
  readonly data: T[];
  readonly error: Error | null;
}

export interface PresetWriteResult {
  readonly error: Error | null;
}

// ---------------------------------------------------------------------------
// Typed Supabase client
// ---------------------------------------------------------------------------

export type TypedSupabaseClient =
  import("@supabase/supabase-js").SupabaseClient<Database>;
