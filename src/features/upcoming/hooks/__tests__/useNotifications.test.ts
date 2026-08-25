// src/features/upcoming/hooks/__tests__/useNotifications.test.ts
//
// Tests for the applyLeadTime helper exported from useNotifications.
// We test the pure helper rather than the hook itself because the
// hook depends on Supabase auth state, browser Notification API, and
// SolidJS lifecycle — mocking all of that for a single time-shift
// check is overkill. The helper is the only logic that changed in
// the Phase 1 audit fix.

import { describe, it, expect } from "vitest";
import {
  applyLeadTime,
  buildReminderNotification,
  reminderDateForTitle
} from "../useNotifications";

describe("applyLeadTime", () => {
  it("returns the input unchanged for lead = 0", () => {
    expect(applyLeadTime("2026-08-15", 0)).toBe("2026-08-15");
  });

  it("returns the input unchanged for negative lead", () => {
    expect(applyLeadTime("2026-08-15", -30)).toBe("2026-08-15");
  });

  it("returns the input unchanged for NaN lead", () => {
    expect(applyLeadTime("2026-08-15", Number.NaN)).toBe("2026-08-15");
  });

  it("returns the input unchanged for non-YYYY-MM-DD input", () => {
    expect(applyLeadTime("not-a-date", 60)).toBe("not-a-date");
    expect(applyLeadTime("", 60)).toBe("");
  });

  it("shifts back 1 day for 1440-minute (24h) lead", () => {
    expect(applyLeadTime("2026-08-15", 1440)).toBe("2026-08-14");
  });

  it("shifts back 2 days for 2880-minute (48h) lead", () => {
    expect(applyLeadTime("2026-08-15", 2880)).toBe("2026-08-13");
  });

  it("handles month boundary when shifting back", () => {
    // August 1 - 1 day = July 31
    expect(applyLeadTime("2026-08-01", 1440)).toBe("2026-07-31");
  });

  it("handles year boundary when shifting back", () => {
    // Jan 1 2026 - 1 day = Dec 31 2025
    expect(applyLeadTime("2026-01-01", 1440)).toBe("2025-12-31");
  });

  it("sub-day leads (5/15/30/60 min) shift back 1 day (local-midnight basis)", () => {
    // The release_date column is DATE not TIMESTAMPTZ. We compute the
    // fire time as (local-midnight on release day) - leadMinutes. For
    // sub-day leads, that puts the fire time at 23:55 / 23:45 / 23:30 /
    // 23:00 on the PREVIOUS day — which rounds to the previous calendar
    // date for storage.
    //
    // This is the intended behavior: the reminder fires the evening
    // before release, which is what the user wants for a "60 min before"
    // reminder (they get notified the night before, not the morning of).
    expect(applyLeadTime("2026-08-15", 5)).toBe("2026-08-14");
    expect(applyLeadTime("2026-08-15", 15)).toBe("2026-08-14");
    expect(applyLeadTime("2026-08-15", 30)).toBe("2026-08-14");
    expect(applyLeadTime("2026-08-15", 60)).toBe("2026-08-14");
  });

  it("accepts ISO 8601 timestamps (uses first 10 chars)", () => {
    // TMDB sometimes returns full timestamps; the helper should
    // extract the date portion and treat it as a YYYY-MM-DD.
    expect(applyLeadTime("2026-08-15T09:00:00Z", 1440)).toBe("2026-08-14");
  });

  it("handles fractional lead minutes by flooring", () => {
    // 1440.7 minutes floors to 1440 = 1 day
    expect(applyLeadTime("2026-08-15", 1440.7)).toBe("2026-08-14");
  });

  it("keeps movie reminders on the actual release date", () => {
    expect(reminderDateForTitle("2026-08-26", "movie", 60)).toBe(
      "2026-08-26"
    );
  });

  it("continues applying the episode lead preference to series reminders", () => {
    expect(reminderDateForTitle("2026-08-26", "series", 60)).toBe(
      "2026-08-25"
    );
  });

  it("builds a title-aware movie notification with poster and detail URL", () => {
    const payload = buildReminderNotification({
      id: "reminder-1",
      tmdb_id: "12345",
      title_type: "movie",
      title_name: "Toxic: A Fairy Tale for Grown-ups",
      poster_path: "/toxic-poster.jpg"
    });

    expect(payload.title).toBe("Toxic: A Fairy Tale for Grown-ups is out today");
    expect(payload.body).toContain("Tap to open");
    expect(payload.url).toBe("/movie/12345");
    expect(payload.image).toContain("/toxic-poster.jpg");
    expect(payload.icon).toBe(payload.image);
    expect(payload.requireInteraction).toBe(true);
  });

  it("maps the stored series type to the canonical TV detail URL", () => {
    expect(
      buildReminderNotification({
        id: "reminder-2",
        tmdb_id: "987",
        title_type: "series",
        title_name: "A Series",
        poster_path: null
      }).url
    ).toBe("/tv/987");
  });
});
