import { describe, expect, it } from "vitest";
import { shouldHideBottomNavigation } from "../routeChrome";

describe("shouldHideBottomNavigation", () => {
  it("hides primary navigation on back-navigation pages", () => {
    expect(shouldHideBottomNavigation("/profile/achievements")).toBe(true);
    expect(shouldHideBottomNavigation("/profile/recent-activity")).toBe(true);
    expect(shouldHideBottomNavigation("/profile/stats")).toBe(true);
    expect(shouldHideBottomNavigation("/profile/upcoming")).toBe(true);
    expect(shouldHideBottomNavigation("/profile/trash")).toBe(true);
    expect(shouldHideBottomNavigation("/settings")).toBe(true);
    expect(shouldHideBottomNavigation("/settings/appearance")).toBe(true);
    expect(shouldHideBottomNavigation("/profile/achievements/")).toBe(true);
  });

  it("keeps primary navigation on top-level destinations", () => {
    expect(shouldHideBottomNavigation("/profile")).toBe(false);
    expect(shouldHideBottomNavigation("/discover")).toBe(false);
    expect(shouldHideBottomNavigation("/collections")).toBe(false);
    expect(shouldHideBottomNavigation("/library")).toBe(false);
  });
});
