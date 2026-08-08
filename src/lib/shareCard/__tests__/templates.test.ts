// src/lib/shareCard/__tests__/templates.test.ts
//
// Unit tests for the share-card HTML templates (Phase 7 Task 6).
// These pin the structural invariants of the generated HTML so we
// can refactor the templates without breaking the server-side
// renderer (`/api/share-card`).

import { describe, it, expect } from "vitest";
import {
  renderShareCardHtml,
  type ShareCardPayload
} from "~/lib/shareCard/templates";

describe("renderShareCardHtml", () => {
  describe("stats template", () => {
    const statsPayload: ShareCardPayload = {
      template: "stats",
      displayName: "John Doe",
      avatarUrl: "https://example.com/avatar.jpg",
      title: "My Cinematic Stats",
      eyebrow: "My Cinematic Stats",
      rows: [
        { label: "Total Titles", value: "42" },
        { label: "Hours Watched", value: "120" }
      ],
      footer: "cinelog.app"
    };

    it("returns a complete HTML document", () => {
      const html = renderShareCardHtml(statsPayload);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
    });

    it("includes the display name", () => {
      const html = renderShareCardHtml(statsPayload);
      expect(html).toContain("John Doe");
    });

    it("includes each stat row label and value", () => {
      const html = renderShareCardHtml(statsPayload);
      expect(html).toContain("Total Titles");
      expect(html).toContain("42");
      expect(html).toContain("Hours Watched");
      expect(html).toContain("120");
    });

    it("renders an avatar <img> when avatarUrl is provided", () => {
      const html = renderShareCardHtml(statsPayload);
      expect(html).toContain(
        'src="https://example.com/avatar.jpg"'
      );
    });

    it("renders an avatar placeholder when avatarUrl is null", () => {
      const html = renderShareCardHtml({
        ...statsPayload,
        avatarUrl: null
      });
      // The placeholder shows the user's initial ("J" for "John Doe").
      expect(html).toContain("share-card-avatar-placeholder");
      expect(html).toContain(">J<");
    });

    it("escapes HTML in the display name (XSS safety)", () => {
      const html = renderShareCardHtml({
        ...statsPayload,
        displayName: '<script>alert("xss")</script>'
      });
      // The < and > must be escaped so the script tag doesn't execute
      // when Chromium renders the page.
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;");
    });

    it("includes the footer text", () => {
      const html = renderShareCardHtml(statsPayload);
      expect(html).toContain("cinelog.app");
    });

    it("renders an empty grid when rows is empty", () => {
      const html = renderShareCardHtml({
        ...statsPayload,
        rows: []
      });
      // The grid div should still exist, just empty.
      expect(html).toContain('class="share-card-grid"');
    });
  });

  describe("details template", () => {
    const detailsPayload: ShareCardPayload = {
      template: "details",
      displayName: "Jane Smith",
      title: "Inception",
      eyebrow: "Now Watching",
      details: {
        mediaType: "movie",
        year: "2010",
        rating: 9,
        status: "Completed",
        posterUrl: "https://image.tmdb.org/t/p/w342/abc.jpg",
        tagline: "Your mind is the scene of the crime.",
        genres: "Sci-Fi, Thriller"
      },
      footer: "cinelog.app"
    };

    it("returns a complete HTML document", () => {
      const html = renderShareCardHtml(detailsPayload);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
    });

    it("includes the title", () => {
      const html = renderShareCardHtml(detailsPayload);
      expect(html).toContain("Inception");
    });

    it("includes the year, status, and rating as meta pills", () => {
      const html = renderShareCardHtml(detailsPayload);
      expect(html).toContain("2010");
      expect(html).toContain("Completed");
      expect(html).toContain("★ 9/10");
    });

    it("includes the media type label ('Film' for movie)", () => {
      const html = renderShareCardHtml(detailsPayload);
      expect(html).toContain("Film");
    });

    it("includes the media type label ('TV' for tv)", () => {
      const html = renderShareCardHtml({
        ...detailsPayload,
        details: {
          ...detailsPayload.details!,
          mediaType: "tv"
        }
      });
      expect(html).toContain("TV");
    });

    it("includes the tagline", () => {
      const html = renderShareCardHtml(detailsPayload);
      expect(html).toContain("Your mind is the scene of the crime.");
    });

    it("includes the genres", () => {
      const html = renderShareCardHtml(detailsPayload);
      expect(html).toContain("Sci-Fi, Thriller");
    });

    it("renders a poster <img> when posterUrl is provided", () => {
      const html = renderShareCardHtml(detailsPayload);
      expect(html).toContain(
        'src="https://image.tmdb.org/t/p/w342/abc.jpg"'
      );
    });

    it("renders a poster placeholder when posterUrl is null", () => {
      const html = renderShareCardHtml({
        ...detailsPayload,
        details: {
          ...detailsPayload.details!,
          posterUrl: null
        }
      });
      // The placeholder div should exist.
      expect(html).toContain("share-card-poster-placeholder");
    });

    it("omits the rating pill when rating is null", () => {
      const html = renderShareCardHtml({
        ...detailsPayload,
        details: {
          ...detailsPayload.details!,
          rating: null
        }
      });
      // The rating pill is rendered as `<span class="share-card-meta-pill share-card-rating">`.
      // The CSS rule `.share-card-rating` is always in the <style> block,
      // so we test for the actual rendered pill (the `<span>` with the
      // rating class), not just the class name.
      expect(html).not.toContain("share-card-rating\">★");
      expect(html).not.toContain(">★");
      expect(html).not.toContain("/10</span>");
    });

    it("escapes HTML in the title (XSS safety)", () => {
      const html = renderShareCardHtml({
        ...detailsPayload,
        title: '<img src=x onerror="alert(1)">'
      });
      expect(html).not.toContain('<img src=x onerror="alert(1)">');
      expect(html).toContain("&lt;img");
    });

    it("falls back to stats template when details is missing", () => {
      // Defensive: if someone calls "details" without a details object,
      // we should still produce valid HTML (falling back to stats).
      const html = renderShareCardHtml({
        template: "details",
        displayName: "Test",
        title: "Test"
        // no `details` field
      });
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Test");
    });
  });
});
