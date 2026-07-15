export const formatRuntime = (
  mins: number | undefined | null
): string | null => {
  if (!mins || mins <= 0) return null;

  const h = Math.floor(mins / 60);
  const m = mins % 60;

  return h > 0
    ? `${h}h${m > 0 ? ` ${m}m` : ""}`
    : `${m}m`;
};

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
  input: string | number | Date | null | undefined,
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
    year: "numeric",
  });
}
