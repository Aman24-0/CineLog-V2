// e2e/discover.spec.ts
//
// E2E smoke tests for the Discover page.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 8 CHUNK 4 — E2E TESTING
// ─────────────────────────────────────────────────────────────────────
// These tests verify the /discover route loads (it's the default
// landing page after the root redirect), the primary sections render,
// and basic interactions work. They do NOT verify actual TMDB data
// loads — that depends on the TMDB API key being configured and is
// out of scope for the default E2E suite.
//
// What we verify:
//   1. Root path "/" redirects to /discover
//   2. /discover loads without errors
//   3. The Spotlight section renders (or shows a loading/error fallback)
//   4. The Genre Explorer section renders
//   5. The ambient glow decorative element is present
//   6. The page-enter animation class is applied (visual sanity)
//   7. The app header is present with the CineLog wordmark

import { test, expect } from "@playwright/test";

test.describe("Discover page — critical flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/discover");
  });

  test("page loads and renders the document title", async ({ page }) => {
    await expect(page).toHaveTitle(/discover/i);
  });

  test("root path redirects to /discover", async ({ page }) => {
    // Navigate to the root — should redirect to /discover.
    await page.goto("/");
    await expect(page).toHaveURL(/\/discover/);
  });

  test("app header with CineLog wordmark is present", async ({ page }) => {
    // The wordmark is an h1 with aria-label="CineLog".
    const wordmark = page.locator('h1[aria-label="CineLog"]');
    await expect(wordmark).toBeVisible();
  });

  test("ambient glow decorative element is rendered", async ({ page }) => {
    // The ambient-glow div is a fixed-position decorative element.
    await expect(page.locator(".ambient-glow").first()).toBeAttached();
  });

  test("page-enter animation class is applied to the main content", async ({
    page,
  }) => {
    // The discover folds container has the page-enter class for the
    // subtle fade-in animation on route change.
    await expect(page.locator(".page-enter").first()).toBeVisible();
  });

  test("Spotlight section renders (or shows a fallback)", async ({ page }) => {
    // The Spotlight section has aria-label starting with "Spotlight".
    // It may show "Spotlight — one title picked for you" (success) or
    // "Spotlight — unavailable" (error/empty). Either is acceptable —
    // we just verify the section exists.
    await expect(
      page.locator('section[aria-label^="Spotlight"]').first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Genre Explorer section renders", async ({ page }) => {
    // The Genre Explorer section has aria-label="Genre Explorer".
    await expect(
      page.locator('section[aria-label="Genre Explorer"]')
    ).toBeVisible({ timeout: 15_000 });
  });

  test("at least one discover-fold section is present", async ({ page }) => {
    // The discover-fold class is the canonical section wrapper.
    // At least one should be present (Spotlight, Genre Explorer, etc.).
    await expect(page.locator("section.discover-fold").first()).toBeVisible();
  });

  test("bottom navigation is present on mobile viewport", async ({
    page,
  }) => {
    // The bottom-nav-glass element is the floating glass pill nav.
    // It's always rendered in the DOM (visibility is CSS-controlled).
    await expect(page.locator(".bottom-nav-glass")).toBeAttached();
  });

  test("search input in header is focusable on desktop", async ({ page }) => {
    // The desktop search input has aria-label "Search movies, series, and anime".
    // It's hidden on mobile but visible on desktop (default viewport).
    const searchInput = page.locator(
      'input[aria-label="Search movies, series, and anime"]'
    );
    await expect(searchInput).toBeVisible();
    await searchInput.click();
    await expect(searchInput).toBeFocused();
  });
});
