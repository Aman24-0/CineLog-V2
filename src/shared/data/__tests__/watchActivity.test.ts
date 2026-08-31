// src/shared/data/__tests__/watchActivity.test.ts
//
// Regression tests for the shared watch-activity vocabulary.
//
// These guard the SINGLE source of truth for the "where did you watch?"
// device vocabulary AND the special "other" platform sentinel. Both
// DetailsEditForm (the picker) and YourActivityCard (the read-back) use
// the constants / helpers in watchActivity.ts so save + display never
// drift. A regression here would silently break either:
//   - the Edit form's picker (the wrong labels/emojis would render)
//   - the read-back card (the saved value would display with the wrong
//     label/emoji, or no row at all)
//
// The 2026-09-02 fix added the "other" platform sentinel — a special
// UI-only value (pirate flag 🏴‍☠️) representing "watched somewhere
// outside the OTT/platform catalogue". It is NOT in the Supabase
// justwatch_provider_catalog table. These tests assert the sentinel
// value, its display metadata, and that the resolveOtherPlatform helper
// correctly identifies it AND returns null for normal catalogue
// technicalNames (so the caller can fall through to the catalogue).

import { describe, it, expect } from "vitest";
import {
  OTHER_PLATFORM_VALUE,
  OTHER_PLATFORM_META,
  WATCH_DEVICE_OPTIONS,
  WATCH_DEVICE_OPTION_THEATRE,
  resolveWatchDevice,
  resolveOtherPlatform
} from "../watchActivity";

describe("watchActivity — shared vocabulary", () => {
  describe("OTHER_PLATFORM_VALUE + OTHER_PLATFORM_META", () => {
    it("uses 'other' as the stable persisted sentinel value", () => {
      expect(OTHER_PLATFORM_VALUE).toBe("other");
    });

    it("exposes a human-readable label + pirate flag emoji", () => {
      expect(OTHER_PLATFORM_META.value).toBe("other");
      expect(OTHER_PLATFORM_META.label).toBe("Other / Outside OTT");
      expect(OTHER_PLATFORM_META.emoji).toBe("🏴‍☠️");
    });
  });

  describe("WATCH_DEVICE_OPTIONS", () => {
    it("contains the 4 base devices with emoji + label", () => {
      const values = WATCH_DEVICE_OPTIONS.map((o) => o.value);
      expect(values).toEqual(["tv", "computer", "tablet", "mobile"]);
      for (const opt of WATCH_DEVICE_OPTIONS) {
        expect(typeof opt.label).toBe("string");
        expect(opt.label.length).toBeGreaterThan(0);
        expect(typeof opt.emoji).toBe("string");
        expect(opt.emoji.length).toBeGreaterThan(0);
      }
    });

    it("WATCH_DEVICE_OPTION_THEATRE is a separate constant with the 🎬 emoji", () => {
      expect(WATCH_DEVICE_OPTION_THEATRE.value).toBe("theatre");
      expect(WATCH_DEVICE_OPTION_THEATRE.label).toBe("Theatre");
      expect(WATCH_DEVICE_OPTION_THEATRE.emoji).toBe("🎬");
    });
  });

  describe("resolveWatchDevice", () => {
    it("resolves every device value to its emoji + label", () => {
      expect(resolveWatchDevice("tv")).toEqual({
        emoji: "📺",
        label: "TV"
      });
      expect(resolveWatchDevice("computer")).toEqual({
        emoji: "💻",
        label: "Computer"
      });
      expect(resolveWatchDevice("tablet")).toEqual({
        emoji: "📱",
        label: "Tablet"
      });
      expect(resolveWatchDevice("mobile")).toEqual({
        emoji: "📱",
        label: "Mobile"
      });
      expect(resolveWatchDevice("theatre")).toEqual({
        emoji: "🎬",
        label: "Theatre"
      });
    });

    it("returns null for null/undefined/unknown values", () => {
      expect(resolveWatchDevice(null)).toBeNull();
      expect(resolveWatchDevice(undefined)).toBeNull();
      expect(resolveWatchDevice("")).toBeNull();
      expect(resolveWatchDevice("unknown-device")).toBeNull();
    });
  });

  describe("resolveOtherPlatform", () => {
    it("returns the pirate flag + label for the 'other' sentinel", () => {
      expect(resolveOtherPlatform("other")).toEqual({
        emoji: "🏴‍☠️",
        label: "Other / Outside OTT"
      });
    });

    it("returns null for null/undefined", () => {
      expect(resolveOtherPlatform(null)).toBeNull();
      expect(resolveOtherPlatform(undefined)).toBeNull();
      expect(resolveOtherPlatform("")).toBeNull();
    });

    it("returns null for any other value — the caller must resolve via the catalogue", () => {
      // Normal JustWatch/Supabase catalogue platforms (netflix, prime,
      // etc.) are NOT handled here — the caller (YourActivityCard) looks
      // up the published catalogue by technicalName and uses its icon +
      // clearName. This sentinel only handles the special "other" case.
      expect(resolveOtherPlatform("netflix")).toBeNull();
      expect(resolveOtherPlatform("prime")).toBeNull();
      expect(resolveOtherPlatform("disney_plus")).toBeNull();
      expect(resolveOtherPlatform("some-unknown-platform")).toBeNull();
    });
  });
});
