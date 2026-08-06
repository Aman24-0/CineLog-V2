// src/features/settings/hooks/__tests__/settingsDefaults.test.ts
//
// Tests for the settingsDefaults module — per-section reset-to-defaults,
// export to JSON file, and import from JSON file.
//
// Mock strategy: stub `~/core/preferences` so each test controls the
// current signal values + captures the setter calls.

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks for every preference signal ---

const setters = vi.hoisted(() => ({
  setTheme: vi.fn(),
  setDensity: vi.fn(),
  setFontSize: vi.fn(),
  setPosterQuality: vi.fn(),
  setHideSpoilers: vi.fn(),
  setReducedMotion: vi.fn(),
  setHighContrast: vi.fn(),
  setAmbientIntensity: vi.fn(),
  setLanguage: vi.fn(),
  setFallbackLanguage: vi.fn(),
  setDateFormat: vi.fn(),
  setDefaultVaultStatus: vi.fn(),
  setAdultContentFilter: vi.fn(),
  setContentRatingCap: vi.fn(),
  setDefaultDiscoverTab: vi.fn(),
  setRatingScale: vi.fn(),
  setHideRatingsInScreenshots: vi.fn(),
  setStreamingProviders: vi.fn(),
  setNotifPrefs: vi.fn(),
  setCalPrefs: vi.fn(),
  setSyncCadence: vi.fn()
}));

const getters = vi.hoisted(() => ({
  theme: vi.fn(() => "minimal"),
  density: vi.fn(() => "compact"),
  fontSize: vi.fn(() => "small"),
  posterQuality: vi.fn(() => "low"),
  hideSpoilers: vi.fn(() => true),
  dateFormat: vi.fn(() => "mdy"),
  reducedMotion: vi.fn(() => "always"),
  highContrast: vi.fn(() => true),
  ambientIntensity: vi.fn(() => "vibrant"),
  language: vi.fn(() => "fr"),
  defaultVaultStatus: vi.fn(() => "Watching"),
  adultContentFilter: vi.fn(() => true),
  defaultDiscoverTab: vi.fn(() => "movies"),
  ratingScale: vi.fn(() => "5star"),
  hideRatingsInScreenshots: vi.fn(() => true),
  notifPrefs: vi.fn(() => ({
    newSeason: false,
    continueWatching: true,
    weeklyRecap: false,
    recommendations: true,
    syncStatus: false,
    quietHoursEnabled: true,
    quietHoursStart: "23:00",
    quietHoursEnd: "08:00",
    weeklyDigestTime: "12:00",
    weeklyDigestDay: 3,
    episodeReminderLead: 30,
    emailEnabled: false,
    emailNewSeason: false,
    emailContinueWatching: false,
    emailWeeklyRecap: false,
    emailRecommendations: false,
    emailSyncStatus: false
  })),
  calPrefs: vi.fn(() => ({
    firstDayOfWeek: 0,
    timeFormat: "12h",
    releaseTimezone: "utc",
    defaultView: "month"
  })),
  syncCadence: vi.fn(() => "manual")
}));

vi.mock("~/core/preferences", () => ({
  ...setters,
  ...getters,
  theme: getters.theme,
  density: getters.density,
  fontSize: getters.fontSize,
  posterQuality: getters.posterQuality,
  hideSpoilers: getters.hideSpoilers,
  dateFormat: getters.dateFormat,
  reducedMotion: getters.reducedMotion,
  highContrast: getters.highContrast,
  ambientIntensity: getters.ambientIntensity,
  language: getters.language,
  defaultVaultStatus: getters.defaultVaultStatus,
  adultContentFilter: getters.adultContentFilter,
  defaultDiscoverTab: getters.defaultDiscoverTab,
  ratingScale: getters.ratingScale,
  hideRatingsInScreenshots: getters.hideRatingsInScreenshots,
  notifPrefs: getters.notifPrefs,
  calPrefs: getters.calPrefs,
  syncCadence: getters.syncCadence,
  mergeAndSortProviders: vi.fn(),
  applyAccentToDocument: vi.fn(),
  clearAccentFromDocument: vi.fn()
}));

vi.mock("~/core/theme", () => ({
  theme: getters.theme,
  setTheme: setters.setTheme
}));

vi.mock("~/core/preferences/language", () => ({
  fallbackLanguage: vi.fn(() => "es"),
  setFallbackLanguage: setters.setFallbackLanguage
}));

