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
import { normalizeVaultFilters } from "./vaultFilterUtils";

// ---------------------------------------------------------------------------
// Row → FilterPreset mapping
// ---------------------------------------------------------------------------

/**
 * Map a Supabase `PresetRow` to the app's `FilterPreset` type.
 *
 * The `filters` JSONB column is normalized via `normalizeVaultFilters`
 * to handle the v2.6 sort-shape migration: presets saved before v2.6
 * have a single `sort: string` field; presets saved after have separate
 * `sortField` + `sortDirection` fields. The normalizer accepts either
 * shape and produces a v2.6-shaped `VaultFilters`. The `createdAt`
 * field maps from `created_at`.
 */
export function presetRowToFilterPreset(row: PresetRow): FilterPreset {
  return {
    id: row.id,
    name: row.name,
    filters: normalizeVaultFilters(row.filters) as VaultFilters,
    createdAt: row.created_at
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
export async function fetchPresetsFromSupabase(
  userId: string
): Promise<FilterPreset[]> {
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
export async function deletePresetFromSupabase(
  presetId: string
): Promise<boolean> {
  const repo = getPresetRepository();
  const { error } = await repo.deletePreset(presetId);
  if (error) {
    console.error("[presetAdapter] Error deleting preset:", error);
    return false;
  }
  return true;
}
