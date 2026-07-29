// src/features/collections/utils/evaluateSmartRules.ts
import type { SmartRule, WatchlistItem } from "~/shared/types";
import { detectFranchise } from "~/shared/data/franchises";
import { normalizeGenre } from "~/shared/utils/genres";

/**
 * evaluateSmartRules — filter a vault by a set of smart collection rules.
 *
 * All rules are AND-combined: an item must match EVERY rule to be included.
 * (OR-combination is handled by the caller — see SmartCollectionBuilder,
 * which calls this once per rule and unions the results.)
 *
 * Supported operators (per field):
 *   - director:     contains, is, is_not
 *   - genre:        contains (is), is_not
 *   - franchise:    is, is_not
 *   - year:         gte, lte, between, is, is_not
 *   - rating:       gte, lte, between
 *   - status:       is, is_not
 *   - release_date: gte, lte, between  (lexicographic ISO date compare)
 *   - keyword:      contains
 *
 * This is a pure function — no side effects, no Firestore, no signals.
 */
export function evaluateSmartRules(
  rules: SmartRule[],
  vault: WatchlistItem[]
): WatchlistItem[] {
  if (!Array.isArray(rules) || !rules.length) return [];
  return vault.filter((item) => rules.every((rule) => matchRule(item, rule)));
}

function matchRule(item: WatchlistItem, rule: SmartRule): boolean {
  switch (rule.field) {
    case "director": {
      const val = String(rule.value).toLowerCase();
      const itemDir = item.director?.toLowerCase() ?? "";
      if (rule.operator === "contains") return itemDir.includes(val);
      if (rule.operator === "is") return itemDir === val;
      if (rule.operator === "is_not") return itemDir !== val;
      return false;
    }
    case "genre": {
      const val = String(rule.value).toLowerCase();
      const has = Array.isArray(item.genresList)
        && item.genresList.some((g) => normalizeGenre(g).toLowerCase() === val);
      if (rule.operator === "contains") return has;
      if (rule.operator === "is") return has;
      if (rule.operator === "is_not") return !has;
      return false;
    }
    case "franchise": {
      const franchiseName = String(rule.value);
      const detected = detectFranchise(item.title || item.name || "");
      const matches = detected?.name === franchiseName;
      if (rule.operator === "is") return matches;
      if (rule.operator === "is_not") return !matches;
      return false;
    }
    case "year": {
      const itemYear = parseInt(String(item.release_date || item.first_air_date || "").split("-")[0] || "0", 10);
      if (!itemYear) return false;
      const v = Number(rule.value);
      if (rule.operator === "gte") return itemYear >= v;
      if (rule.operator === "lte") return itemYear <= v;
      if (rule.operator === "is") return itemYear === v;
      if (rule.operator === "is_not") return itemYear !== v;
      if (rule.operator === "between" && Array.isArray(rule.value)) {
        const [min, max] = rule.value as [number, number];
        return itemYear >= min && itemYear <= max;
      }
      return false;
    }
    case "rating": {
      const itemRating = item.rating ?? 0;
      const v = Number(rule.value);
      if (rule.operator === "gte") return itemRating >= v;
      if (rule.operator === "lte") return itemRating <= v;
      if (rule.operator === "between" && Array.isArray(rule.value)) {
        const [min, max] = rule.value as [number, number];
        return itemRating >= min && itemRating <= max;
      }
      return false;
    }
    case "status": {
      const matches = item.status === String(rule.value);
      if (rule.operator === "is") return matches;
      if (rule.operator === "is_not") return !matches;
      return false;
    }
    case "release_date": {
      const itemDate = String(item.release_date || item.first_air_date || "");
      if (!itemDate) return false;
      const v = String(rule.value);
      // ISO date strings compare lexicographically — YYYY-MM-DD sorts
      // correctly with <, >, ===. For partial dates (just year) we
      // still get sensible results.
      if (rule.operator === "gte") return itemDate >= v;
      if (rule.operator === "lte") return itemDate <= v;
      if (rule.operator === "between" && Array.isArray(rule.value)) {
        const [min, max] = rule.value as [number, number];
        // between for release_date: min/max are years; expand to
        // YYYY-MM-DD boundaries so the comparison is inclusive.
        const minStr = String(min);
        const maxStr = String(max);
        return itemDate >= minStr && itemDate <= maxStr;
      }
      return false;
    }
    case "keyword": {
      const val = String(rule.value).toLowerCase();
      const title = (item.title || item.name || "").toLowerCase();
      if (rule.operator === "contains") return title.includes(val);
      return false;
    }
    default:
      return false;
  }
}
