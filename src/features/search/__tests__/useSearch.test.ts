import { cleanup, renderHook } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TMDBTitle } from "~/shared/types";

const searchMulti = vi.fn();
const searchPeople = vi.fn();
const getTrending = vi.fn();
const genreIdFor = vi.fn();

vi.mock("~/core/tmdb/discover", () => ({
  searchMulti,
  searchPeople,
  getTrending,
  genreIdFor
}));

vi.mock("../animeSearchFallback", () => ({
  looksLikeAnimeQuery: () => false,
  searchAnimeFallback: vi.fn().mockResolvedValue([])
}));

const { useSearch } = await import("../useSearch");

const movie: TMDBTitle = {
  id: 550,
  title: "Fight Club",
  media_type: "movie",
  poster_path: null,
  backdrop_path: null
};

const series: TMDBTitle = {
  id: 1399,
  name: "Game of Thrones",
  media_type: "tv",
  poster_path: null,
  backdrop_path: null
};

describe("useSearch catalog flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchMulti.mockReset();
    searchPeople.mockReset();
    getTrending.mockReset();
    genreIdFor.mockReset();
    getTrending.mockResolvedValue([]);
    searchPeople.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("passes a real query through the shared catalog search helper and groups results", async () => {
    searchMulti.mockResolvedValue([movie, series]);
    const hook = renderHook(() => useSearch({ vault: () => [] }));

    hook.result.setQuery("fight club");
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() =>
      expect(searchMulti).toHaveBeenCalledWith("fight club")
    );
    await vi.waitFor(() => expect(hook.result.loading()).toBe(false));

    expect(hook.result.results()).toMatchObject({
      movies: [movie],
      series: [series],
      people: [],
      totalCount: 2
    });
  });

  it("runs a submitted query immediately through the same catalog pipeline", async () => {
    searchMulti.mockResolvedValue([movie]);
    const hook = renderHook(() => useSearch({ vault: () => [] }));

    hook.result.runSearchNow("fight club");
    await vi.waitFor(() => expect(searchMulti).toHaveBeenCalledWith("fight club"));
    await vi.waitFor(() => expect(hook.result.results().totalCount).toBe(1));

    expect(hook.result.query()).toBe("fight club");
    expect(hook.result.hasQuery()).toBe(true);
  });

  it("clears active results when the query is cleared and leaves trending to the cold-start page", async () => {
    searchMulti.mockResolvedValue([movie]);
    const hook = renderHook(() => useSearch({ vault: () => [] }));

    hook.result.setQuery("fight club");
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(hook.result.results().totalCount).toBe(1));

    hook.result.setQuery("");
    await vi.advanceTimersByTimeAsync(250);

    expect(hook.result.hasQuery()).toBe(false);
    expect(hook.result.results().totalCount).toBe(0);
    expect(searchMulti).toHaveBeenCalledTimes(1);
  });
});
