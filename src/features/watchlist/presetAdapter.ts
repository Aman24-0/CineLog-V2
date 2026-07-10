/**
 * CineLog V2 — Preset Adapter
 * ---------------------------------------------------------------------
 * Phase 12.2 — Complete Presets Migration
 *
 * The SOLE bridge between the application's `FilterPreset` type and the
 * Supabase `user_presets` table via PresetRepository.
 *
 * Architecture:
 *   useVault → presetAdapter → PresetRepository → Supabase → PostgreSQL
 *
 * No Firestore. No watchlistService.
 */

import { getPresetRepository } from "~/lib/supabase/repositories";
import type { PresetRow } from "~/lib/supabase/repositories";
import type { FilterPreset, VaultFilters } from "~/shared/types";

// ---------------------------------------------------------------------------
// Row → FilterPreset mapping
// ---------------------------------------------------------------------------

/**
 * Map a Supabase `PresetRow` to the app's `FilterPreset` type.
 *
 * The `filters` JSONB column is cast to `VaultFilters` — the shape is
 * identical (14 string fields). The `createdAt` field maps from
 * `created_at` (kept as `any` to match the existing FilterPreset type).
 */
export function presetRowToFilterPreset(row: PresetRow): FilterPreset {
  return {
    id: row.id,
    name: row.name,
    filters: row.filters as unknown as VaultFilters,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// READ: Fetch all presets for a user
// ---------------------------------------------------------------------------

/**
 * Fetch all presets for a user from Supabase, ordered by `created_at`
 * desc (matching the previous Firestore behavior).
 *
 * @returns An array of `FilterPreset` (empty if none or error).
 */
export async function fetchPresetsFromSupabase(userId: string): Promise<FilterPreset[]> {
  const repo = getPresetRepository();
  const { data, error } = await repo.listPresets(userId);
  if (error) {
    console.error("[presetAdapter] Error fetching presets:", error);
    return [];
  }
  return data.map(presetRowToFilterPreset);
}

// ---------------------------------------------------------------------------
// WRITE: Create / Rename / Delete
// ---------------------------------------------------------------------------

/**
 * Create a new preset in Supabase.
 *
 * @returns true on success, false on failure.
 */
export async function createPresetInSupabase(
  userId: string,
  name: string,
  filters: VaultFilters
): Promise<boolean> {
  const repo = getPresetRepository();
  const { error } = await repo.createPreset({ userId, name, filters });
  if (error) {
    console.error("[presetAdapter] Error creating preset:", error);
    return false;
  }
  return true;
}

/**
 * Rename a preset in Supabase.
 *
 * @returns true on success, false on failure.
 */
export async function renamePresetInSupabase(
  presetId: string,
  name: string
): Promise<boolean> {
  const repo = getPresetRepository();
  const { error } = await repo.renamePreset(presetId, name);
  if (error) {
    console.error("[presetAdapter] Error renaming preset:", error);
    return false;
  }
  return true;
}

/**
 * Hard-delete a preset from Supabase.
 *
 * @returns true on success, false on failure.
 */
export async function deletePresetFromSupabase(presetId: string): Promise<boolean> {
  const repo = getPresetRepository();
  const { error } = await repo.deletePreset(presetId);
  if (error) {
    console.error("[presetAdapter] Error deleting preset:", error);
    return false;
  }
  return true;
}