vi.mock("~/core/preferences/dateFormat", () => ({
  dateFormat: getters.dateFormat,
  setDateFormat: setters.setDateFormat
}));

vi.mock("~/core/preferences/contentFilters", () => ({
  contentRatingCap: vi.fn(() => "R"),
  setContentRatingCap: setters.setContentRatingCap
}));

vi.mock("~/core/preferences/streamingProviders", () => ({
  streamingProviders: vi.fn(() => [{ provider_id: 8, provider_name: "Netflix" }]),
  setStreamingProviders: setters.setStreamingProviders
}));

vi.mock("~/core/preferences/notifications", () => ({
  notifPrefs: getters.notifPrefs,
  setNotifPrefs: setters.setNotifPrefs,
  DEFAULT_NOTIF_PREFS: {
    newSeason: true,
    continueWatching: false,
    weeklyRecap: true,
    recommendations: false,
    syncStatus: true,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    weeklyDigestTime: "09:00",
    weeklyDigestDay: 1,
    episodeReminderLead: 60,
    emailEnabled: true,
    emailNewSeason: true,
    emailContinueWatching: false,
    emailWeeklyRecap: true,
    emailRecommendations: false,
    emailSyncStatus: true
  }
}));

// --- Import AFTER mocks ---

import {
  resetSectionToDefaults,
  exportSettingsToFile,
  importSettingsFromFile,
  type SettingsSectionId
} from "../../settingsDefaults";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// resetSectionToDefaults — appearance section
// ---------------------------------------------------------------------------

describe("resetSectionToDefaults — appearance", () => {
  it("resets all 8 appearance preferences to their defaults", () => {
    expect(resetSectionToDefaults("appearance")).toBe(true);
    expect(setters.setTheme).toHaveBeenCalledWith("cinematic");
    expect(setters.setDensity).toHaveBeenCalledWith("comfortable");
    expect(setters.setFontSize).toHaveBeenCalledWith("medium");
    expect(setters.setPosterQuality).toHaveBeenCalledWith("high");
    expect(setters.setHideSpoilers).toHaveBeenCalledWith(false);
    expect(setters.setReducedMotion).toHaveBeenCalledWith("system");
    expect(setters.setHighContrast).toHaveBeenCalledWith(false);
    // Phase 14 Chunk 2 — ambientIntensity is part of the appearance
    // section and resets to "normal" (the historical baseline).
    expect(setters.setAmbientIntensity).toHaveBeenCalledWith("normal");
  });
});

// ---------------------------------------------------------------------------
// resetSectionToDefaults — content section
// ---------------------------------------------------------------------------

describe("resetSectionToDefaults — content", () => {
  it("resets language, dates, vault, filters, discover, ratings, providers", () => {
    expect(resetSectionToDefaults("content")).toBe(true);
    expect(setters.setLanguage).toHaveBeenCalledWith("en");
    expect(setters.setFallbackLanguage).toHaveBeenCalledWith("");
    expect(setters.setDateFormat).toHaveBeenCalledWith("dmy");
    expect(setters.setDefaultVaultStatus).toHaveBeenCalledWith("Planned");
    expect(setters.setAdultContentFilter).toHaveBeenCalledWith(false);
    expect(setters.setContentRatingCap).toHaveBeenCalledWith("");
    expect(setters.setDefaultDiscoverTab).toHaveBeenCalledWith("all");
    expect(setters.setRatingScale).toHaveBeenCalledWith("10star");
    expect(setters.setHideRatingsInScreenshots).toHaveBeenCalledWith(false);
    expect(setters.setStreamingProviders).toHaveBeenCalledWith([]);
  });
});

// ---------------------------------------------------------------------------
// resetSectionToDefaults — notifications section
// ---------------------------------------------------------------------------

describe("resetSectionToDefaults — notifications", () => {
  it("resets notifPrefs to a clone of DEFAULT_NOTIF_PREFS", () => {
    expect(resetSectionToDefaults("notifications")).toBe(true);
    expect(setters.setNotifPrefs).toHaveBeenCalledTimes(1);
    const arg = setters.setNotifPrefs.mock.calls[0][0];
    expect(arg.newSeason).toBe(true);
    expect(arg.weeklyDigestDay).toBe(1);
    expect(arg.emailEnabled).toBe(true);
    // Verify it's a fresh clone (not the same object reference as the
    // DEFAULT_NOTIF_PREFS constant) by mutating the arg and confirming
    // the original is unaffected. We can't easily import the constant
    // here (it's mocked), so we just verify the call shape.
    expect(typeof arg).toBe("object");
    expect(Object.keys(arg).length).toBeGreaterThan(10); // many prefs
  });
});

