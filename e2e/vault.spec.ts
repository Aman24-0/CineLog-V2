// e2e/vault.spec.ts
//
// E2E smoke tests for the Vault (Watchlist) page.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 8 CHUNK 4 — E2E TESTING
// ─────────────────────────────────────────────────────────────────────
// These tests verify the /watchlist route loads, the sticky header
// renders the expected controls (status tabs, filter button, search
// button), and basic interactions work. They do NOT verify actual
// vault items render — that requires a signed-in user with seeded
// data, which is out of scope for the default E2E suite.
//
// What we verify:
//   1. /watchlist loads without errors
//   2. The page title is set
//   3. The status tab list renders all 5 tabs (All / Watching / Planned / Completed / Dropped)
//   4. Clicking a status tab activates it (aria-selected toggles)
//   5. The filter button is visible and clickable
//   6. The search button expands the search input

import { test, expect } from "@playwright/test";

test.describe("Vault page — critical flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/watchlist");
  });

  test("page loads and renders the document title", async ({ page }) => {
    await expect(page).toHaveTitle(/watchlist/i);
  });

  test("status tab list renders all five tabs", async ({ page }) => {
    // The tablist is labeled "Filter watchlist by status".
    const tablist = page.locator(
      '[role="tablist"][aria-label="Filter watchlist by status"]'
    );
    await expect(tablist).toBeVisible();

    // All five status tabs should be rendered.
    const expectedTabs = ["All", "Watching", "Planned", "Completed", "Dropped"];
    for (const label of expectedTabs) {
      // Each tab is a button[role="tab"] containing a label span.
      const tab = page.locator(
        `button[role="tab"] >> text=${label}`
      );
      await expect(tab).toBeVisible();
    }
  });

  test("clicking a status tab activates it (aria-selected)", async ({
    page,
  }) => {
    // The "All" tab is active by default.
    const allTab = page.locator('button[role="tab"][data-value="all"]');
    await expect(allTab).toHaveAttribute("aria-selected", "true");

    // Click the "Watching" tab.
    const watchingTab = page.locator(
      'button[role="tab"][data-value="Watching"]'
    );
    await watchingTab.click();

    // "Watching" should now be active, "All" should be inactive.
    await expect(watchingTab).toHaveAttribute("aria-selected", "true");
    await expect(allTab).toHaveAttribute("aria-selected", "false");

    // Click back to "All".
    await allTab.click();
    await expect(allTab).toHaveAttribute("aria-selected", "true");
    await expect(watchingTab).toHaveAttribute("aria-selected", "false");
  });

  test("filter button is visible and clickable", async ({ page }) => {
    // The filter button has aria-label starting with "Filter".
    const filterButton = page.locator(
      'button[aria-label^="Filter"]'
    );
    await expect(filterButton).toBeVisible();
    await expect(filterButton).toBeEnabled();

    // Clicking it should open the filter drawer. The drawer is a
    // bottom sheet with a heading; we verify the sheet appears by
    // checking for the VaultFilters content. The simplest signal is
    // the appearance of a sheet-like container — we check for any
    // element with role="dialog" that becomes visible.
    await filterButton.click();

    // The filter sheet should appear. We give it a generous timeout
    // because the sheet animates in.
    await expect(
      page.locator('[role="dialog"], .sheet-glass-surface, .sheet-content')
        .first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("search button expands the inline search input", async ({ page }) => {
    // The search button has aria-label "Search watchlist".
    const searchButton = page.locator(
      'button[aria-label="Search watchlist"]'
    );
    await expect(searchButton).toBeVisible();

    // Click it to expand the search input.
    await searchButton.click();

    // An input with a "Clear search" companion button should appear.
    // We verify by looking for the clear button's aria-label, which
    // only renders when the search is expanded.
    await expect(
      page.locator('button[aria-label="Clear search and filters"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test("view mode toggle is present (Grid / Timeline)", async ({ page }) => {
    // The view-toggle container has role="group" and aria-label="View mode".
    const viewToggleGroup = page.locator(
      '[role="group"][aria-label="View mode"]'
    );
    await expect(viewToggleGroup).toBeVisible();

    // Both Grid and Timeline buttons should be present.
    await expect(
      page.locator('button[aria-label="Grid view"]')
    ).toBeVisible();
    await expect(
      page.locator('button[aria-label="Timeline view"]')
    ).toBeVisible();
  });
});
