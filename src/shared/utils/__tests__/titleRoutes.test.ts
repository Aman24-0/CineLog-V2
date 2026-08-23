import { describe, expect, it } from "vitest";
import { titleDetailPath } from "../titleRoutes";

describe("titleDetailPath", () => {
  it("uses the movie namespace for movie titles", () => {
    expect(titleDetailPath({ id: "550", media_type: "movie" })).toBe(
      "/movie/550"
    );
  });

  it("uses the TV namespace for series titles", () => {
    expect(titleDetailPath({ id: 1399, media_type: "tv" })).toBe("/tv/1399");
  });

  it("preserves numeric ids regardless of whether they are strings or numbers", () => {
    expect(titleDetailPath({ id: "1399", media_type: "tv" })).toBe(
      "/tv/1399"
    );
  });
});
