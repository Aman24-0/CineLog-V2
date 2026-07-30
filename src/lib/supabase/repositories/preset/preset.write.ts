/**
 * CineLog V2 — Preset Repository: Write Operations
 * ---------------------------------------------------------------------
 * Create / rename / delete operations over the `user_presets` table.
 *
 * Hard deletes only — no soft delete (no deleted_at column).
 *
 * RLS compliance: owner only (user_id = auth.uid()).
 */

import type {
  CreatePresetPayload,
  PresetResult,
  PresetRow,
  PresetWriteResult,
  TypedSupabaseClient
} from "./preset.types";
import {
  toError,
  toInsert,
  toRenameUpdate,
  validateFilters,
  validateName
} from "./preset.utils";

const TABLE = "user_presets" as const;

/**
 * Create a new preset.
 *
 * Validates name (non-empty) and filters (non-null) before inserting.
 * Duplicate names are allowed (no UNIQUE constraint).
 *
 * @returns The created preset row, or `null` + `error`.
 */
export async function createPreset(
  supabase: TypedSupabaseClient,
  payload: CreatePresetPayload
): Promise<PresetResult<PresetRow>> {
  const nameError = validateName(payload.name);
  if (nameError) return { data: null, error: nameError };

  const filtersError = validateFilters(payload.filters);
  if (filtersError) return { data: null, error: filtersError };

  const insert = toInsert(payload);
  const { data, error } = await supabase
    .from(TABLE)
    .insert(insert)
    .select()
    .single();

  return { data, error: toError(error) };
}

/**
 * Rename a preset by id.
 *
 * Validates the new name (non-empty) before updating.
 *
 * @returns The updated preset row, or `null` + `error`.
 */
export async function renamePreset(
  supabase: TypedSupabaseClient,
  presetId: string,
  name: string
): Promise<PresetResult<PresetRow>> {
  const nameError = validateName(name);
  if (nameError) return { data: null, error: nameError };

  const { data, error } = await supabase
    .from(TABLE)
    .update(toRenameUpdate(name))
    .eq("id", presetId)
    .select()
    .single();

  return { data, error: toError(error) };
}

/**
 * Hard-delete a preset by id.
 *
 * Permanently removes the row — no soft delete, no recovery.
 *
 * @returns `{ error }` — null on success.
 */
export async function deletePreset(
  supabase: TypedSupabaseClient,
  presetId: string
): Promise<PresetWriteResult> {
  const { error } = await supabase.from(TABLE).delete().eq("id", presetId);

  return { error: toError(error) };
}
