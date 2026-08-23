import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "~/shared/utils/apiCache";
import { searchMulti } from "../discover";

describe("TMDB catalog search helper", () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  it("uses the existing media proxy and returns normalized movie/series titles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 268,
              title: "Batman",
              media_type: "movie",
              poster_path: null
            },
            {
              id: 1399,
              name: "Batman: The Animated Series",
              media_type: "tv",
              poster_path: null
            },
            { id: 1, name: "A Person", media_type: "person" }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchMulti("batman");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = String(fetchMock.mock.calls[0][0]);
    const params = new URL(requestUrl, "http://localhost").searchParams;
    expect(requestUrl).toContain("/api/media/search/multi?");
    expect(params.get("query")).toBe("batman");
    expect(params.get("include_adult")).toBe("false");
    expect(results.map((title) => [title.id, title.media_type])).toEqual([
      [268, "movie"],
      [1399, "tv"]
    ]);
  });
});
