// src/lib/supabase/repositories/__tests__/presetRepository.test.ts
import { describe, it, expect, vi } from "vitest";
import { PresetRepository } from "../preset/preset.repository";
import {
  validateName,
  validateFilters,
  toInsert,
  toRenameUpdate,
} from "../preset/preset.utils";
import type { PresetRow, CreatePresetPayload } from "../preset/preset.types";
import { createMockSupabase, createMockSupabaseError } from "~/__test-fixtures__/mockSupabase";
import { makeVaultFilters } from "~/__test-fixtures__/factories";

const mockPresetRow: PresetRow = {
  id: "preset-1",
  user_id: "user-1",
  name: "My Preset",
  filters: makeVaultFilters({ type: "movie" }) as unknown as PresetRow["filters"],
  created_at: "2024-01-01T00:00:00Z",
} as unknown as PresetRow;

describe("PresetRepository", () => {
  describe("listPresets", () => {
    it("returns list of presets on success", async () => {
      const { client } = createMockSupabase({ listData: [mockPresetRow] });
      const repo = new PresetRepository(client as never);
      const result = await repo.listPresets("user-1");
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it("returns empty array when no presets", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new PresetRepository(client as never);
      const result = await repo.listPresets("user-1");
      expect(result.data).toEqual([]);
    });

    it("returns error on failure", async () => {
      const err = new Error("Query failed");
      const { client } = createMockSupabaseError(err);
      const repo = new PresetRepository(client as never);
      const result = await repo.listPresets("user-1");
      expect(result.data).toEqual([]);
      expect(result.error).toBe(err);
    });
  });

  describe("getPreset", () => {
    it("returns preset when found", async () => {
      const { client } = createMockSupabase({ singleData: mockPresetRow });
      const repo = new PresetRepository(client as never);
      const result = await repo.getPreset("preset-1");
      expect(result.data).toEqual(mockPresetRow);
    });

    it("returns null when not found", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new PresetRepository(client as never);
      const result = await repo.getPreset("nonexistent");
      expect(result.data).toBeNull();
    });
  });

  describe("createPreset", () => {
    it("creates preset on success", async () => {
      const { client } = createMockSupabase({ singleData: mockPresetRow });
      const repo = new PresetRepository(client as never);
      const payload: CreatePresetPayload = {
        userId: "user-1",
        name: "My Preset",
        filters: makeVaultFilters(),
      };
      const result = await repo.createPreset(payload);
      expect(result.data).toEqual(mockPresetRow);
    });

    it("returns error when name is empty", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new PresetRepository(client as never);
      const result = await repo.createPreset({
        userId: "user-1",
        name: "",
        filters: makeVaultFilters(),
      });
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error!.message).toContain("non-empty");
    });

    it("returns error when name is whitespace only", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new PresetRepository(client as never);
      const result = await repo.createPreset({
        userId: "user-1",
        name: "   ",
        filters: makeVaultFilters(),
      });
      expect(result.error).toBeInstanceOf(Error);
    });

    it("returns error when filters is null", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new PresetRepository(client as never);
      const result = await repo.createPreset({
        userId: "user-1",
        name: "Valid Name",
        filters: null as unknown as import("~/shared/types").VaultFilters,
      });
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error!.message).toContain("non-null");
    });

    it("returns error on insert failure", async () => {
      const err = new Error("Insert failed");
      const { client } = createMockSupabaseError(err);
      const repo = new PresetRepository(client as never);
      const result = await repo.createPreset({
        userId: "user-1",
        name: "Valid",
        filters: makeVaultFilters(),
      });
      expect(result.error).toBe(err);
    });
  });

  describe("renamePreset", () => {
    it("renames preset on success", async () => {
      const { client } = createMockSupabase({ singleData: { ...mockPresetRow, name: "New Name" } });
      const repo = new PresetRepository(client as never);
      const result = await repo.renamePreset("preset-1", "New Name");
      expect(result.data?.name).toBe("New Name");
    });

    it("returns error when new name is empty", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new PresetRepository(client as never);
      const result = await repo.renamePreset("preset-1", "");
      expect(result.error).toBeInstanceOf(Error);
    });
  });

  describe("deletePreset", () => {
    it("returns no error on success", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new PresetRepository(client as never);
      const result = await repo.deletePreset("preset-1");
      expect(result.error).toBeNull();
    });

    it("returns error on failure", async () => {
      const err = new Error("Delete failed");
      const { client } = createMockSupabaseError(err);
      const repo = new PresetRepository(client as never);
      const result = await repo.deletePreset("preset-1");
      expect(result.error).toBe(err);
    });
  });
});

describe("preset.utils", () => {
  describe("validateName", () => {
    it("returns null for valid name", () => {
      expect(validateName("My Preset")).toBeNull();
    });
    it("returns Error for empty string", () => {
      expect(validateName("")).toBeInstanceOf(Error);
    });
    it("returns Error for whitespace-only string", () => {
      expect(validateName("  ")).toBeInstanceOf(Error);
    });
    it("returns Error for non-string", () => {
      expect(validateName(123 as unknown as string)).toBeInstanceOf(Error);
    });
  });

  describe("validateFilters", () => {
    it("returns null for valid object", () => {
      expect(validateFilters({ type: "all" })).toBeNull();
    });
    it("returns Error for null", () => {
      expect(validateFilters(null)).toBeInstanceOf(Error);
    });
    it("returns Error for undefined", () => {
      expect(validateFilters(undefined)).toBeInstanceOf(Error);
    });
    it("returns Error for non-object", () => {
      expect(validateFilters("string")).toBeInstanceOf(Error);
    });
  });

  describe("toInsert", () => {
    it("maps payload to insert shape", () => {
      const filters = makeVaultFilters({ type: "movie" });
      const result = toInsert({
        userId: "u1",
        name: "Test",
        filters,
      });
      expect(result.user_id).toBe("u1");
      expect(result.name).toBe("Test");
      expect(result.filters).toEqual(filters);
    });
  });

  describe("toRenameUpdate", () => {
    it("returns { name } update object", () => {
      expect(toRenameUpdate("New Name")).toEqual({ name: "New Name" });
    });
  });
});