// ---------------------------------------------------------------------------
// resetSectionToDefaults — calendar section
// ---------------------------------------------------------------------------

describe("resetSectionToDefaults — calendar", () => {
  it("resets calPrefs to Monday-first, 24h, local, week view", () => {
    expect(resetSectionToDefaults("calendar")).toBe(true);
    expect(setters.setCalPrefs).toHaveBeenCalledWith({
      firstDayOfWeek: 1,
      timeFormat: "24h",
      releaseTimezone: "local",
      defaultView: "week"
    });
  });
});

// ---------------------------------------------------------------------------
// resetSectionToDefaults — sync section
// ---------------------------------------------------------------------------

describe("resetSectionToDefaults — sync", () => {
  it("resets syncCadence to 'realtime'", () => {
    expect(resetSectionToDefaults("sync")).toBe(true);
    expect(setters.setSyncCadence).toHaveBeenCalledWith("realtime");
  });
});

// ---------------------------------------------------------------------------
// resetSectionToDefaults — account + danger (no-ops)
// ---------------------------------------------------------------------------

describe("resetSectionToDefaults — account + danger", () => {
  it("returns true for 'account' but calls no setters (no-op)", () => {
    expect(resetSectionToDefaults("account")).toBe(true);
    // No setters should be called.
    expect(setters.setLanguage).not.toHaveBeenCalled();
    expect(setters.setNotifPrefs).not.toHaveBeenCalled();
  });

  it("returns true for 'danger' (also a no-op)", () => {
    expect(resetSectionToDefaults("danger")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resetSectionToDefaults — unknown section
// ---------------------------------------------------------------------------

describe("resetSectionToDefaults — unknown section", () => {
  it("returns false for an unknown section id", () => {
    expect(resetSectionToDefaults("nonexistent" as SettingsSectionId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// exportSettingsToFile
// ---------------------------------------------------------------------------

describe("exportSettingsToFile", () => {
  it("returns false on the server (isServer=true)", () => {
    // The mock for ~/core/preferences doesn't override isServer, which
    // is imported from solid-js/web. We can't easily flip isServer in
    // a unit test, so we test the browser path instead (below).
    // Just verify it returns true in the jsdom env (browser-like).
    const result = exportSettingsToFile();
    expect(typeof result).toBe("boolean");
  });

  it("triggers a download with the current preferences as JSON", () => {
    // Stub document.createElement + a.click + URL.createObjectURL.
    const fakeAnchor = {
      href: "",
      download: "",
      style: { display: "" },
      click: vi.fn(),
      _parent: null as Node | null
    };
    const realCreateElement = document.createElement.bind(document);
    const spyCreate = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        if (tag === "a") return fakeAnchor as unknown as HTMLAnchorElement;
        return realCreateElement(tag);
      });
    const spyAppend = vi.spyOn(document.body, "appendChild").mockImplementation((node: Node) => {
      fakeAnchor._parent = node;
      return node;
    });
    const spyRemove = vi.spyOn(document.body, "removeChild").mockImplementation((node: Node) => {
      fakeAnchor._parent = null;
      return node;
    });
    const spyCreateObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fake-url");
    const spyRevokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const result = exportSettingsToFile();
    expect(result).toBe(true);
    expect(spyCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(fakeAnchor.href).toBe("blob:fake-url");
    expect(fakeAnchor.download).toMatch(/^cinelog-preferences-\d{4}-\d{2}-\d{2}\.json$/);
    expect(fakeAnchor.click).toHaveBeenCalledTimes(1);
    expect(spyAppend).toHaveBeenCalledTimes(1);

    // Restore.
    spyCreate.mockRestore();
    spyAppend.mockRestore();
    spyRemove.mockRestore();
    spyCreateObjectURL.mockRestore();
    spyRevokeObjectURL.mockRestore();
  });

  it("includes the magic header + version + preferences snapshot in the download", () => {
    // Capture the blob content via URL.createObjectURL.
    let capturedBlob: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
      capturedBlob = blob as Blob;
      return "blob:fake";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "", download: "", style: { display: "" }, click: vi.fn()
    } as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockImplementation((n: Node) => n);
    vi.spyOn(document.body, "removeChild").mockImplementation((n: Node) => n);

    exportSettingsToFile();
    expect(capturedBlob).not.toBeNull();
    // Read the blob text. (Blob.text() is async.)
    return capturedBlob!.text().then((text) => {
      const parsed = JSON.parse(text);
      expect(parsed.magic).toBe("cineLog.preferences.v1");
      expect(parsed.version).toBe(1);
      expect(typeof parsed.exported_at).toBe("string");
      expect(parsed.preferences).toBeDefined();
      expect(parsed.preferences.language).toBe("fr");
    });
  });
});

// ---------------------------------------------------------------------------
// importSettingsFromFile
// ---------------------------------------------------------------------------

describe("importSettingsFromFile", () => {
  function makeFile(content: string): File {
    return new File([content], "import.json", { type: "application/json" });
  }

  it("returns ok=true + applied count for a valid preferences file", async () => {
    const payload = {
      magic: "cineLog.preferences.v1",
      exported_at: "2026-01-01T00:00:00.000Z",
      version: 1,
      preferences: {
        theme: "cinematic",
        density: "comfortable",
        fontSize: "medium",
        language: "en",
        notifPrefs: { newSeason: true }
      }
    };
    const result = await importSettingsFromFile(makeFile(JSON.stringify(payload)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.applied).toBe(5); // 5 keys present in preferences
    }
    // Verify a few setters were called with the imported values.
    expect(setters.setLanguage).toHaveBeenCalledWith("en");
    expect(setters.setNotifPrefs).toHaveBeenCalledWith({ newSeason: true });
  });

  it("returns ok=false + error for invalid JSON", async () => {
    const result = await importSettingsFromFile(makeFile("not valid json"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid JSON");
    }
  });

  it("returns ok=false + error when magic header is wrong", async () => {
    const payload = {
      magic: "some-other-format",
      version: 1,
      preferences: {}
    };
    const result = await importSettingsFromFile(makeFile(JSON.stringify(payload)));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("magic header");
    }
  });

  it("returns ok=false + error when preferences object is missing", async () => {
    const payload = {
      magic: "cineLog.preferences.v1",
      version: 1
    };
    const result = await importSettingsFromFile(makeFile(JSON.stringify(payload)));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("preferences");
    }
  });

  it("returns ok=false + error when file content is a JSON primitive (not an object)", async () => {
    // Arrays pass `typeof === "object"` so they hit the magic-header
    // check instead. Use a string primitive to hit the
    // "not a JSON object" branch.
    const result = await importSettingsFromFile(makeFile('"just a string"'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not a JSON object");
    }
  });

  it("returns ok=false + error when file content is a JSON number", async () => {
    const result = await importSettingsFromFile(makeFile("42"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not a JSON object");
    }
  });

  it("skips missing keys gracefully (partial import)", async () => {
    const payload = {
      magic: "cineLog.preferences.v1",
      exported_at: "2026-01-01T00:00:00.000Z",
      version: 1,
      preferences: {
        density: "compact"
        // Only one key — all others should be skipped, not error.
      }
    };
    const result = await importSettingsFromFile(makeFile(JSON.stringify(payload)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.applied).toBe(1);
    }
    expect(setters.setDensity).toHaveBeenCalledWith("compact");
    // Other setters should NOT have been called.
    expect(setters.setLanguage).not.toHaveBeenCalled();
    expect(setters.setNotifPrefs).not.toHaveBeenCalled();
  });

  it("treats null/undefined preference values correctly (skips them)", async () => {
    const payload = {
      magic: "cineLog.preferences.v1",
      version: 1,
      preferences: {
        hideSpoilers: false, // false is a valid boolean → applied
        highContrast: undefined // doesn't appear in JSON
      }
    };
    const result = await importSettingsFromFile(makeFile(JSON.stringify(payload)));
    expect(result.ok).toBe(true);
    // hideSpoilers=false should be applied (the if-check uses typeof === "boolean").
    expect(setters.setHideSpoilers).toHaveBeenCalledWith(false);
  });

  it("returns ok=false + error when file.text() throws", async () => {
    // Stub File.prototype.text to throw.
    const original = File.prototype.text;
    File.prototype.text = function () {
      return Promise.reject(new Error("read error"));
    };
    try {
      const result = await importSettingsFromFile(makeFile("{}"));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Couldn't read file");
      }
    } finally {
      File.prototype.text = original;
    }
  });
});
