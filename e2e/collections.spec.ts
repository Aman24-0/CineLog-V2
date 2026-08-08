// e2e/collections.spec.ts
//
// E2E smoke tests for the Collections page.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 8 CHUNK 4 — E2E TESTING
// ─────────────────────────────────────────────────────────────────────
// These tests verify the /collections route loads, the page title
// renders, and the primary action buttons (New collection, Smart
// collection) are present and clickable. They do NOT verify actual
// collection creation — that requires a signed-in user, which is
// out of scope for the default E2E suite.
//
// What we verify:
//   1. /collections loads without errors
//   2. The page title "Your Cinematic Universe" renders
//   3. The "Create new collection" button is present
//   4. The "Create smart collection" button is present
//   5. The "Your Collections" section header is visible
//   6. The page has an ambient glow decorative element (visual sanity)

import { test, expect } from "@playwright/test";

test.describe("Collections page — critical flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/collections");
  });

  test("page loads and renders the document title", async ({ page }) => {
    await expect(page).toHaveTitle(/collections/i);
  });

  test("page heading 'Your Cinematic Universe' is visible", async ({
    page,
  }) => {
    // The page renders an h1 with class collections-page-title.
    const heading = page.locator(".collections-page-title");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText(/your cinematic universe/i);
  });

  test("page subtitle describes the collections feature", async ({ page }) => {
    // The subtitle should mention organizing titles.
    const subtitle = page.locator(".collections-page-subtitle").first();
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText(/organize/i);
  });

  test("'Your Collections' section header is visible", async ({ page }) => {
    // The "Your Collections" label sits in the collections-fold-label.
    const sectionHeader = page.locator(".collections-fold-label", {
      hasText: "Your Collections",
    });
    await expect(sectionHeader).toBeVisible();
  });

  test("'Create new collection' button is present", async ({ page }) => {
    const newButton = page.locator(
      'button[aria-label="Create new collection"]'
    );
    await expect(newButton).toBeVisible();
    await expect(newButton).toBeEnabled();
  });

  test("'Create smart collection' button is present", async ({ page }) => {
    const smartButton = page.locator(
      'button[aria-label="Create smart collection"]'
    );
    await expect(smartButton).toBeVisible();
    await expect(smartButton).toBeEnabled();
  });

  test("clicking 'Create new collection' opens the create modal", async ({
    page,
  }) => {
    await page.locator('button[aria-label="Create new collection"]').click();

    // A modal should appear. We verify by looking for a GlassModal-like
    // surface (the modal-glass-surface class is the canonical signal).
    await expect(
      page.locator(".modal-glass-surface, .sheet-glass-surface, [role=\"dialog\"]")
        .first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("ambient glow decorative element is rendered", async ({ page }) => {
    // The ambient-glow div is a fixed-position decorative element.
    // Its presence is a visual sanity check that the page chrome loaded.
    await expect(page.locator(".ambient-glow").first()).toBeAttached();
  });
});
