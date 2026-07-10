// src/features/watchlist/__tests__/presetAdapter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the PresetRepository singleton BEFORE importing the adapter.
vi.mock("~/lib/supabase/repositories", () => ({
  getPresetRepository: vi.fn(),
}));

import {
  presetRowToFilterPreset,
  fetchPresetsFromSupabase,
  createPresetInSupabase,
  renamePresetInSupabase,
  deletePresetFromSupabase,
} from "../presetAdapter";
import { getPresetRepository } from "~/lib/supabase/repositories";
import { makeVaultFilters, makeFilterPreset } from "~/__test-fixtures__/factories";
import type { PresetRow } from "~/lib/supabase/repositories";

const mockPresetRow: PresetRow = {
  id: "preset-1",
  user_id: "user-1",
  name: "My Preset",
  filters: makeVaultFilters({ type: "movie" }) as unknown as PresetRow["filters"],
  created_at: "2024-01-01T00:00:00Z",
} as unknown as PresetRow;

describe("presetAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("presetRowToFilterPreset", () => {
    it("maps PresetRow to FilterPreset", () => {
      const result = presetRowToFilterPreset(mockPresetRow);
      expect(result.id).toBe("preset-1");
      expect(result.name).toBe("My Preset");
      expect(result.filters).toEqual(makeVaultFilters({ type: "movie" }));
      expect(result.createdAt).toBe("2024-01-01T00:00:00Z");
    });
  });

  describe("fetchPresetsFromSupabase", () => {
    it("returns mapped presets on success", async () => {
      const mockRepo = {
        listPresets: vi.fn().mockResolvedValue({ data: [mockPresetRow], error: null }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await fetchPresetsFromSupabase("user-1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("preset-1");
      expect(mockRepo.listPresets).toHaveBeenCalledWith("user-1");
    });

    it("returns empty array on error", async () => {
      const mockRepo = {
        listPresets: vi.fn().mockResolvedValue({ data: [], error: new Error("Fail") }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await fetchPresetsFromSupabase("user-1");
      expect(result).toEqual([]);
    });

    it("returns empty array when no presets", async () => {
      const mockRepo = {
        listPresets: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await fetchPresetsFromSupabase("user-1");
      expect(result).toEqual([]);
    });
  });

  describe("createPresetInSupabase", () => {
    it("returns true on success", async () => {
      const mockRepo = {
        createPreset: vi.fn().mockResolvedValue({ data: mockPresetRow, error: null }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await createPresetInSupabase("user-1", "New Preset", makeVaultFilters());
      expect(result).toBe(true);
      expect(mockRepo.createPreset).toHaveBeenCalledWith({
        userId: "user-1",
        name: "New Preset",
        filters: makeVaultFilters(),
      });
    });

    it("returns false on error", async () => {
      const mockRepo = {
        createPreset: vi.fn().mockResolvedValue({ data: null, error: new Error("Fail") }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await createPresetInSupabase("user-1", "New", makeVaultFilters());
      expect(result).toBe(false);
    });

    it("returns false when validation fails (empty name)", async () => {
      const mockRepo = {
        createPreset: vi.fn().mockResolvedValue({ data: null, error: new Error("name must be non-empty") }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await createPresetInSupabase("user-1", "", makeVaultFilters());
      expect(result).toBe(false);
    });
  });

  describe("renamePresetInSupabase", () => {
    it("returns true on success", async () => {
      const mockRepo = {
        renamePreset: vi.fn().mockResolvedValue({ data: mockPresetRow, error: null }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await renamePresetInSupabase("preset-1", "New Name");
      expect(result).toBe(true);
      expect(mockRepo.renamePreset).toHaveBeenCalledWith("preset-1", "New Name");
    });

    it("returns false on error", async () => {
      const mockRepo = {
        renamePreset: vi.fn().mockResolvedValue({ data: null, error: new Error("Fail") }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await renamePresetInSupabase("preset-1", "New Name");
      expect(result).toBe(false);
    });
  });

  describe("deletePresetFromSupabase", () => {
    it("returns true on success", async () => {
      const mockRepo = {
        deletePreset: vi.fn().mockResolvedValue({ error: null }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await deletePresetFromSupabase("preset-1");
      expect(result).toBe(true);
      expect(mockRepo.deletePreset).toHaveBeenCalledWith("preset-1");
    });

    it("returns false on error", async () => {
      const mockRepo = {
        deletePreset: vi.fn().mockResolvedValue({ error: new Error("Fail") }),
      };
      vi.mocked(getPresetRepository).mockReturnValue(mockRepo as never);

      const result = await deletePresetFromSupabase("preset-1");
      expect(result).toBe(false);
    });
  });
});
