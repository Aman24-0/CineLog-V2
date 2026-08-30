import { cleanup, renderHook } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";
import { makeMovie, makeTVSeries } from "~/__test-fixtures__/factories";

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

// ─────────────────────────────────────────────────────────────────────
// Trending exclusion — "Trending this week" on the Search page must NOT
// show items that are already in the user's library. The exclusion is
// performed at the data layer (a derived `trending` memo inside
// `useSearch`) using the existing composite "{media_type}/{id}" key from
// `vaultMatch`. These tests verify the exclusion, edge cases, ordering
// preservation, media-type disambiguation, that normal text-search
// results are NOT filtered, and that `trendingLoading` correctly waits
// for the vault to load (to avoid a flash of library items that then
// disappear).
// ─────────────────────────────────────────────────────────────────────
describe("useSearch trending exclusion", () => {
  beforeEach(() => {
    searchMulti.mockReset();
    searchPeople.mockReset();
    getTrending.mockReset();
    genreIdFor.mockReset();
    searchPeople.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  /** Helper: minimal TMDBTitle fixture. */
  const trendingTitle = (
    id: number,
    mediaType: "movie" | "tv",
    name?: string
  ): TMDBTitle => ({
    id,
    ...(mediaType === "movie" ? { title: name ?? `Movie ${id}` } : { name: name ?? `Series ${id}` }),
    media_type: mediaType,
    poster_path: null,
    backdrop_path: null
  });

  it("keeps trending items that are not in the user's library", async () => {
    const items = [
      trendingTitle(1, "movie", "Trending A"),
      trendingTitle(2, "tv", "Trending B")
    ];
    getTrending.mockResolvedValue(items);

    const hook = renderHook(() => useSearch({ vault: () => [] }));

    await vi.waitFor(() => expect(hook.result.trending().length).toBe(2));
    expect(hook.result.trending()).toEqual(items);
  });

  it("excludes a trending movie that is already in the user's library", async () => {
    const library = [makeMovie({ id: "100", title: "In Library Movie" })];
    const items = [
      trendingTitle(100, "movie", "In Library Movie"),
      trendingTitle(200, "movie", "Not In Library")
    ];
    getTrending.mockResolvedValue(items);

    const hook = renderHook(() => useSearch({ vault: () => library }));

    await vi.waitFor(() => expect(hook.result.trending().length).toBe(1));
    expect(hook.result.trending()[0].id).toBe(200);
  });

  it("excludes a trending TV series that is already in the user's library", async () => {
    const library = [makeTVSeries({ id: "300", name: "In Library Series" })];
    const items = [
      trendingTitle(300, "tv", "In Library Series"),
      trendingTitle(400, "tv", "Not In Library Series")
    ];
    getTrending.mockResolvedValue(items);

    const hook = renderHook(() => useSearch({ vault: () => library }));

    await vi.waitFor(() => expect(hook.result.trending().length).toBe(1));
    expect(hook.result.trending()[0].id).toBe(400);
  });

  it("excludes every matching item when multiple trending items are in the library", async () => {
    const library = [
      makeMovie({ id: "1", title: "A" }),
      makeTVSeries({ id: "3", name: "C" })
    ];
    const items = [
      trendingTitle(1, "movie", "A"),
      trendingTitle(2, "movie", "B"),
      trendingTitle(3, "tv", "C"),
      trendingTitle(4, "movie", "D"),
      trendingTitle(5, "tv", "E")
    ];
    getTrending.mockResolvedValue(items);

    const hook = renderHook(() => useSearch({ vault: () => library }));

    await vi.waitFor(() => expect(hook.result.trending().length).toBe(3));
    expect(hook.result.trending().map((t) => t.id)).toEqual([2, 4, 5]);
  });

  it("preserves the original TMDB trending order for the remaining items", async () => {
    const library = [
      makeMovie({ id: "2", title: "B" }),
      makeMovie({ id: "4", title: "D" })
    ];
    const items = [
      trendingTitle(1, "movie", "A"),
      trendingTitle(2, "movie", "B"),
      trendingTitle(3, "movie", "C"),
      trendingTitle(4, "movie", "D"),
      trendingTitle(5, "movie", "E")
    ];
    getTrending.mockResolvedValue(items);

    const hook = renderHook(() => useSearch({ vault: () => library }));

    await vi.waitFor(() => expect(hook.result.trending().length).toBe(3));
    expect(hook.result.trending().map((t) => t.id)).toEqual([1, 3, 5]);
  });

  it("does not filter trending when the library is empty", async () => {
    const items = [
      trendingTitle(1, "movie", "A"),
      trendingTitle(2, "tv", "B")
    ];
    getTrending.mockResolvedValue(items);

    const hook = renderHook(() => useSearch({ vault: () => [] }));

    await vi.waitFor(() => expect(hook.result.trending().length).toBe(2));
    expect(hook.result.trending()).toEqual(items);
  });

  it("returns an empty list (not null) when every trending item is in the library", async () => {
    const library = [
      makeMovie({ id: "1", title: "A" }),
      makeTVSeries({ id: "2", name: "B" })
    ];
    const items = [
      trendingTitle(1, "movie", "A"),
      trendingTitle(2, "tv", "B")
    ];
    getTrending.mockResolvedValue(items);

    const hook = renderHook(() => useSearch({ vault: () => library }));

    await vi.waitFor(() => expect(hook.result.trending().length).toBe(0));
    expect(Array.isArray(hook.result.trending())).toBe(true);
  });

  it("does not treat a movie and a TV show with the same numeric TMDB id as the same item", async () => {
    // Stalker (movie/1398) and The Sopranos (tv/1398) share the numeric id
    // 1398 but live in different media_type namespaces. Only the TV series
    // is in the user's library, so only it should be excluded — the movie
    // Stalker must remain.
    const library = [makeTVSeries({ id: "1398", name: "The Sopranos" })];
    const items = [
      trendingTitle(1398, "movie", "Stalker"),
      trendingTitle(1398, "tv", "The Sopranos")
    ];
    getTrending.mockResolvedValue(items);

    const hook = renderHook(() => useSearch({ vault: () => library }));

    await vi.waitFor(() => expect(hook.result.trending().length).toBe(1));
    const remaining = hook.result.trending()[0];
    expect(remaining.media_type).toBe("movie");
    expect(remaining.id).toBe(1398);
  });

  it("does not filter normal text-search results by library membership", async () => {
    // A movie that is in the library should still be returned by normal
    // text search. The library exclusion applies ONLY to "Trending this
    // week" on the Search page.
    const library = [makeMovie({ id: "550", title: "Fight Club" })];
    searchMulti.mockResolvedValue([
      { id: 550, title: "Fight Club", media_type: "movie", poster_path: null, backdrop_path: null }
    ]);
    getTrending.mockResolvedValue([]);

    const hook = renderHook(() => useSearch({ vault: () => library }));
    hook.result.setQuery("fight club");
    // The search effect uses a 250ms debounce; advance fake timers if
    // active. With real timers, this is a no-op flush.
    await vi.waitFor(() =>
      expect(searchMulti).toHaveBeenCalledWith("fight club")
    );
    await vi.waitFor(() => expect(hook.result.results().totalCount).toBe(1));
    expect(hook.result.results().movies[0].id).toBe(550);
  });

  it("still reports isInVault correctly for both library and non-library titles", async () => {
    const library = [makeMovie({ id: "100", title: "In Library" })];
    const items = [
      trendingTitle(100, "movie", "In Library"),
      trendingTitle(200, "movie", "Not In Library")
    ];
    getTrending.mockResolvedValue(items);

    const hook = renderHook(() => useSearch({ vault: () => library }));

    // isInVault continues to work — the filtering is a separate concern.
    expect(hook.result.isInVault(items[0])).toBe(true);
    expect(hook.result.isInVault(items[1])).toBe(false);
  });

  it("gates trendingLoading on the provided vaultLoading accessor to avoid a flash", async () => {
    const [vaultLoading, setVaultLoading] = createSignal(true);
    getTrending.mockResolvedValue([trendingTitle(1, "movie", "A")]);

    const hook = renderHook(() =>
      useSearch({ vault: () => [], vaultLoading })
    );

    // Once the trending fetch resolves, the public trending accessor
    // returns the items, but `trendingLoading` must still report true
    // because the vault is still loading (otherwise library items would
    // briefly appear and then vanish when the vault arrives).
    await vi.waitFor(() => expect(hook.result.trending().length).toBe(1));
    expect(hook.result.trendingLoading()).toBe(true);

    // When the vault finishes loading, `trendingLoading` becomes false.
    setVaultLoading(false);
    await vi.waitFor(() => expect(hook.result.trendingLoading()).toBe(false));
  });

  it("does not gate trendingLoading when no vaultLoading accessor is provided", async () => {
    getTrending.mockResolvedValue([trendingTitle(1, "movie", "A")]);

    const hook = renderHook(() => useSearch({ vault: () => [] }));

    await vi.waitFor(() => expect(hook.result.trendingLoading()).toBe(false));
  });

  it("reactively re-filters when the vault contents change after mount", async () => {
    const [vault, setVault] = createSignal<WatchlistItem[]>([]);
    const items = [
      trendingTitle(1, "movie", "A"),
      trendingTitle(2, "movie", "B")
    ];
    getTrending.mockResolvedValue(items);

    const hook = renderHook(() => useSearch({ vault }));

    // Initially no library items, so both trending items show.
    await vi.waitFor(() => expect(hook.result.trending().length).toBe(2));

    // The user adds "A" to their library while the search page is open.
    setVault([makeMovie({ id: "1", title: "A" })]);

    // The derived `trending` memo re-runs because `vaultKeys` changed.
    await vi.waitFor(() => expect(hook.result.trending().length).toBe(1));
    expect(hook.result.trending()[0].id).toBe(2);
  });
});
