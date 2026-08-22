import { describe, expect, it } from "vitest";
import { isDiscoverConsumerRoute } from "~/app/AppShell";
import { PRIMARY_NAV_LABELS } from "../BottomNavigation";
import SearchRoute, { SEARCH_ROUTE_PATH } from "~/routes/search";

describe("consumer navigation contracts", () => {
  it("keeps the primary destinations in Discover, Library, Search, Collections, Profile order", () => {
    expect([...PRIMARY_NAV_LABELS]).toEqual([
      "Discover",
      "Library",
      "Search",
      "Collections",
      "Profile"
    ]);
    expect(PRIMARY_NAV_LABELS[2]).toBe("Search");
  });

  it("defines a real Search route at the canonical path", () => {
    expect(SEARCH_ROUTE_PATH).toBe("/search");
    expect(typeof SearchRoute).toBe("function");
  });

  it("renders consumer header chrome only for the Discover route", () => {
    expect(isDiscoverConsumerRoute("/discover")).toBe(true);
    expect(isDiscoverConsumerRoute("/library")).toBe(false);
    expect(isDiscoverConsumerRoute("/search")).toBe(false);
    expect(isDiscoverConsumerRoute("/collections")).toBe(false);
    expect(isDiscoverConsumerRoute("/profile/settings")).toBe(false);
  });
});
