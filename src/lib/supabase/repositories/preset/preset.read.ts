/**
 * CineLog V2 — Preset Repository: Read Operations
 * ---------------------------------------------------------------------
 * READ-ONLY queries over the `user_presets` table.
 *
 * RLS compliance: owner only (user_id = auth.uid()). Never uses the
 * service role key.
 */

import type {
  PresetListResult,
  PresetResult,
  PresetRow,
  TypedSupabaseClient
} from "./preset.types";
import { toError } from "./preset.utils";

const TABLE = "user_presets" as const;

/**
 * List all presets for a user, ordered by `created_at` desc (most
 * recently created first).
 *
 * @returns An array of preset rows (empty if none or error).
 */
export async function listPresets(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<PresetListResult<PresetRow>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select()
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return { data: data ?? [], error: toError(error) };
}

/**
 * Get a single preset by id.
 *
 * @returns The preset row, or `null` if not found / error.
 */
export async function getPreset(
  supabase: TypedSupabaseClient,
  presetId: string
): Promise<PresetResult<PresetRow>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select()
    .eq("id", presetId)
    .maybeSingle();

  return { data, error: toError(error) };
}
