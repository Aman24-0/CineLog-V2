// src/lib/email/templates/reminder.ts
//
// Reminder email — sent when an episode reminder fires AND the push
// delivery failed (or push is unavailable). Phase 2 — Task 15.

import { renderBaseEmail } from "./base";

/**
 * Escape user-provided text so it can be safely interpolated into
 * HTML. Used for title / message / releaseDate — all of which come
 * from the user's reminder data and could contain <, >, &.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render the reminder email.
 *
 * @param title       — The title of the movie/series the user is being
 *                      reminded about.
 * @param releaseDate — A formatted date string (already localized by
 *                      the caller — we don't do any date formatting
 *                      here so the email matches the user's locale).
 * @param message     — Optional custom message; if empty, a sensible
 *                      default is used.
 */
export function renderReminderEmail(
  title: string,
  releaseDate: string,
  message: string
): string {
  const safeTitle = escapeHtml(title || "Your reminder");
  const safeDate = escapeHtml(releaseDate || "Unknown");
  const safeMessage = message
    ? escapeHtml(message)
    : "Your tracked title is available now. Tap below to open CineLog.";

  const content = `
    <h2 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#ffffff;">
      🔔 ${safeTitle}
    </h2>
    <p style="margin:0 0 12px 0;color:#aaaaaa;">
      ${safeMessage}
    </p>
    <p style="margin:0 0 20px 0;color:#aaaaaa;font-size:14px;">
      <strong style="color:#f5f5f5;">Release date:</strong> ${safeDate}
    </p>
    <a href="https://cinelogv2.vercel.app/upcoming"
       style="display:inline-block;background:#f5c842;color:#0a0a0a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
      Open CineLog
    </a>
  `;
  return renderBaseEmail(content, `Reminder: ${title}`);
}
