// src/lib/email/templates/weeklyRecap.ts
//
// Weekly Recap email — sent by the weekly-recap cron when push delivery
// failed OR the user has push disabled but email enabled.
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

export interface WeeklyRecapActivity {
  completed: number;
  rated: number;
  added: number;
  highestRated: { title: string; rating: number } | null;
}

/**
 * Render the weekly recap email.
 *
 * The activity object is computed by the weekly-recap cron job (or
 * the in-app fallback sender) — see /api/cron/weekly-recap.ts for the
 * exact definitions of "completed", "rated", "added".
 *
 * If the user had no activity this week, we still send a friendly
 * nudge rather than skipping the email entirely — silence would leave
 * the user wondering if their recap is broken.
 */
export function renderWeeklyRecapEmail(
  activity: WeeklyRecapActivity
): string {
  const parts: string[] = [];

  if (activity.completed > 0) {
    parts.push(
      `🎬 You completed <strong style="color:#ffffff;">${activity.completed}</strong> title${activity.completed === 1 ? "" : "s"}`
    );
  }
  if (activity.rated > 0) {
    parts.push(
      `⭐ You rated <strong style="color:#ffffff;">${activity.rated}</strong> title${activity.rated === 1 ? "" : "s"}`
    );
  }
  if (activity.added > 0) {
    parts.push(
      `📋 You added <strong style="color:#ffffff;">${activity.added}</strong> title${activity.added === 1 ? "" : "s"} to your vault`
    );
  }
  if (activity.highestRated) {
    const safeT = escapeHtml(activity.highestRated.title);
    parts.push(
      `🏆 Your highest rated: <strong style="color:#ffffff;">${safeT}</strong> (${activity.highestRated.rating}/10)`
    );
  }

  const summary =
    parts.length > 0
      ? parts.join("<br>")
      : "📺 No activity this week. Time to discover something new!";

  const content = `
    <h2 style="margin:0 0 8px 0;font-size:20px;font-weight:600;color:#ffffff;">
      📊 Your Weekly CineLog Recap
    </h2>
    <p style="margin:0 0 16px 0;color:#aaaaaa;">
      Here's what you've been watching this week.
    </p>
    <div style="background:#1a1a1a;padding:20px;border-radius:8px;margin:16px 0;font-size:15px;line-height:1.7;color:#dddddd;">
      ${summary}
    </div>
    <a href="https://cinelogv2.vercel.app/profile"
       style="display:inline-block;background:#f5c842;color:#0a0a0a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
      View Your Profile
    </a>
  `;
  return renderBaseEmail(content, "Your Weekly CineLog Recap");
}
