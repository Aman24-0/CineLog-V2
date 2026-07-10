/**
 * CineLog V2 — Preset Repository
 * ---------------------------------------------------------------------
 * Composes read + write modules into a single class. The SOLE
 * data-access layer for the `user_presets` table.
 *
 * Pattern: Component → Hook → Adapter → PresetRepository → Supabase
 *
 * Phase 12.1 — Foundation only. NOT wired into the application yet.
 */

import { getClient } from "../../client";
import type { TypedSupabaseClient } from "./preset.types";
import { getPreset, listPresets } from "./preset.read";
import { createPreset, deletePreset, renamePreset } from "./preset.write";
import type {
  CreatePresetPayload,
  PresetListResult,
  PresetResult,
  PresetRow,
  PresetWriteResult
} from "./preset.types";

export class PresetRepository {
  private readonly supabase: TypedSupabaseClient;

  constructor(client: TypedSupabaseClient = getClient()) {
    this.supabase = client;
  }

  // ---- Reads ----

  /** List all presets for a user (created_at desc). */
  listPresets(userId: string): Promise<PresetListResult<PresetRow>> {
    return listPresets(this.supabase, userId);
  }

  /** Get a single preset by id. */
  getPreset(presetId: string): Promise<PresetResult<PresetRow>> {
    return getPreset(this.supabase, presetId);
  }

  // ---- Writes ----

  /** Create a new preset (validates name + filters). */
  createPreset(payload: CreatePresetPayload): Promise<PresetResult<PresetRow>> {
    return createPreset(this.supabase, payload);
  }

  /** Rename a preset (validates name). */
  renamePreset(presetId: string, name: string): Promise<PresetResult<PresetRow>> {
    return renamePreset(this.supabase, presetId, name);
  }

  /** Hard-delete a preset (permanent, no recovery). */
  deletePreset(presetId: string): Promise<PresetWriteResult> {
    return deletePreset(this.supabase, presetId);
  }
}

// ---- Singleton ----

let _defaultInstance: PresetRepository | null = null;

export function getPresetRepository(): PresetRepository {
  if (typeof window === "undefined") return new PresetRepository();
  if (!_defaultInstance) _defaultInstance = new PresetRepository();
  return _defaultInstance;
}
