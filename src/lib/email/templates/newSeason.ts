// src/lib/email/templates/newSeason.ts
//
// "New Season Available" email — sent when a series in the user's vault
// gets a new season AND push delivery failed (or push is unavailable).
// Phase 2 — Task 15.

import { renderBaseEmail } from "./base";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render the "new season available" email.
 *
 * @param seriesName   — The name of the series.
 * @param seasonNumber — The new season number (1-indexed).
 * @param episodeCount — The number of episodes in the new season.
 *                       0 means "unknown" — the copy adapts.
 */
export function renderNewSeasonEmail(
  seriesName: string,
  seasonNumber: number,
  episodeCount: number
): string {
  const safeName = escapeHtml(seriesName || "A series you track");
  const safeSeason = Number.isFinite(seasonNumber) && seasonNumber > 0
    ? seasonNumber
    : 1;

  const episodeLine =
    episodeCount > 0
      ? `<p style="margin:0 0 20px 0;color:#aaaaaa;font-size:14px;">
           Season ${safeSeason} has <strong style="color:#f5f5f5;">${episodeCount}</strong> episode${episodeCount === 1 ? "" : "s"}.
         </p>`
      : "";

  const content = `
    <h2 style="margin:0 0 8px 0;font-size:20px;font-weight:600;color:#ffffff;">
      📺 New Season Available
    </h2>
    <p style="margin:0 0 12px 0;color:#aaaaaa;font-size:18px;">
      <strong style="color:#ffffff;">${safeName}</strong> — Season ${safeSeason} is here.
    </p>
    ${episodeLine}
    <a href="https://cinelogv2.vercel.app/watchlist"
       style="display:inline-block;background:#f5c842;color:#0a0a0a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
      Open Watchlist
    </a>
  `;
  return renderBaseEmail(content, `New Season: ${seriesName}`);
}
