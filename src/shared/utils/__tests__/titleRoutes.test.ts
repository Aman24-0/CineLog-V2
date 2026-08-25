import { describe, expect, it } from "vitest";
import {
  relatedTitleDetailPath,
  titleDetailPath
} from "../titleRoutes";

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

describe("relatedTitleDetailPath", () => {
  it("maps movie reminders to the movie detail route", () => {
    expect(relatedTitleDetailPath("12345", "movie")).toBe("/movie/12345");
  });

  it("maps series reminders to the TV detail route", () => {
    expect(relatedTitleDetailPath("987", "series")).toBe("/tv/987");
  });

  it("maps legacy TV and episode metadata to the TV detail route", () => {
    expect(relatedTitleDetailPath("10", "tv")).toBe("/tv/10");
    expect(relatedTitleDetailPath("11", "episode")).toBe("/tv/11");
  });

  it("falls back to the movie route for unknown or missing types", () => {
    expect(relatedTitleDetailPath("12", null)).toBe("/movie/12");
    expect(relatedTitleDetailPath("13", "unknown")).toBe("/movie/13");
  });

  it("encodes identifiers safely", () => {
    expect(relatedTitleDetailPath("a/b", "movie")).toBe("/movie/a%2Fb");
  });
});
