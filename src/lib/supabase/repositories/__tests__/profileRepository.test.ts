// src/lib/supabase/repositories/__tests__/profileRepository.test.ts
import { describe, it, expect, vi } from "vitest";
import { ProfileRepository } from "../profile/profile.repository";
import {
  MAX_BIO_LENGTH,
  COUNTRY_CODE_LENGTH,
  ACCOUNT_DELETION_RECOVERY_DAYS,
  validateBio,
  validateCountry,
  toProfileInsert,
  toProfileUpdate,
  toPreferencesUpdate,
  computeScheduledDeletionAt
} from "../profile/profile.utils";
import type {
  ProfileRow,
  CreateProfilePayload,
  UpdateProfilePayload
} from "../profile/profile.types";
import {
  createMockSupabase,
  createMockSupabaseError
} from "~/__test-fixtures__/mockSupabase";

const mockProfileRow: ProfileRow = {
  id: "user-1",
  username: "testuser",
  avatar_url: null,
  bio: null,
  country: null,
  preferences: {},
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  deleted_at: null
} as unknown as ProfileRow;

describe("ProfileRepository", () => {
  describe("getProfile", () => {
    it("returns profile when found", async () => {
      const { client } = createMockSupabase({ singleData: mockProfileRow });
      const repo = new ProfileRepository(client as never);
      const result = await repo.getProfile("user-1");
      expect(result.data).toEqual(mockProfileRow);
    });

    it("returns null when not found", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new ProfileRepository(client as never);
      const result = await repo.getProfile("nonexistent");
      expect(result.data).toBeNull();
    });

    it("returns error on failure", async () => {
      const err = new Error("Query failed");
      const { client } = createMockSupabaseError(err);
      const repo = new ProfileRepository(client as never);
      const result = await repo.getProfile("user-1");
      expect(result.error).toBe(err);
    });
  });

  describe("getProfileByUsername", () => {
    it("returns profile when found", async () => {
      const { client } = createMockSupabase({ singleData: mockProfileRow });
      const repo = new ProfileRepository(client as never);
      const result = await repo.getProfileByUsername("testuser");
      expect(result.data).toEqual(mockProfileRow);
    });
  });

  describe("getPreferences", () => {
    it("returns preferences when found", async () => {
      const mockPrefs = { id: "user-1", preferences: { theme: "dark" } };
      const { client } = createMockSupabase({ singleData: mockPrefs });
      const repo = new ProfileRepository(client as never);
      const result = await repo.getPreferences("user-1");
      expect(result.data).toEqual(mockPrefs);
    });
  });

  describe("createProfile", () => {
    it("creates profile on success", async () => {
      const { client } = createMockSupabase({ singleData: mockProfileRow });
      const repo = new ProfileRepository(client as never);
      const payload: CreateProfilePayload = {
        id: "user-1",
        username: "testuser",
        displayName: "Test User",
        country: "US"
      };
      const result = await repo.createProfile(payload);
      expect(result.data).toEqual(mockProfileRow);
    });

    it("returns error on insert failure", async () => {
      const err = new Error("Insert failed");
      const { client } = createMockSupabaseError(err);
      const repo = new ProfileRepository(client as never);
      const result = await repo.createProfile({
        id: "user-1",
        username: "testuser",
        displayName: "Test User",
        country: "US"
      });
      expect(result.error).toBe(err);
    });
  });

  describe("updateProfile", () => {
    it("updates profile on success", async () => {
      const { client } = createMockSupabase({
        singleData: { ...mockProfileRow, bio: "New bio" }
      });
      const repo = new ProfileRepository(client as never);
      const result = await repo.updateProfile("user-1", {
        bio: "New bio"
      } as UpdateProfilePayload);
      expect(result.data?.bio).toBe("New bio");
    });
  });

  describe("updateAvatar", () => {
    it("updates avatar URL", async () => {
      const { client } = createMockSupabase({
        singleData: { ...mockProfileRow, avatar_url: "https://..." }
      });
      const repo = new ProfileRepository(client as never);
      const result = await repo.updateAvatar("user-1", "https://...");
      expect(result.data?.avatar_url).toBe("https://...");
    });
  });

  describe("updateBio", () => {
    it("updates bio when valid", async () => {
      const { client } = createMockSupabase({
        singleData: { ...mockProfileRow, bio: "Short bio" }
      });
      const repo = new ProfileRepository(client as never);
      const result = await repo.updateBio("user-1", "Short bio");
      expect(result.data?.bio).toBe("Short bio");
    });

    it("returns error when bio exceeds max length", async () => {
      const { client } = createMockSupabase({ singleData: null });
      const repo = new ProfileRepository(client as never);
      const longBio = "x".repeat(MAX_BIO_LENGTH + 1);
      const result = await repo.updateBio("user-1", longBio);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error!.message).toContain("160");
    });
  });

  describe("updatePreferences", () => {
    it("updates preferences on success", async () => {
      const { client } = createMockSupabase({
        singleData: { ...mockProfileRow, preferences: { theme: "dark" } }
      });
      const repo = new ProfileRepository(client as never);
      const result = await repo.updatePreferences("user-1", { theme: "dark" });
      expect(result.error).toBeNull();
    });
  });

  describe("scheduleDeletion", () => {
    it("returns the updated row with scheduled_deletion_at set", async () => {
      const { client } = createMockSupabase({
        singleData: {
          ...mockProfileRow,
          scheduled_deletion_at: "2024-06-08T00:00:00Z"
        }
      });
      const repo = new ProfileRepository(client as never);
      const result = await repo.scheduleDeletion("user-1");
      expect(result.data).toBeDefined();
    });

    it("returns error on failure", async () => {
      const err = new Error("Schedule failed");
      const { client } = createMockSupabaseError(err);
      const repo = new ProfileRepository(client as never);
      const result = await repo.scheduleDeletion("user-1");
      expect(result.error).toBe(err);
    });
  });

  describe("restoreProfile", () => {
    it("returns the restored row", async () => {
      const { client } = createMockSupabase({
        singleData: { ...mockProfileRow, deleted_at: null }
      });
      const repo = new ProfileRepository(client as never);
      const result = await repo.restoreProfile("user-1");
      expect(result.data?.deleted_at).toBeNull();
    });
  });
});

