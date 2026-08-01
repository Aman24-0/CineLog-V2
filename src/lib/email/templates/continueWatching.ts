// src/lib/email/templates/continueWatching.ts
//
// "Continue Watching" email — sent as a gentle reminder to resume an
// in-progress title. Phase 2 — Task 15.

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
 * Render the "continue watching" email.
 *
 * @param title    — The title to resume.
 * @param progress — A human-readable progress description, e.g.
 *                   "S2 E5 — 23 min left" or "45% complete".
 */
export function renderContinueWatchingEmail(
  title: string,
  progress: string
): string {
  const safeTitle = escapeHtml(title || "A title you were watching");
  const safeProgress = escapeHtml(progress || "Continue where you left off");

  const content = `
    <h2 style="margin:0 0 8px 0;font-size:20px;font-weight:600;color:#ffffff;">
      ▶️ Continue Watching
    </h2>
    <p style="margin:0 0 8px 0;color:#aaaaaa;font-size:18px;">
      Pick up where you left off with <strong style="color:#ffffff;">${safeTitle}</strong>.
    </p>
    <p style="margin:0 0 20px 0;color:#aaaaaa;font-size:14px;">
      ${safeProgress}
    </p>
    <a href="https://cinelogv2.vercel.app/watchlist"
       style="display:inline-block;background:#f5c842;color:#0a0a0a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
      Resume Watching
    </a>
  `;
  return renderBaseEmail(content, `Continue Watching: ${title}`);
}
