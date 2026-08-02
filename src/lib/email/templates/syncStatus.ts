// src/lib/email/templates/syncStatus.ts
//
// "Sync Status" email — sent when a sync succeeds or fails AND the
// user has email sync-status notifications enabled. Phase 2 — Task 15.

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
 * Render the sync-status email.
 *
 * @param status     — "success" or "error".
 * @param timestamp  — A pre-formatted timestamp string (caller-localized).
 * @param titleCount — The number of titles that were synced (0 if unknown
 *                     or if the sync failed before counting).
 */
export function renderSyncStatusEmail(
  status: "success" | "error",
  timestamp: string,
  titleCount: number
): string {
  const safeTimestamp = escapeHtml(timestamp || new Date().toLocaleString());
  const isSuccess = status === "success";

  const header = isSuccess
    ? "✅ Sync Complete"
    : "⚠️ Sync Failed";

  const message = isSuccess
    ? `Your CineLog data synced successfully. <strong style="color:#ffffff;">${titleCount}</strong> title${titleCount === 1 ? "" : "s"} were updated.`
    : "We couldn't sync your CineLog data just now. Don't worry — your local data is intact, and we'll retry automatically on the next sync window.";

  const ctaLabel = isSuccess ? "Open CineLog" : "Open Sync Settings";
  const ctaUrl = isSuccess
    ? "https://cinelogv2.vercel.app/watchlist"
    : "https://cinelogv2.vercel.app/settings/sync";

  const content = `
    <h2 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#ffffff;">
      ${header}
    </h2>
    <p style="margin:0 0 12px 0;color:#aaaaaa;font-size:15px;">
      ${message}
    </p>
    <p style="margin:0 0 20px 0;color:#888;font-size:13px;">
      Timestamp: ${safeTimestamp}
    </p>
    <a href="${ctaUrl}"
       style="display:inline-block;background:#f5c842;color:#0a0a0a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
      ${ctaLabel}
    </a>
  `;
  return renderBaseEmail(content, header);
}
