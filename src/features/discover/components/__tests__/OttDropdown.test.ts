import { describe, expect, it } from "vitest";
import { chooseInitialProviderId } from "../OttDropdown";

describe("chooseInitialProviderId", () => {
  const providers = [{ id: "8" }, { id: "1196" }, { id: "337" }];

  it("keeps the first preferred provider that exists in the real list", () => {
    expect(chooseInitialProviderId(providers, ["337", "8"])).toBe("337");
  });

  it("falls back to the first real provider for stale preferences", () => {
    expect(chooseInitialProviderId(providers, ["9999"])).toBe("8");
  });

  it("returns null when the region has no providers", () => {
    expect(chooseInitialProviderId([], ["8"])).toBeNull();
  });
});
