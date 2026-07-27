// src/core/preferences/__tests__/streamingProviders.test.ts
import { describe, it, expect } from "vitest";
import {
  getCuratedProvidersForRegion,
  isProviderActive,
  INDIA_CURATED_PROVIDERS,
  type CuratedProvider,
} from "../streamingProviders";

describe("getCuratedProvidersForRegion", () => {
  it("returns the India-curated list for region 'IN'", () => {
    const list = getCuratedProvidersForRegion("IN");
    expect(list).toHaveLength(6);
    // Verify the exact IDs per the spec
    const ids = list.map((p) => p.id);
    expect(ids).toContain("8");   // Netflix
    expect(ids).toContain("119"); // Prime Video (NOT 10 = rent/buy)
    expect(ids).toContain("122"); // JioStar (JioCinema canonical)
    expect(ids).toContain("237"); // Sony LIV
    expect(ids).toContain("232"); // ZEE5
    expect(ids).toContain("350"); // Apple TV+
  });

  it("does NOT include unavailable services for India (Hulu, Max, Disney+)", () => {
    const list = getCuratedProvidersForRegion("IN");
    const ids = list.map((p) => p.id);
    expect(ids).not.toContain("15");  // Hulu
    expect(ids).not.toContain("384"); // Max
    expect(ids).not.toContain("337"); // Disney+ standalone
    expect(ids).not.toContain("10");  // rent/buy Amazon Video
  });

  it("combines JioCinema (122) and Hotstar (220) under one 'JioStar' button", () => {
    const list = getCuratedProvidersForRegion("IN");
    const jioStar = list.find((p) => p.name === "JioStar");
    expect(jioStar).toBeDefined();
    expect(jioStar!.id).toBe("122");
    expect(jioStar!.aliasIds).toContain("122");
    expect(jioStar!.aliasIds).toContain("220");
  });

  it("returns the global fallback list for non-India regions", () => {
    const list = getCuratedProvidersForRegion("US");
    expect(list.length).toBeGreaterThan(0);
    // Should include the major global streamers
    const ids = list.map((p) => p.id);
    expect(ids).toContain("8");   // Netflix
    expect(ids).toContain("337"); // Disney+
    expect(ids).toContain("15");  // Hulu (available in US)
  });

  it("returns a fresh copy each call (not a shared reference)", () => {
    const a = getCuratedProvidersForRegion("IN");
    const b = getCuratedProvidersForRegion("IN");
    expect(a).not.toBe(b); // different array references
    expect(a).toEqual(b);  // same contents
    // Mutating one doesn't affect the other
    a[0].name = "Mutated";
    expect(b[0].name).toBe("Netflix");
  });

  it("is case-insensitive on the region code", () => {
    const lower = getCuratedProvidersForRegion("in");
    const upper = getCuratedProvidersForRegion("IN");
    expect(lower).toEqual(upper);
  });
});

describe("isProviderActive", () => {
  const jioStar: CuratedProvider = {
    id: "122",
    name: "JioStar",
    aliasIds: ["122", "220"],
    logoPath: null,
  };

  it("returns true when the canonical id is in the selected list", () => {
    expect(isProviderActive(jioStar, ["122", "8"])).toBe(true);
  });

  it("returns true when an alias id is in the selected list", () => {
    // User previously selected Hotstar (220) — should count as active
    // for the JioStar button (which aliases 122 + 220).
    expect(isProviderActive(jioStar, ["220", "8"])).toBe(true);
  });

  it("returns false when neither the canonical nor alias id is selected", () => {
    expect(isProviderActive(jioStar, ["8", "232"])).toBe(false);
  });

  it("returns false when the selected list is empty", () => {
    expect(isProviderActive(jioStar, [])).toBe(false);
  });

  it("works for providers without aliasIds", () => {
    const netflix: CuratedProvider = { id: "8", name: "Netflix", logoPath: null };
    expect(isProviderActive(netflix, ["8"])).toBe(true);
    expect(isProviderActive(netflix, ["119"])).toBe(false);
  });
});

describe("INDIA_CURATED_PROVIDERS (constant)", () => {
  it("has exactly 6 providers", () => {
    expect(INDIA_CURATED_PROVIDERS).toHaveLength(6);
  });

  it("all providers start with null logoPath (logos are fetched at runtime)", () => {
    for (const p of INDIA_CURATED_PROVIDERS) {
      expect(p.logoPath).toBeNull();
    }
  });

  it("uses ID 119 for Prime Video (not 10 = rent/buy Amazon Video)", () => {
    const prime = INDIA_CURATED_PROVIDERS.find((p) => p.name === "Prime Video");
    expect(prime).toBeDefined();
    expect(prime!.id).toBe("119");
  });

  it("uses ID 237 for Sony LIV (not 1196)", () => {
    const sony = INDIA_CURATED_PROVIDERS.find((p) => p.name === "Sony LIV");
    expect(sony).toBeDefined();
    expect(sony!.id).toBe("237");
  });
});
