export const formatRuntime = (
  mins: number | undefined | null
): string | null => {
  if (!mins || mins <= 0) return null;

  const h = Math.floor(mins / 60);
  const m = mins % 60;

  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
};

/**
 * Format a large vote count as a compact human-readable string.
 *
 *   - 0–999          → as-is (e.g. "432")
 *   - 1,000–9,999    → "1.1K", "8.5K" (one decimal, drop trailing ".0")
 *   - 10,000–999,999 → "11K", "250K" (no decimal — tens/hundreds of K)
 *   - 1,000,000+     → "1.5M", "2.3M" (one decimal)
 *   - 100,000,000+   → "100M", "1.2B"
 *
 * Used by the MDBList rating panel to render vote counts like "11K" or
 * "1.5M" next to each score, matching the IMDb/RT/Metacritic display
 * conventions. Negative inputs return "0" (defensive — vote counts are
 * never negative but the API could return garbage).
 *
 * @example formatVoteCount(0)        → "0"
 * @example formatVoteCount(432)      → "432"
 * @example formatVoteCount(11000)    → "11K"
 * @example formatVoteCount(8500)     → "8.5K"
 * @example formatVoteCount(1500000)  → "1.5M"
 */
export function formatVoteCount(
  votes: number | string | null | undefined
): string {
  if (votes == null) return "0";
  // MDBList sometimes returns vote counts as strings ("11500") — coerce.
  const n = typeof votes === "string" ? parseInt(votes, 10) : votes;
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(n);

  if (n < 10000) {
    // 1.0K–9.9K — one decimal, drop trailing ".0"
    const v = n / 1000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  if (n < 1_000_000) {
    // 10K–999K — no decimal
    return `${Math.round(n / 1000)}K`;
  }
  if (n < 100_000_000) {
    // 1.0M–99.9M — one decimal, drop trailing ".0"
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (n < 1_000_000_000) {
    // 100M–999M — no decimal
    return `${Math.round(n / 1_000_000)}M`;
  }
  // 1B+ — one decimal
  const v = n / 1_000_000_000;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}B`;
}

/**
 * Format an ISO date string (or Date / epoch ms) as "Jul 14, 2026".
 *
 * Uses the same `en-US` + `{ month: "short", day: "numeric", year: "numeric" }`
 * format that was previously inlined in ~10 components (TrashPage,
 * YourActivityCard, VaultCard, UpcomingPage, useStats, …). Consolidating
 * here so the format is consistent across the app and any future change
 * (e.g. locale switch) only needs to happen in one place.
 *
 * Returns the original input string if the date is invalid (so callers
 * don't crash on bad data — matches the prior `try/catch` behavior).
 */
export function formatDateShort(
  input: string | number | Date | null | undefined
): string | null {
  if (input == null || input === "") return null;
  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else if (typeof input === "number") {
    d = new Date(input);
  } else {
    d = new Date(input);
  }
  if (isNaN(d.getTime())) return typeof input === "string" ? input : null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * Format an ISO date string (or Date / epoch ms) as "September 1, 2000".
 *
 * Long-month counterpart to `formatDateShort` — used by the Details
 * modal's metadata grid for the "RELEASE DATE" cell, where the full
 * human-readable date reads better than the abbreviated "Sep 1, 2000"
 * form (the grid cell has room for it and the user is in a browsing
 * context, not a dense list).
 *
 * Mirrors `formatDateShort` semantics: returns null for null/undefined/
 * empty, and returns the original string when the input is a string
 * that doesn't parse to a valid Date (so callers don't crash on bad
 * TMDB data).
 *
 * @example formatDateLong("2000-09-01")           → "September 1, 2000"
 * @example formatDateLong("2000-09-01T00:00:00Z") → "September 1, 2000"
 * @example formatDateLong(undefined)               → null
 * @example formatDateLong("not-a-date")            → "not-a-date"
 */
export function formatDateLong(
  input: string | number | Date | null | undefined
): string | null {
  if (input == null || input === "") return null;
  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else if (typeof input === "number") {
    d = new Date(input);
  } else {
    d = new Date(input);
  }
  if (isNaN(d.getTime())) return typeof input === "string" ? input : null;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}
