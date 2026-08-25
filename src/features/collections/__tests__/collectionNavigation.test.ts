import { describe, expect, it } from "vitest";
import { collectionRouteForFilter } from "../collectionNavigation";
import type { Collection } from "~/shared/types";

const favorites = {
  id: "favorites-id",
  name: "Favorites",
  isFavorites: true
} as Collection;

const custom = {
  id: "custom-id",
  name: "Watch later",
  isFavorites: false
} as Collection;

describe("collectionRouteForFilter", () => {
  it("resolves the favorites filter to the concrete favorites folder", () => {
    expect(collectionRouteForFilter("favorites", [custom, favorites])).toBe(
      "/collections/favorites-id"
    );
  });

  it("does not redirect unrelated or unavailable filters", () => {
    expect(collectionRouteForFilter(undefined, [favorites])).toBeNull();
    expect(collectionRouteForFilter("all", [favorites])).toBeNull();
    expect(collectionRouteForFilter("favorites", [custom])).toBeNull();
  });
});
