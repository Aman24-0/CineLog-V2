// src/lib/providers/__tests__/BaseProvider.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  ProviderRegistry,
  type MetadataProvider
} from "../BaseProvider";
import type { TMDBTitle } from "~/shared/types";

// ─── Test fixtures ──────────────────────────────────────────────────

const mockTitle: TMDBTitle = {
  id: 1,
  title: "Test",
  media_type: "movie"
} as unknown as TMDBTitle;

function makeProvider(overrides: Partial<MetadataProvider> & { id: string }): MetadataProvider {
  return {
    name: overrides.id,
    icon: "movie",
    canHandle: () => true,
    ...overrides
  } as MetadataProvider;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("ProviderRegistry", () => {
  it("registers and lists providers", () => {
    const reg = new ProviderRegistry();
    const p = makeProvider({ id: "test" });
    reg.register(p);
    expect(reg.list()).toHaveLength(1);
    expect(reg.list()[0].id).toBe("test");
  });

  it("does not double-register providers with the same id", () => {
    const reg = new ProviderRegistry();
    reg.register(makeProvider({ id: "dup" }));
    reg.register(makeProvider({ id: "dup" }));
    expect(reg.list()).toHaveLength(1);
  });

  it("unregisters providers by id", () => {
    const reg = new ProviderRegistry();
    reg.register(makeProvider({ id: "a" }));
    reg.register(makeProvider({ id: "b" }));
    reg.unregister("a");
    expect(reg.list()).toHaveLength(1);
    expect(reg.list()[0].id).toBe("b");
  });

  it("routes getTrending to the first provider that canHandle", async () => {
    const reg = new ProviderRegistry();
    const canHandle = vi.fn((mt: string) => mt === "anime");
    const getTrending = vi.fn(async () => [mockTitle]);
    reg.register(makeProvider({ id: "tmdb", canHandle: () => false }));
    reg.register(makeProvider({ id: "anilist", canHandle, getTrending }));

    const result = await reg.getTrending({ mediaType: "anime" });
    expect(result).toEqual([mockTitle]);
    expect(canHandle).toHaveBeenCalledWith("anime");
    expect(getTrending).toHaveBeenCalled();
  });

  it("returns empty array when no provider can handle the media type", async () => {
    const reg = new ProviderRegistry();
    reg.register(makeProvider({ id: "tmdb", canHandle: () => false }));
    const result = await reg.getTrending({ mediaType: "anime" });
    expect(result).toEqual([]);
  });

  it("returns empty array when the provider throws", async () => {
    const reg = new ProviderRegistry();
    reg.register(
      makeProvider({
        id: "broken",
        canHandle: () => true,
        getTrending: async () => {
          throw new Error("upstream failed");
        }
      })
    );
    const result = await reg.getTrending({ mediaType: "anime" });
    expect(result).toEqual([]);
  });

  it("routes search to the first provider that implements search()", async () => {
    const reg = new ProviderRegistry();
    const search = vi.fn(async () => [mockTitle]);
    reg.register(makeProvider({ id: "a", canHandle: () => true }));
    reg.register(makeProvider({ id: "b", canHandle: () => true, search }));
    const result = await reg.search({ query: "test", mediaType: "movie" });
    expect(result).toEqual([mockTitle]);
    expect(search).toHaveBeenCalled();
  });

  it("getDetails returns null when provider throws", async () => {
    const reg = new ProviderRegistry();
    reg.register(
      makeProvider({
        id: "broken",
        canHandle: () => true,
        getDetails: async () => {
          throw new Error("fail");
        }
      })
    );
    const result = await reg.getDetails({ id: 1, mediaType: "movie" });
    expect(result).toBeNull();
  });
});