describe("profile.utils", () => {
  describe("constants", () => {
    it("MAX_BIO_LENGTH is 160", () => {
      expect(MAX_BIO_LENGTH).toBe(160);
    });
    it("COUNTRY_CODE_LENGTH is 2", () => {
      expect(COUNTRY_CODE_LENGTH).toBe(2);
    });
    it("ACCOUNT_DELETION_RECOVERY_DAYS is 7", () => {
      expect(ACCOUNT_DELETION_RECOVERY_DAYS).toBe(7);
    });
  });

  describe("validateBio", () => {
    it("returns null for undefined", () => {
      expect(validateBio(undefined)).toBeNull();
    });
    it("returns null for null", () => {
      expect(validateBio(null)).toBeNull();
    });
    it("returns null for empty string", () => {
      expect(validateBio("")).toBeNull();
    });
    it("returns null for valid bio within limit", () => {
      expect(validateBio("Hello world")).toBeNull();
    });
    it("returns Error for bio exceeding 160 chars", () => {
      expect(validateBio("x".repeat(161))).toBeInstanceOf(Error);
    });
    it("returns null for bio exactly 160 chars", () => {
      expect(validateBio("x".repeat(160))).toBeNull();
    });
  });

  describe("validateCountry", () => {
    it("returns null for undefined", () => {
      expect(validateCountry(undefined)).toBeNull();
    });
    it("returns null for valid 2-letter code", () => {
      expect(validateCountry("US")).toBeNull();
    });
    it("returns null for lowercase code", () => {
      expect(validateCountry("us")).toBeNull();
    });
    it("returns Error for 1-letter code", () => {
      expect(validateCountry("U")).toBeInstanceOf(Error);
    });
    it("returns Error for 3-letter code", () => {
      expect(validateCountry("USA")).toBeInstanceOf(Error);
    });
  });

  describe("toProfileInsert", () => {
    it("maps payload to insert shape", () => {
      const result = toProfileInsert({
        id: "u1",
        username: "testuser",
        displayName: "Test User",
        country: "US"
      });
      expect(result.id).toBe("u1");
      expect(result.username).toBe("testuser");
      expect(result.display_name).toBe("Test User");
      expect(result.avatar_url).toBeNull(); // default
      expect(result.bio).toBeNull(); // default
    });
  });

  describe("toProfileUpdate", () => {
    it("maps partial payload to update shape", () => {
      const result = toProfileUpdate({ bio: "New" } as UpdateProfilePayload);
      expect(result.bio).toBe("New");
    });

    it("persists the selected banner type together with its URL", () => {
      const result = toProfileUpdate({
        bannerType: "upload",
        bannerUrl:
          "https://example.supabase.co/storage/v1/object/public/banners/u/banner.jpg"
      });
      expect(result.banner_type).toBe("upload");
      expect(result.banner_url).toBe(
        "https://example.supabase.co/storage/v1/object/public/banners/u/banner.jpg"
      );
    });

    it("can clear the URL when switching to an automatic banner", () => {
      const result = toProfileUpdate({
        bannerType: "favorite_movie",
        bannerUrl: null
      });
      expect(result.banner_type).toBe("favorite_movie");
      expect(result.banner_url).toBeNull();
    });
  });

  describe("toPreferencesUpdate", () => {
    it("maps camelCase preferences to snake_case update", () => {
      const result = toPreferencesUpdate({
        theme: "dark",
        accentColor: "#a8ff78"
      } as never);
      expect(result.theme).toBe("dark");
      expect(result.accent_color).toBe("#a8ff78");
    });

    it("only includes defined fields", () => {
      const result = toPreferencesUpdate({
        theme: "dark"
      } as never);
      expect(result.theme).toBe("dark");
      expect(result.accent_color).toBeUndefined();
    });
  });

  describe("computeScheduledDeletionAt", () => {
    it("returns an ISO string 7 days in the future", () => {
      const now = new Date("2024-06-01T00:00:00Z");
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const result = computeScheduledDeletionAt();
      const expected = new Date("2024-06-08T00:00:00Z");
      expect(result).toBe(expected.toISOString());
      vi.useRealTimers();
    });
  });
});
