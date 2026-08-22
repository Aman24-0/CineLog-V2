import { describe, expect, it } from "vitest";
import {
  getExternalIdsByVaultIds,
  type ExternalIdSet
} from "../externalIds";
import {
  createMockSupabase,
  createMockSupabaseError
} from "~/__test-fixtures__/mockSupabase";

describe("getExternalIdsByVaultIds", () => {
  it("returns a vault-keyed map for Trakt-supported providers only", async () => {
    const { client } = createMockSupabase({
      listData: [
        { vault_id: "v1", provider: "imdb", external_id: "tt0133093" },
        { vault_id: "v1", provider: "trakt", external_id: "481" },
        { vault_id: "v2", provider: "tvdb", external_id: "81189" },
        { vault_id: "v2", provider: "anilist", external_id: "9253" },
        { vault_id: "v3", provider: "imdb", external_id: "   " }
      ]
    });

    const result = await getExternalIdsByVaultIds(
      ["v1", "v2", "v3"],
      client as never
    );

    expect(result.error).toBeNull();
    expect(result.data.get("v1")).toEqual<ExternalIdSet>({
      imdb: "tt0133093",
      trakt: "481"
    });
    expect(result.data.get("v2")).toEqual<ExternalIdSet>({ tvdb: "81189" });
    expect(result.data.has("v3")).toBe(false);
  });

  it("avoids a database request for an empty vault-ID list", async () => {
    const { client, query } = createMockSupabase();

    const result = await getExternalIdsByVaultIds([], client as never);

    expect(result.data.size).toBe(0);
    expect(result.error).toBeNull();
    expect(query.from).not.toHaveBeenCalled();
  });

  it("batches large vault ID lists to prevent oversized PostgREST requests", async () => {
    const { client, query } = createMockSupabase({ listData: [] });
    const ids = Array.from({ length: 201 }, (_, index) => `vault-${index}`);

    const result = await getExternalIdsByVaultIds(ids, client as never);

    expect(result.error).toBeNull();
    expect(query.in).toHaveBeenCalledTimes(3);
    expect(query.in.mock.calls.map((call) => call[1].length)).toEqual([
      100,
      100,
      1
    ]);
  });

  it("returns an empty map and normalized error when a read fails", async () => {
    const error = new Error("external IDs unavailable");
    const { client } = createMockSupabaseError(error);

    const result = await getExternalIdsByVaultIds(["v1"], client as never);

    expect(result.data.size).toBe(0);
    expect(result.error?.message).toContain("external IDs unavailable");
  });
});
