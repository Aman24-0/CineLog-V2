// src/lib/email/__tests__/renderer.test.ts
//
// Tests for the email template renderer + the individual template
// functions. These are pure string-building functions with no I/O,
// so they're trivially testable.
//
// We verify:
//   • Each NotificationType renders a complete HTML document.
//   • The CineLog branding (🎬 CineLog wordmark) is present.
//   • The footer "Manage your notification preferences" link is present.
//   • User-provided strings are HTML-escaped (no XSS via title, etc.).
//   • The renderEmailTemplate dispatcher routes each type to the
//     correct template.
//   • Unknown types fall back to the generic base template.

import { describe, it, expect } from "vitest";
import {
  renderEmailTemplate,
  type NotificationType
} from "~/lib/email/renderer";
import { renderBaseEmail } from "~/lib/email/templates/base";
import { renderReminderEmail } from "~/lib/email/templates/reminder";
import { renderWeeklyRecapEmail } from "~/lib/email/templates/weeklyRecap";
import { renderNewSeasonEmail } from "~/lib/email/templates/newSeason";
import { renderContinueWatchingEmail } from "~/lib/email/templates/continueWatching";
import { renderRecommendationsEmail } from "~/lib/email/templates/recommendations";
import { renderSyncStatusEmail } from "~/lib/email/templates/syncStatus";

describe("renderBaseEmail", () => {
  it("wraps arbitrary content in the CineLog branded shell", () => {
    const html = renderBaseEmail("<p>Hello</p>", "Test Subject");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("🎬 CineLog");
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("Manage your notification preferences");
    expect(html).toContain("https://cinelogv2.vercel.app/settings/notifications");
  });

  it("escapes the title for safe inclusion in the <title> tag", () => {
    const html = renderBaseEmail("<p>x</p>", "<script>alert(1)</script>");
    // The title appears in <title>...</title> — should be escaped.
    expect(html).toContain("<title>&lt;script&gt;alert(1)&lt;/script&gt;</title>");
    // And the raw <script> tag should NOT appear unescaped in the title.
    expect(html).not.toMatch(/<title><script>alert/);
  });

  it("does NOT escape content (the caller is responsible for escaping)", () => {
    const html = renderBaseEmail("<strong>bold</strong>", "Test");
    expect(html).toContain("<strong>bold</strong>");
  });
});

