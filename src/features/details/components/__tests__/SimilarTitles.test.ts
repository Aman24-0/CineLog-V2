import { describe, expect, it } from "vitest";
import { filterSimilarTitles } from "../SimilarTitles";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";

const title = (id: number, media_type: "movie" | "tv"): TMDBTitle => ({
  id,
  media_type,
  title: `Title ${id}`
});

const current: WatchlistItem = {
  id: "100",
  media_type: "tv",
  status: "Watching"
};

describe("filterSimilarTitles", () => {
  it("removes current, library-owned, and duplicate canonical identities", () => {
    const recommendations = [
      title(100, "tv"),
      title(200, "tv"),
      title(200, "tv"),
      title(200, "movie"),
      title(300, "tv")
    ];
    const watchlist: WatchlistItem[] = [
      { id: "200", media_type: "tv", status: "Completed" }
    ];

    const result = filterSimilarTitles(recommendations, current, watchlist);

    expect(result.map((item) => `${item.media_type}/${item.id}`)).toEqual([
      "movie/200",
      "tv/300"
    ]);
  });

  it("does not remove recommendations when the library is empty", () => {
    const result = filterSimilarTitles(
      [title(201, "movie"), title(202, "tv")],
      current,
      []
    );

    expect(result).toHaveLength(2);
  });
});
