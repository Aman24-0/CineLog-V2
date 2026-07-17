// src/lib/supabase/repositories/__tests__/vaultRepository.test.ts
import { describe, it, expect, vi } from "vitest";
import { VaultRepository } from "../vault/vault.repository";
import type {
  VaultRow,
  VaultIdentity,
  CreateVaultItemPayload,
} from "../vault/vault.types";
import {
  validateRating,
  validateProgressMinutes,
  toVaultInsert,
  applySort,
  applyPagination,
} from "../vault/vault.utils";
import { toError } from "../shared";
import { createMockSupabase, createMockSupabaseError } from "~/__test-fixtures__/mockSupabase";

// ─────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────

const mockVaultRow: VaultRow = {
  user_id: "user-1",
  tmdb_id: 123,
  media_type: "movie",
  status: "planned",
  is_favorite: false,
  is_pinned: false,
  rating: null,
  notes: null,
  rewatch_count: 0,
  progress_minutes: null,
  watched_on: null,
  started_at: null,
  completed_at: null,
  last_activity_at: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  deleted_at: null,
} as unknown as VaultRow;

const identity: VaultIdentity = {
  userId: "user-1",
  tmdbId: 123,
  mediaType: "movie",
};

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe("VaultRepository", () => {
  describe("createVaultItem", () => {
    it("returns the created row on success", async () => {
      const { client } = createMockSupabase({ singleData: mockVaultRow });
      const repo = new VaultRepository(client as never);
      const payload: CreateVaultItemPayload = {
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie",
      };
      const result = await repo.createVaultItem(payload);
      expect(result.data).toEqual(mockVaultRow);
      expect(result.error).toBeNull();
    });

    it("returns error when insert fails", async () => {
      const err = new Error("Insert failed");
      const { client } = createMockSupabaseError(err);
      const repo = new VaultRepository(client as never);
      const result = await repo.createVaultItem({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie",
      });
      expect(result.data).toBeNull();
      expect(result.error).toBe(err);
    });
  });

  describe("getVaultItem", () => {
    it("returns the row when found", async () => {
      const { client } = createMockSupabase({ singleData: mockVaultRow });
      const repo = new VaultRepository(client as never);
      const result = await repo.getVaultItem(identity);
      expect(result.data).toEqual(mockVaultRow);
      expect(result.error).toBeNull();
    });

    it("returns null data when not found (maybeSingle)", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new VaultRepository(client as never);
      const result = await repo.getVaultItem(identity);
      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });

    it("returns error on query failure", async () => {
      const err = new Error("Network error");
      const { client } = createMockSupabaseError(err);
      const repo = new VaultRepository(client as never);
      const result = await repo.getVaultItem(identity);
      expect(result.data).toBeNull();
      expect(result.error).toBe(err);
    });
  });

  describe("getVaultByTmdbId", () => {
    it("delegates to getVaultItem with the same identity", async () => {
      const { client } = createMockSupabase({ singleData: mockVaultRow });
      const repo = new VaultRepository(client as never);
      const result = await repo.getVaultByTmdbId("user-1", 123, "movie");
      expect(result.data).toEqual(mockVaultRow);
    });
  });

  describe("getVaultByStatus", () => {
    it("returns list of rows on success", async () => {
      const rows = [mockVaultRow, { ...mockVaultRow, tmdb_id: 456 }];
      const { client } = createMockSupabase({ listData: rows });
      const repo = new VaultRepository(client as never);
      const result = await repo.getVaultByStatus("user-1", "watching");
      expect(result.data).toHaveLength(2);
      expect(result.error).toBeNull();
    });

    it("returns empty array when no rows", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new VaultRepository(client as never);
      const result = await repo.getVaultByStatus("user-1", "watching");
      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it("returns error on query failure", async () => {
      const err = new Error("Query failed");
      const { client } = createMockSupabaseError(err);
      const repo = new VaultRepository(client as never);
      const result = await repo.getVaultByStatus("user-1", "watching");
      expect(result.data).toEqual([]);
      expect(result.error).toBe(err);
    });

    it("accepts sort + pagination options", async () => {
      const { client, query } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new VaultRepository(client as never);
      await repo.getVaultByStatus("user-1", "watching", {
        sort: { field: "rating", direction: "desc" },
        pagination: { limit: 10, offset: 0 },
      });
      expect(query.order).toHaveBeenCalledWith("rating", { ascending: false });
      expect(query.range).toHaveBeenCalledWith(0, 9);
    });
  });

  describe("getFavorites", () => {
    it("returns favorites list", async () => {
      const { client } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new VaultRepository(client as never);
      const result = await repo.getFavorites("user-1");
      expect(result.data).toHaveLength(1);
    });
  });

  describe("getPinned", () => {
    it("returns pinned list", async () => {
      const { client } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new VaultRepository(client as never);
      const result = await repo.getPinned("user-1");
      expect(result.data).toHaveLength(1);
    });
  });

  describe("getRecentlyUpdated", () => {
    it("returns list ordered by updated_at desc", async () => {
      const { client, query } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new VaultRepository(client as never);
      await repo.getRecentlyUpdated("user-1");
      expect(query.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    });
  });

  describe("searchVault", () => {
    it("returns matching rows", async () => {
      const { client, query } = createMockSupabase({ listData: [mockVaultRow] });
      const repo = new VaultRepository(client as never);
      const result = await repo.searchVault({
        userId: "user-1",
        searchTerm: "inception",
      });
      expect(result.data).toHaveLength(1);
      expect(query.ilike).toHaveBeenCalledWith("notes", "%inception%");
    });
  });

  describe("updateVaultItem", () => {
    it("returns updated row on success", async () => {
      const { client } = createMockSupabase({ singleData: { ...mockVaultRow, rating: 9 } });
      const repo = new VaultRepository(client as never);
      const result = await repo.updateVaultItem(identity, { rating: 9 });
      expect(result.data?.rating).toBe(9);
    });

    it("returns error on failure", async () => {
      const err = new Error("Update failed");
      const { client } = createMockSupabaseError(err);
      const repo = new VaultRepository(client as never);
      const result = await repo.updateVaultItem(identity, { rating: 9 });
      expect(result.error).toBe(err);
    });
  });

  describe("updateStatus", () => {
    it("updates status and bumps last_activity_at", async () => {
      const { client } = createMockSupabase({ singleData: { ...mockVaultRow, status: "watching" } });
      const repo = new VaultRepository(client as never);
      const result = await repo.updateStatus(identity, "watching");
      expect(result.data?.status).toBe("watching");
    });
  });

  describe("updateRating", () => {
    it("updates rating when valid (0.5–10)", async () => {
      const { client } = createMockSupabase({ singleData: { ...mockVaultRow, rating: 8.5 } });
      const repo = new VaultRepository(client as never);
      const result = await repo.updateRating(identity, 8.5);
      expect(result.data?.rating).toBe(8.5);
      expect(result.error).toBeNull();
    });

    it("returns error when rating < 0.5", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new VaultRepository(client as never);
      const result = await repo.updateRating(identity, 0.3);
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error!.message).toContain("0.5 and 10");
    });

    it("returns error when rating > 10", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new VaultRepository(client as never);
      const result = await repo.updateRating(identity, 11);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error!.message).toContain("0.5 and 10");
    });
  });

  describe("updateNotes", () => {
    it("updates notes", async () => {
      const { client } = createMockSupabase({ singleData: { ...mockVaultRow, notes: "Great!" } });
      const repo = new VaultRepository(client as never);
      const result = await repo.updateNotes(identity, "Great!");
      expect(result.data?.notes).toBe("Great!");
    });
  });

  describe("updateProgress", () => {
    it("updates progress minutes when valid (>= 0)", async () => {
      const { client } = createMockSupabase({ singleData: { ...mockVaultRow, progress_minutes: 45 } });
      const repo = new VaultRepository(client as never);
      const result = await repo.updateProgress(identity, 45);
      expect(result.data?.progress_minutes).toBe(45);
    });

    it("returns error when progressMinutes < 0", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new VaultRepository(client as never);
      const result = await repo.updateProgress(identity, -5);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error!.message).toContain(">= 0");
    });
  });

  describe("deleteVaultItem", () => {
    it("soft-deletes by setting deleted_at", async () => {
      const { client } = createMockSupabase({ singleData: mockVaultRow });
      const repo = new VaultRepository(client as never);
      const result = await repo.deleteVaultItem(identity);
      expect(result.data).toEqual(mockVaultRow);
    });

    it("returns null when item not found", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new VaultRepository(client as never);
      const result = await repo.deleteVaultItem(identity);
      expect(result.data).toBeNull();
    });
  });

  describe("restoreVaultItem", () => {
    it("restores by clearing deleted_at", async () => {
      const { client } = createMockSupabase({ singleData: { ...mockVaultRow, deleted_at: null } });
      const repo = new VaultRepository(client as never);
      const result = await repo.restoreVaultItem(identity);
      expect(result.data?.deleted_at).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Vault utils tests (pure functions — no Supabase mock needed)
// ─────────────────────────────────────────────────────────────────────

describe("vault.utils", () => {
  describe("validateRating", () => {
    it("returns null for valid rating (0.5)", () => {
      expect(validateRating(0.5)).toBeNull();
    });
    it("returns null for valid rating (10)", () => {
      expect(validateRating(10)).toBeNull();
    });
    it("returns null for valid rating (7.5)", () => {
      expect(validateRating(7.5)).toBeNull();
    });
    it("returns Error for rating < 0.5", () => {
      expect(validateRating(0.4)).toBeInstanceOf(Error);
    });
    it("returns Error for rating > 10", () => {
      expect(validateRating(10.1)).toBeInstanceOf(Error);
    });
    it("returns Error for rating 0", () => {
      expect(validateRating(0)).toBeInstanceOf(Error);
    });
  });

  describe("validateProgressMinutes", () => {
    it("returns null for 0", () => {
      expect(validateProgressMinutes(0)).toBeNull();
    });
    it("returns null for positive value", () => {
      expect(validateProgressMinutes(120)).toBeNull();
    });
    it("returns Error for negative value", () => {
      expect(validateProgressMinutes(-1)).toBeInstanceOf(Error);
    });
  });

  describe("toVaultInsert", () => {
    it("maps payload to insert shape (camelCase → snake_case)", () => {
      const result = toVaultInsert({
        userId: "u1",
        tmdbId: 123,
        mediaType: "movie",
        status: "planned",
        isFavorite: true,
        isPinned: false,
        rating: 8,
        notes: "test",
        rewatchCount: 2,
        progressMinutes: 30,
        watchedOn: "2024-01-01",
        startedAt: "2024-01-01",
        completedAt: "2024-02-01",
        lastActivityAt: "2024-02-01",
      });
      expect(result).toEqual({
        user_id: "u1",
        tmdb_id: 123,
        media_type: "movie",
        status: "planned",
        is_favorite: true,
        is_pinned: false,
        rating: 8,
        notes: "test",
        rewatch_count: 2,
        progress_minutes: 30,
        watched_on: "2024-01-01",
        started_at: "2024-01-01",
        completed_at: "2024-02-01",
        last_activity_at: "2024-02-01",
      });
    });

    it("handles minimal payload (only required fields)", () => {
      const result = toVaultInsert({
        userId: "u1",
        tmdbId: 1,
        mediaType: "tv",
      });
      expect(result.user_id).toBe("u1");
      expect(result.tmdb_id).toBe(1);
      expect(result.media_type).toBe("tv");
      expect(result.status).toBeUndefined();
    });
  });

  describe("applySort", () => {
    it("returns query unchanged when sort is undefined", () => {
      const query = { order: vi.fn().mockReturnThis() };
      const result = applySort(query, undefined);
      expect(result).toBe(query);
      expect(query.order).not.toHaveBeenCalled();
    });

    it("calls query.order with field + ascending=true when direction is 'asc'", () => {
      const query = { order: vi.fn().mockReturnThis() };
      applySort(query, { field: "rating", direction: "asc" });
      expect(query.order).toHaveBeenCalledWith("rating", { ascending: true });
    });

    it("calls query.order with ascending=false when direction is 'desc'", () => {
      const query = { order: vi.fn().mockReturnThis() };
      applySort(query, { field: "rating", direction: "desc" });
      expect(query.order).toHaveBeenCalledWith("rating", { ascending: false });
    });

    it("defaults to ascending when direction is undefined", () => {
      const query = { order: vi.fn().mockReturnThis() };
      applySort(query, { field: "created_at" });
      expect(query.order).toHaveBeenCalledWith("created_at", { ascending: true });
    });
  });

  describe("applyPagination", () => {
    it("applies default pagination when pagination is undefined", () => {
      const query = { range: vi.fn().mockReturnThis() };
      const result = applyPagination(query, undefined);
      expect(result).toBe(query);
      // Default pagination applies range(0, DEFAULT_PAGE_SIZE - 1)
      // to prevent unbounded reads
      expect(query.range).toHaveBeenCalledWith(0, 99);
    });

    it("calls query.range with (0, limit-1) when offset is undefined", () => {
      const query = { range: vi.fn().mockReturnThis() };
      applyPagination(query, { limit: 10 });
      expect(query.range).toHaveBeenCalledWith(0, 9);
    });

    it("calls query.range with (offset, offset+limit-1)", () => {
      const query = { range: vi.fn().mockReturnThis() };
      applyPagination(query, { limit: 20, offset: 40 });
      expect(query.range).toHaveBeenCalledWith(40, 59);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// shared.ts (toError) tests
// ─────────────────────────────────────────────────────────────────────

describe("shared.toError", () => {
  it("returns null for null", () => {
    expect(toError(null)).toBeNull();
  });
  it("returns null for undefined", () => {
    expect(toError(undefined)).toBeNull();
  });
  it("returns the same Error instance", () => {
    const err = new Error("test");
    expect(toError(err)).toBe(err);
  });
  it("wraps non-Error values in a new Error", () => {
    const result = toError("string error");
    expect(result).toBeInstanceOf(Error);
    expect(result!.message).toBe("string error");
  });
  it("wraps Supabase-shaped error object with readable message + code", () => {
    // Real-world Supabase errors look like: { message, code, details, hint }
    // Previously toError did `new Error(String(err))` which produced
    // "[object Object]" — completely hiding the reason. Verify the new
    // behavior extracts .message + .code into a readable Error.
    const supabaseErr = {
      message: 'null value in column "user_id" violates not-null constraint',
      code: "23502",
      details: "Failing row contains (...)",
      hint: "",
    };
    const result = toError(supabaseErr);
    expect(result).toBeInstanceOf(Error);
    expect(result!.message).toContain("23502");
    expect(result!.message).toContain("not-null constraint");
    expect(result!.message).not.toBe("[object Object]");
    // Code should also be attached as a property for callers that inspect it.
    expect((result as unknown as { code: string }).code).toBe("23502");
  });

  it("falls back to JSON.stringify for object errors with no message", () => {
    // An object with no message/reason/error fields — should fall back to
    // JSON.stringify so the caller sees the shape, never "[object Object]".
    const result = toError({ code: 500 });
    expect(result).toBeInstanceOf(Error);
    expect(result!.message).toContain("500");
    expect(result!.message).not.toBe("[object Object]");
  });
});
