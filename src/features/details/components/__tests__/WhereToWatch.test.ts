import { describe, expect, it } from "vitest";
import {
  getProviderWatchUrl,
  normalizeOffers,
  getSectionLabel
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

// ── 2026-09-03 — CINEMA monetizationType support ──────────────────────

describe("normalizeOffers — CINEMA support (2026-09-03)", () => {
  it("marks a provider as cinema-only when all offers are CINEMA", () => {
    const rows = normalizeOffers([
      offer({
        monetizationType: "CINEMA",
        package: {
          id: "bookmyshow",
          clearName: "BookMyShow",
          shortName: "BMS",
          technicalName: "bookmyshow",
          icon: "/icon/bms/{profile}/{technicalName}.{format}"
        }
      })
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isCinema).toBe(true);
    expect(rows[0]!.isStreaming).toBe(false);
  });

  it("marks a provider as streaming-only when all offers are non-CINEMA", () => {
    const rows = normalizeOffers([
      offer({ monetizationType: "FLATRATE" })
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isCinema).toBe(false);
    expect(rows[0]!.isStreaming).toBe(true);
  });

  it("marks a provider as both cinema + streaming when mixed offers exist", () => {
    const rows = normalizeOffers([
      offer({ monetizationType: "FLATRATE" }),
      offer({ monetizationType: "CINEMA" })
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isCinema).toBe(true);
    expect(rows[0]!.isStreaming).toBe(true);
  });

  it("handles multiple providers with different cinema/streaming mixes", () => {
    const rows = normalizeOffers([
      offer({
        monetizationType: "CINEMA",
        package: { id: "bms", clearName: "BookMyShow", shortName: "BMS", technicalName: "bookmyshow", icon: "" }
      }),
      offer({
        monetizationType: "CINEMA",
        package: { id: "ticketnew", clearName: "Ticket New", shortName: "TN", technicalName: "ticketnew", icon: "" }
      }),
      offer({
        monetizationType: "FLATRATE",
        package: { id: "netflix", clearName: "Netflix", shortName: "NF", technicalName: "netflix", icon: "" }
      })
    ]);
    expect(rows).toHaveLength(3);
    const bms = rows.find((r) => r.packageId === "bms");
    expect(bms?.isCinema).toBe(true);
    expect(bms?.isStreaming).toBe(false);
    const nf = rows.find((r) => r.packageId === "netflix");
    expect(nf?.isCinema).toBe(false);
    expect(nf?.isStreaming).toBe(true);
  });
});

// ── 2026-09-03 — Section heading adaptation ───────────────────────────

describe("getSectionLabel — cinema/streaming heading (2026-09-03)", () => {
  it("returns 'Book Tickets' when all offers are CINEMA", () => {
    const rows = normalizeOffers([
      offer({
        monetizationType: "CINEMA",
        package: { id: "bms", clearName: "BookMyShow", shortName: "BMS", technicalName: "bookmyshow", icon: "" }
      }),
      offer({
        monetizationType: "CINEMA",
        package: { id: "tn", clearName: "Ticket New", shortName: "TN", technicalName: "ticketnew", icon: "" }
      })
    ]);
    expect(getSectionLabel(rows)).toBe("Book Tickets");
  });

  it("returns 'Where to Watch & Book' when both CINEMA and streaming exist", () => {
    const rows = normalizeOffers([
      offer({
        monetizationType: "CINEMA",
        package: { id: "bms", clearName: "BookMyShow", shortName: "BMS", technicalName: "bookmyshow", icon: "" }
      }),
      offer({
        monetizationType: "FLATRATE",
        package: { id: "netflix", clearName: "Netflix", shortName: "NF", technicalName: "netflix", icon: "" }
      })
    ]);
    expect(getSectionLabel(rows)).toBe("Where to Watch & Book");
  });

  it("returns 'Where to Watch' when no CINEMA offers exist", () => {
    const rows = normalizeOffers([
      offer({ monetizationType: "FLATRATE" }),
      offer({
        monetizationType: "RENT",
        package: { id: "prime", clearName: "Prime Video", shortName: "PV", technicalName: "prime", icon: "" }
      })
    ]);
    expect(getSectionLabel(rows)).toBe("Where to Watch");
  });

  it("returns 'Where to Watch' for empty rows", () => {
    expect(getSectionLabel([])).toBe("Where to Watch");
  });
});
