// src/features/collections/__tests__/evaluateSmartRules.test.ts
import { describe, it, expect } from "vitest";
import { evaluateSmartRules } from "../utils/evaluateSmartRules";
import { makeMovie, makeTVSeries } from "~/__test-fixtures__/factories";
import type { SmartRule } from "~/shared/types";

describe("evaluateSmartRules", () => {
  it("returns empty array for empty rules", () => {
    const vault = [makeMovie()];
    expect(evaluateSmartRules([], vault)).toEqual([]);
  });

  it("returns empty array for null rules", () => {
    const vault = [makeMovie()];
    expect(evaluateSmartRules(null as unknown as SmartRule[], vault)).toEqual([]);
  });

  it("AND-combines multiple rules (item must match ALL)", () => {
    const vault = [
      makeMovie({ id: "1", director: "Nolan", genresList: ["Sci-Fi"], status: "Planned", release_date: "2020-01-01" }),
      makeMovie({ id: "2", director: "Nolan", genresList: ["Drama"], status: "Planned", release_date: "2020-01-01" }),
      makeMovie({ id: "3", director: "Nolan", genresList: ["Sci-Fi"], status: "Completed", release_date: "2020-01-01" }),
    ];
    const rules: SmartRule[] = [
      { field: "director", operator: "contains", value: "nolan" },
      { field: "genre", operator: "contains", value: "Sci-Fi" },
      { field: "status", operator: "is", value: "Planned" },
    ];
    const result = evaluateSmartRules(rules, vault);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  describe("director field", () => {
    it("matches with 'contains' operator (case-insensitive)", () => {
      const vault = [makeMovie({ id: "1", director: "Christopher Nolan" })];
      const rules: SmartRule[] = [{ field: "director", operator: "contains", value: "nolan" }];
      expect(evaluateSmartRules(rules, vault)).toHaveLength(1);
    });

    it("matches with 'is' operator (exact, case-insensitive)", () => {
      const vault = [makeMovie({ id: "1", director: "Nolan" })];
      const rules: SmartRule[] = [{ field: "director", operator: "is", value: "nolan" }];
      expect(evaluateSmartRules(rules, vault)).toHaveLength(1);
    });

    it("does not match when director is undefined", () => {
      const vault = [makeMovie({ id: "1", director: undefined })];
      const rules: SmartRule[] = [{ field: "director", operator: "contains", value: "nolan" }];
      expect(evaluateSmartRules(rules, vault)).toHaveLength(0);
    });
  });

  describe("genre field", () => {
    it("matches with 'contains' operator", () => {
      const vault = [makeMovie({ id: "1", genresList: ["Action", "Sci-Fi"] })];
      const rules: SmartRule[] = [{ field: "genre", operator: "contains", value: "sci-fi" }];
      expect(evaluateSmartRules(rules, vault)).toHaveLength(1);
    });

    it("does not match when genre not in list", () => {
      const vault = [makeMovie({ id: "1", genresList: ["Drama"] })];
      const rules: SmartRule[] = [{ field: "genre", operator: "contains", value: "sci-fi" }];
      expect(evaluateSmartRules(rules, vault)).toHaveLength(0);
    });
  });

  describe("year field", () => {
    it("matches with 'gte' operator", () => {
      const vault = [
        makeMovie({ id: "1", release_date: "2023-01-01" }),
        makeMovie({ id: "2", release_date: "2010-01-01" }),
      ];
      const rules: SmartRule[] = [{ field: "year", operator: "gte", value: 2020 }];
      const result = evaluateSmartRules(rules, vault);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("matches with 'lte' operator", () => {
      const vault = [
        makeMovie({ id: "1", release_date: "2023-01-01" }),
        makeMovie({ id: "2", release_date: "2010-01-01" }),
      ];
      const rules: SmartRule[] = [{ field: "year", operator: "lte", value: 2015 }];
      const result = evaluateSmartRules(rules, vault);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("matches with 'between' operator", () => {
      const vault = [
        makeMovie({ id: "1", release_date: "2020-01-01" }),
        makeMovie({ id: "2", release_date: "2025-01-01" }),
      ];
      const rules: SmartRule[] = [{ field: "year", operator: "between", value: [2018, 2023] }];
      const result = evaluateSmartRules(rules, vault);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("returns false when no date available", () => {
      const vault = [makeMovie({ id: "1", release_date: undefined })];
      const rules: SmartRule[] = [{ field: "year", operator: "gte", value: 2020 }];
      expect(evaluateSmartRules(rules, vault)).toHaveLength(0);
    });
  });

  describe("rating field", () => {
    it("matches with 'gte' operator", () => {
      const vault = [
        makeMovie({ id: "1", rating: 9 }),
        makeMovie({ id: "2", rating: 3 }),
      ];
      const rules: SmartRule[] = [{ field: "rating", operator: "gte", value: 7 }];
      const result = evaluateSmartRules(rules, vault);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("treats undefined rating as 0", () => {
      const vault = [makeMovie({ id: "1", rating: undefined })];
      const rules: SmartRule[] = [{ field: "rating", operator: "gte", value: 1 }];
      expect(evaluateSmartRules(rules, vault)).toHaveLength(0);
    });
  });

  describe("status field", () => {
    it("matches with 'is' operator", () => {
      const vault = [
        makeMovie({ id: "1", status: "Watching" }),
        makeMovie({ id: "2", status: "Completed" }),
      ];
      const rules: SmartRule[] = [{ field: "status", operator: "is", value: "Watching" }];
      const result = evaluateSmartRules(rules, vault);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });
  });

  describe("keyword field", () => {
    it("matches title with 'contains' operator", () => {
      const vault = [
        makeMovie({ id: "1", title: "Inception" }),
        makeMovie({ id: "2", title: "Matrix" }),
      ];
      const rules: SmartRule[] = [{ field: "keyword", operator: "contains", value: "cept" }];
      const result = evaluateSmartRules(rules, vault);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("matches name (TV series) with 'contains' operator", () => {
      // makeTVSeries sets title="Test Movie" by default (from makeWatchlistItem),
      // so we override title to undefined so `item.title || item.name` uses name.
      const vault = [makeTVSeries({ id: "1", title: undefined, name: "Breaking Bad" })];
      const rules: SmartRule[] = [{ field: "keyword", operator: "contains", value: "breaking" }];
      expect(evaluateSmartRules(rules, vault)).toHaveLength(1);
    });
  });
});
