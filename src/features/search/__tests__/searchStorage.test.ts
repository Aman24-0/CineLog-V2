// src/features/search/__tests__/searchStorage.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  RECENT_KEY,
  MAX_RECENT,
  loadRecent,
  saveRecent,
} from "../searchStorage";

describe("searchStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("constants", () => {
    it("RECENT_KEY is 'cinelog_recent_searches'", () => {
      expect(RECENT_KEY).toBe("cinelog_recent_searches");
    });

    it("MAX_RECENT is 8", () => {
      expect(MAX_RECENT).toBe(8);
    });
  });

  describe("loadRecent", () => {
    it("returns empty array when localStorage is empty", () => {
      expect(loadRecent()).toEqual([]);
    });

    it("returns parsed array from localStorage", () => {
      localStorage.setItem(RECENT_KEY, JSON.stringify(["batman", "inception"]));
      expect(loadRecent()).toEqual(["batman", "inception"]);
    });

    it("returns empty array for invalid JSON", () => {
      localStorage.setItem(RECENT_KEY, "not-json");
      expect(loadRecent()).toEqual([]);
    });

    it("filters non-string entries", () => {
      localStorage.setItem(RECENT_KEY, JSON.stringify(["valid", 123, null, "also-valid"]));
      expect(loadRecent()).toEqual(["valid", "also-valid"]);
    });

    it("truncates to MAX_RECENT entries", () => {
      const many = Array.from({ length: 20 }, (_, i) => `search-${i}`);
      localStorage.setItem(RECENT_KEY, JSON.stringify(many));
      expect(loadRecent()).toHaveLength(MAX_RECENT);
    });
  });

  describe("saveRecent", () => {
    it("stores array in localStorage", () => {
      saveRecent(["batman", "inception"]);
      const stored = localStorage.getItem(RECENT_KEY);
      expect(stored).toBe(JSON.stringify(["batman", "inception"]));
    });

    it("truncates to MAX_RECENT entries", () => {
      const many = Array.from({ length: 20 }, (_, i) => `search-${i}`);
      saveRecent(many);
      const stored = JSON.parse(localStorage.getItem(RECENT_KEY)!);
      expect(stored).toHaveLength(MAX_RECENT);
    });
  });
});
