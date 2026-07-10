/**
 * CineLog V2 — Preset Repository (Barrel)
 * ---------------------------------------------------------------------
 * Public surface of the PresetRepository. Phase 12.1 — foundation only.
 */

export { PresetRepository, getPresetRepository } from "./preset.repository";

export type {
  PresetRow,
  PresetInsert,
  PresetUpdate,
  CreatePresetPayload,
  PresetResult,
  PresetListResult,
  PresetWriteResult
} from "./preset.types";