describe("renderEmailTemplate dispatcher", () => {
  const types: NotificationType[] = [
    "reminder",
    "weekly_recap",
    "new_season",
    "continue_watching",
    "recommendations",
    "sync_status"
  ];

  it.each(types)("renders a complete HTML document for type=%s", (type) => {
    const html = renderEmailTemplate(type, {
      title: "Test Title",
      message: "Test message body",
      releaseDate: "August 15, 2026",
      activity: {
        completed: 3,
        rated: 5,
        added: 2,
        highestRated: { title: "Inception", rating: 9 }
      },
      seriesName: "Test Series",
      seasonNumber: 2,
      episodeCount: 10,
      progress: "S2 E5 — 23 min left",
      recommendations: [
        { title: "Movie A", year: "2024" },
        { title: "Movie B", year: "2023" }
      ],
      status: "success",
      timestamp: "2026-08-02 10:00 UTC",
      titleCount: 42
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("🎬 CineLog");
    expect(html).toContain("Manage your notification preferences");
  });

  it("renders reminder type with the reminder template", () => {
    const html = renderEmailTemplate("reminder", {
      title: "Inception",
      releaseDate: "August 15, 2026",
      message: "Your tracked title is available now."
    });
    expect(html).toContain("🔔");
    expect(html).toContain("Inception");
    expect(html).toContain("August 15, 2026");
    expect(html).toContain("Open CineLog");
  });

  it("renders weekly_recap type with the recap template", () => {
    const html = renderEmailTemplate("weekly_recap", {
      activity: {
        completed: 3,
        rated: 5,
        added: 2,
        highestRated: { title: "Inception", rating: 9 }
      }
    });
    expect(html).toContain("📊");
    expect(html).toContain("completed");
    expect(html).toContain("Inception");
    expect(html).toContain("9/10");
  });

  it("renders weekly_recap with no activity as a friendly nudge", () => {
    const html = renderEmailTemplate("weekly_recap", {
      activity: { completed: 0, rated: 0, added: 0, highestRated: null }
    });
    expect(html).toContain("No activity this week");
  });

  it("renders new_season type with the new-season template", () => {
    const html = renderEmailTemplate("new_season", {
      seriesName: "Stranger Things",
      seasonNumber: 5,
      episodeCount: 8
    });
    expect(html).toContain("📺");
    expect(html).toContain("Stranger Things");
    expect(html).toContain("Season 5");
    // The count is wrapped in <strong>8</strong>, so the literal
    // "8 episodes" string isn't contiguous — verify the parts.
    expect(html).toContain(">8<");
    expect(html).toContain("episodes");
  });

  it("renders continue_watching type with the continue-watching template", () => {
    const html = renderEmailTemplate("continue_watching", {
      title: "The Office",
      progress: "S2 E5 — 23 min left"
    });
    expect(html).toContain("▶️");
    expect(html).toContain("The Office");
    expect(html).toContain("S2 E5 — 23 min left");
  });

  it("renders recommendations type with the recommendations template", () => {
    const html = renderEmailTemplate("recommendations", {
      recommendations: [
        { title: "Movie A", year: "2024" },
        { title: "Movie B", year: "2023" }
      ]
    });
    expect(html).toContain("✨");
    expect(html).toContain("Movie A");
    expect(html).toContain("Movie B");
    expect(html).toContain("(2024)");
    expect(html).toContain("(2023)");
  });

  it("renders recommendations with empty list as a CTA to open Discover", () => {
    const html = renderEmailTemplate("recommendations", {
      recommendations: []
    });
    expect(html).toContain("Open Discover");
  });

  it("renders sync_status success type correctly", () => {
    const html = renderEmailTemplate("sync_status", {
      status: "success",
      timestamp: "2026-08-02 10:00 UTC",
      titleCount: 42
    });
    expect(html).toContain("✅");
    expect(html).toContain("Sync Complete");
    // The count is wrapped in <strong>42</strong>, so the literal
    // "42 titles" string isn't contiguous — verify the parts.
    expect(html).toContain(">42<");
    expect(html).toContain("titles");
  });

  it("renders sync_status error type correctly", () => {
    const html = renderEmailTemplate("sync_status", {
      status: "error",
      timestamp: "2026-08-02 10:00 UTC",
      titleCount: 0
    });
    expect(html).toContain("⚠️");
    expect(html).toContain("Sync Failed");
    expect(html).toContain("Open Sync Settings");
  });
});

describe("HTML escaping (XSS protection)", () => {
  it("reminder email escapes user-provided title", () => {
    const html = renderReminderEmail(
      "<script>alert('xss')</script>",
      "2026-08-15",
      ""
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/🎬 CineLog.*<script>alert/);
  });

  it("reminder email escapes user-provided message", () => {
    const html = renderReminderEmail(
      "Safe Title",
      "2026-08-15",
      "<img src=x onerror=alert(1)>"
    );
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("weekly recap email escapes the highest-rated title", () => {
    const html = renderWeeklyRecapEmail({
      completed: 1,
      rated: 1,
      added: 0,
      highestRated: {
        title: '<script>alert("xss")</script>',
        rating: 9
      }
    });
    expect(html).toContain("&lt;script&gt;");
  });

  it("new season email escapes the series name", () => {
    const html = renderNewSeasonEmail(
      '"><script>alert(1)</script>',
      1,
      10
    );
    expect(html).toContain("&lt;script&gt;");
  });

  it("continue watching email escapes the title and progress", () => {
    const html = renderContinueWatchingEmail(
      "<b>Bold</b>",
      "<i>italic</i>"
    );
    expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;italic&lt;/i&gt;");
  });

  it("recommendations email escapes each item title and year", () => {
    const html = renderRecommendationsEmail([
      { title: "<script>alert(1)</script>", year: '2024";drop table' }
    ]);
    expect(html).toContain("&lt;script&gt;");
  });

  it("sync status email escapes the timestamp", () => {
    const html = renderSyncStatusEmail(
      "success",
      "<script>alert(1)</script>",
      0
    );
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("default values", () => {
  it("reminder email handles empty title with a sensible default", () => {
    const html = renderReminderEmail("", "2026-08-15", "");
    expect(html).toContain("Your reminder");
  });

  it("reminder email handles empty releaseDate with 'Unknown'", () => {
    const html = renderReminderEmail("Title", "", "");
    expect(html).toContain("Unknown");
  });

  it("new season email handles invalid seasonNumber with 1", () => {
    const html = renderNewSeasonEmail("Title", -5, 10);
    expect(html).toContain("Season 1");
  });

  it("new season email handles 0 episodeCount by omitting the episode line", () => {
    const html = renderNewSeasonEmail("Title", 1, 0);
    expect(html).not.toMatch(/Season 1 has/);
  });

  it("weekly recap with all-zero activity shows the no-activity nudge", () => {
    const html = renderWeeklyRecapEmail({
      completed: 0,
      rated: 0,
      added: 0,
      highestRated: null
    });
    expect(html).toContain("No activity this week");
  });
});

describe("renderEmailTemplate fallback for unknown types", () => {
  it("renders a generic base email for unknown types (runtime safety)", () => {
    // Force-cast an invalid type to test the runtime fallback path.
    // TypeScript would normally prevent this, but a future caller
    // might add a new NotificationType without updating the renderer.
    const html = renderEmailTemplate(
      "unknown_type" as unknown as NotificationType,
      { title: "Title", message: "Custom message" }
    );
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Custom message");
  });
});
