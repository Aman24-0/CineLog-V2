// src/lib/email/templates/recommendations.ts
//
// "Recommendations" email — sent when Discover has new picks based on
// the user's taste. Phase 2 — Task 15.

import { renderBaseEmail } from "./base";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RecommendationItem {
  title: string;
  year: string;
  poster?: string;
}

/**
 * Render the recommendations email.
 *
 * @param items — Up to 5 recommendation items. The caller is
 *                responsible for capping the list — we render whatever
 *                we receive. Posters are optional and currently NOT
 *                embedded (email clients block remote images by
 *                default, and Resend's free tier doesn't support
 *                image hosting). We include the alt text so screen
 *                readers describe the poster.
 */
export function renderRecommendationsEmail(
  items: RecommendationItem[]
): string {
  const safeItems = (items ?? []).slice(0, 5);

  if (safeItems.length === 0) {
    const empty = `
      <h2 style="margin:0 0 8px 0;font-size:20px;font-weight:600;color:#ffffff;">
        ✨ New Picks For You
      </h2>
      <p style="margin:0 0 20px 0;color:#aaaaaa;">
        We noticed your taste is evolving. Open Discover to see fresh
        recommendations tailored to you.
      </p>
      <a href="https://cinelogv2.vercel.app/discover"
         style="display:inline-block;background:#f5c842;color:#0a0a0a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
        Open Discover
      </a>
    `;
    return renderBaseEmail(empty, "New Picks For You");
  }

  const listHtml = safeItems
    .map((item, idx) => {
      const safeTitle = escapeHtml(item.title || "Untitled");
      const safeYear = escapeHtml(item.year || "");
      const yearLine = safeYear
        ? `<span style="color:#888;font-size:13px;">(${safeYear})</span>`
        : "";
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;">
            <div style="font-size:15px;color:#ffffff;">
              ${idx + 1}. <strong>${safeTitle}</strong> ${yearLine}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  const content = `
    <h2 style="margin:0 0 8px 0;font-size:20px;font-weight:600;color:#ffffff;">
      ✨ New Picks For You
    </h2>
    <p style="margin:0 0 16px 0;color:#aaaaaa;">
      Based on what you've been watching, here are ${safeItems.length} title${safeItems.length === 1 ? "" : "s"} we think you'll enjoy.
    </p>
    <table role="presentation" style="width:100%;border-collapse:collapse;">
      ${listHtml}
    </table>
    <a href="https://cinelogv2.vercel.app/discover"
       style="display:inline-block;background:#f5c842;color:#0a0a0a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin-top:16px;">
      See More on Discover
    </a>
  `;
  return renderBaseEmail(content, "New Picks For You");
}
