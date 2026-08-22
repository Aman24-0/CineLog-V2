import { describe, expect, it } from "vitest";
import {
  getProviderWatchUrl,
  normalizeOffers
} from "../WhereToWatch";
import type { JustWatchOffer } from "~/shared/types/justwatch";

const offer = (overrides: Partial<JustWatchOffer> = {}): JustWatchOffer => ({
  package: {
    id: "netflix",
    clearName: "Netflix",
    shortName: "Netflix",
    technicalName: "netflix",
    icon: "/icon/netflix/{profile}/{technicalName}.{format}"
  },
  monetizationType: "FLATRATE",
  audioLanguages: [],
  subtitleLanguages: [],
  availableFromTime: null,
  availableToTime: null,
  currency: "USD",
  deeplinkURL: "https://app.example.test/title",
  standardWebURL: "https://www.example.test/title",
  ...overrides
});

describe("WhereToWatch provider helpers", () => {
  it("deduplicates offers into one row per package", () => {
    const rows = normalizeOffers([
      offer(),
      offer({ standardWebURL: "https://www.example.test/other" }),
      offer({
        package: {
          id: "prime",
          clearName: "Prime Video",
          shortName: "Prime",
          technicalName: "amazon prime video",
          icon: "/icon/prime/{profile}/{technicalName}.{format}"
        }
      })
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.clearName)).toEqual(["Netflix", "Prime Video"]);
  });

  it("prefers the provider deeplink and falls back to the standard web URL", () => {
    expect(getProviderWatchUrl({
      deepLinkUrl: "https://app.example.test/title",
      webUrl: "https://www.example.test/title"
    })).toBe("https://app.example.test/title");
    expect(getProviderWatchUrl({
      deepLinkUrl: null,
      webUrl: "https://www.example.test/title"
    })).toBe("https://www.example.test/title");
    expect(getProviderWatchUrl({ deepLinkUrl: null, webUrl: null })).toBeNull();
  });
});
