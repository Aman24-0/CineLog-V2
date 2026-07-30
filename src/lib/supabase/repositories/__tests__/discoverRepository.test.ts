// src/lib/supabase/repositories/__tests__/discoverRepository.test.ts
import { describe, it, expect } from "vitest";
import { DiscoverRepository } from "../discover/discover.repository";
import {
  createMockSupabase,
  createMockSupabaseError
} from "~/__test-fixtures__/mockSupabase";

const _mockVaultState = {
  vault: {
    id: "vault-1",
    user_id: "user-1",
    tmdb_id: 123,
    media_type: "movie",
    status: "planned"
  },
  inVault: true
};

describe("DiscoverRepository", () => {
  describe("isInVault", () => {
    it("returns value=true when vault row found", async () => {
      const { client } = createMockSupabase({ singleData: { id: "vault-1" } });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.isInVault({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie"
      });
      expect(result.value).toBe(true);
      expect(result.error).toBeNull();
    });

    it("returns value=false when not found", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.isInVault({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie"
      });
      expect(result.value).toBe(false);
    });

    it("returns error on failure", async () => {
      const err = new Error("Query failed");
      const { client } = createMockSupabaseError(err);
      const repo = new DiscoverRepository(client as never);
      const result = await repo.isInVault({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie"
      });
      expect(result.value).toBe(false);
      expect(result.error).toBe(err);
    });
  });

  describe("getVaultState", () => {
    it("returns vault state when found", async () => {
      const { client } = createMockSupabase({
        singleData: { id: "vault-1", status: "planned" }
      });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.getVaultState({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie"
      });
      expect(result.error).toBeNull();
    });

    it("returns inVault=false when not found", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.getVaultState({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie"
      });
      expect(result.error).toBeNull();
    });
  });

  describe("getCollectionMemberships", () => {
    it("returns list of memberships", async () => {
      const mockMembership = {
        collection: { id: "c1", name: "My Collection" },
        entry: { id: "e1" }
      };
      const { client } = createMockSupabase({ listData: [mockMembership] });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.getCollectionMemberships("vault-1");
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it("returns empty array when no memberships", async () => {
      const { client } = createMockSupabase({ listData: [] });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.getCollectionMemberships("vault-1");
      expect(result.data).toEqual([]);
    });
  });

  describe("isInCollection", () => {
    it("returns value=true when entry found", async () => {
      const { client } = createMockSupabase({ singleData: { id: "e1" } });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.isInCollection("col-1", "vault-1");
      expect(result.value).toBe(true);
    });

    it("returns value=false when not found", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.isInCollection("col-1", "vault-1");
      expect(result.value).toBe(false);
    });
  });

  describe("getRelatedCollections", () => {
    it("returns related collections (resolves vaultId internally)", async () => {
      const mockRel = {
        collection: { id: "c1", name: "My Collection" },
        entry: { id: "e1" }
      };
      // getRelatedCollections first resolves the vault row via maybeSingle,
      // then queries collection_entries. We provide:
      //   maybeSingleData = vault row (so vaultId resolves to "vault-1")
      //   listData = the related collections list
      const { client } = createMockSupabase({
        maybeSingleData: { id: "vault-1" },
        listData: [mockRel]
      });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.getRelatedCollections({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie"
      });
      expect(result.data).toHaveLength(1);
    });

    it("returns empty array when vault item not found", async () => {
      const { client } = createMockSupabase({
        maybeSingleData: null,
        listData: []
      });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.getRelatedCollections({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie" as const
      });
      expect(result.data).toEqual([]);
    });
  });

  describe("getUniverseMembership", () => {
    it("returns universe memberships", async () => {
      const mockUniverse = {
        universe: { id: "u1", name: "MCU" },
        entry: { id: "e1" }
      };
      const { client } = createMockSupabase({ listData: [mockUniverse] });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.getUniverseMembership({
        tmdbId: 123,
        mediaType: "movie"
      });
      expect(result.data).toHaveLength(1);
    });
  });

  describe("getRelatedUniverses", () => {
    it("returns related universes", async () => {
      const mockU = { id: "u1", name: "MCU" };
      const { client } = createMockSupabase({ listData: [mockU] });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.getRelatedUniverses({
        tmdbId: 123,
        mediaType: "movie"
      });
      expect(result.data).toHaveLength(1);
    });
  });

  describe("getSubscribedUniverses", () => {
    it("returns subscribed universes", async () => {
      const mockSub = { id: "u1", universe_id: "mcu", user_id: "user-1" };
      const { client } = createMockSupabase({ listData: [mockSub] });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.getSubscribedUniverses("user-1");
      expect(result.data).toHaveLength(1);
    });
  });

  describe("getDiscoverMetadata", () => {
    it("returns metadata for a media item", async () => {
      const mockMeta = { tmdb_id: 123, media_type: "movie", title: "Test" };
      const { client } = createMockSupabase({ singleData: mockMeta });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.getDiscoverMetadata({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie" as const
      });
      expect(result.error).toBeNull();
    });
  });

  describe("getUserMediaContext", () => {
    it("returns combined context (vault + collections + universes)", async () => {
      const { client } = createMockSupabase({ listData: [], singleData: null });
      const repo = new DiscoverRepository(client as never);
      const result = await repo.getUserMediaContext({
        userId: "user-1",
        tmdbId: 123,
        mediaType: "movie"
      });
      expect(result.error).toBeNull();
    });
  });
});
