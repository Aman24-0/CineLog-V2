import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildNotification,
  localDateString,
  posterUrl
} from "../release-reminders";

afterEach(() => {
  vi.useRealTimers();
});

describe("release-reminders helpers", () => {
  it("uses each user's timezone for the local calendar date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:30:00.000Z"));

    expect(localDateString("Asia/Kolkata")).toBe("2026-08-25");
    expect(localDateString("America/Los_Angeles")).toBe("2026-08-24");
  });

  it("falls back to UTC for an invalid timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T01:00:00.000Z"));

    expect(localDateString("not/a-timezone")).toBe("2026-08-26");
    expect(localDateString(null)).toBe("2026-08-26");
  });

  it("converts a TMDB poster path into a notification image URL", () => {
    expect(posterUrl("/toxic-poster.jpg")).toBe(
      "https://image.tmdb.org/t/p/w342/toxic-poster.jpg"
    );
    expect(posterUrl("https://cdn.example/poster.jpg")).toBe(
      "https://cdn.example/poster.jpg"
    );
    expect(posterUrl(null)).toBeUndefined();
  });

  it("builds a movie notification with title, poster, and canonical detail URL", () => {
    const payload = buildNotification({
      id: "r1",
      tmdb_id: "1213243",
      title_type: "movie",
      title_name: "Toxic: A Fairy Tale for Grown-ups",
      poster_path: "/toxic-poster.jpg"
    });

    expect(payload.title).toBe(
      "Toxic: A Fairy Tale for Grown-ups is out today"
    );
    expect(payload.body).toContain("Tap to open");
    expect(payload.url).toBe("/movie/1213243");
    expect(payload.icon).toBe(payload.image);
    expect(payload.image).toContain("/toxic-poster.jpg");
    expect(payload.requireInteraction).toBe(true);
  });

  it("maps the stored series type to the canonical TV route", () => {
    expect(
      buildNotification({
        id: "r2",
        tmdb_id: "987",
        title_type: "series",
        title_name: "A Series",
        poster_path: null
      }).url
    ).toBe("/tv/987");
  });
});
