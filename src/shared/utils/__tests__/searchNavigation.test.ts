import { describe, expect, it } from "vitest";
import {
  getSearchNavigationIntent,
  isDedicatedDetailPath,
  pathnameFromNavigationTarget,
  shouldRenderSearchOverlay
} from "~/shared/utils/searchNavigation";

describe("search navigation lifecycle", () => {
  it("recognizes canonical movie and TV detail routes", () => {
    expect(isDedicatedDetailPath("/movie/123")).toBe(true);
    expect(isDedicatedDetailPath("/tv/456")).toBe(true);
    expect(isDedicatedDetailPath("/movie/123/")).toBe(true);
    expect(isDedicatedDetailPath("/discover")).toBe(false);
    expect(isDedicatedDetailPath("/movie/not-a-number")).toBe(false);
  });

  it("removes query and hash when classifying a string destination", () => {
    expect(pathnameFromNavigationTarget("/movie/123?q=Backrooms#cast")).toBe(
      "/movie/123"
    );
    expect(pathnameFromNavigationTarget(-1)).toBeNull();
  });

  it("preserves Search only for movie and TV detail transitions", () => {
    expect(getSearchNavigationIntent("/search", "/movie/123")).toBe("preserve");
    expect(getSearchNavigationIntent("/search", "/tv/456?tab=episodes")).toBe(
      "preserve"
    );
  });

  it("resets Search for direct primary-page departures", () => {
    for (const destination of [
      "/discover",
      "/library",
      "/collections",
      "/profile",
      "/settings"
    ]) {
      expect(getSearchNavigationIntent("/search", destination)).toBe("reset");
    }
  });

  it("does not classify non-Search transitions as Search resets", () => {
    expect(getSearchNavigationIntent("/movie/123", "/library")).toBe("none");
    expect(getSearchNavigationIntent("/search", "/search?q=next")).toBe("none");
    expect(getSearchNavigationIntent("/search", -1)).toBe("reset");
  });

  it("renders the global overlay only for explicit open state outside /search", () => {
    expect(shouldRenderSearchOverlay("/search", true)).toBe(false);
    expect(shouldRenderSearchOverlay("/movie/123", false)).toBe(false);
    expect(shouldRenderSearchOverlay("/movie/123", true)).toBe(true);
    expect(shouldRenderSearchOverlay("/library", true)).toBe(true);
  });
});
