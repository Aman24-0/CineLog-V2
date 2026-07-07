// src/features/collections/utils/evaluateSmartRules.ts
import type { SmartRule, WatchlistItem } from "~/shared/types";
import { detectFranchise } from "~/shared/data/franchises";

/**
 * evaluateSmartRules — filter a vault by a set of smart collection rules.
 *
 * All rules are AND-combined: an item must match EVERY rule to be included.
 * This is a pure function — no side effects, no Firestore, no signals.
 */
export function evaluateSmartRules(
  rules: SmartRule[],
  vault: WatchlistItem[]
): WatchlistItem[] {
  if (!rules.length) return [];
  return vault.filter((item) => rules.every((rule) => matchRule(item, rule)));
}

function matchRule(item: WatchlistItem, rule: SmartRule): boolean {
  switch (rule.field) {
    case "director": {
      const val = String(rule.value).toLowerCase();
      return rule.operator === "contains"
        ? (item.director?.toLowerCase().includes(val) ?? false)
        : rule.operator === "is"
          ? (item.director?.toLowerCase() === val ?? false)
          : false;
    }
    case "genre": {
      const val = String(rule.value).toLowerCase();
      return rule.operator === "contains"
        ? (item.genresList?.some((g) => g.toLowerCase() === val) || false)
        : false;
    }
    case "franchise": {
      const franchiseName = String(rule.value);
      const detected = detectFranchise(item.title || item.name || "");
      return rule.operator === "is"
        ? detected?.name === franchiseName
        : false;
    }
    case "year": {
      const itemYear = parseInt((item.release_date || item.first_air_date || "").split("-")[0] || "0");
      if (!itemYear) return false;
      if (rule.operator === "gte") return itemYear >= Number(rule.value);
      if (rule.operator === "lte") return itemYear <= Number(rule.value);
      if (rule.operator === "between" && Array.isArray(rule.value)) {
        const [min, max] = rule.value as [number, number];
        return itemYear >= min && itemYear <= max;
      }
      return false;
    }
    case "rating": {
      const itemRating = item.rating ?? 0;
      if (rule.operator === "gte") return itemRating >= Number(rule.value);
      if (rule.operator === "lte") return itemRating <= Number(rule.value);
      if (rule.operator === "between" && Array.isArray(rule.value)) {
        const [min, max] = rule.value as [number, number];
        return itemRating >= min && itemRating <= max;
      }
      return false;
    }
    case "status": {
      return rule.operator === "is" && item.status === String(rule.value);
    }
    case "keyword": {
      const val = String(rule.value).toLowerCase();
      const title = (item.title || item.name || "").toLowerCase();
      return rule.operator === "contains"
        ? title.includes(val)
        : false;
    }
    default:
      return false;
  }
}
