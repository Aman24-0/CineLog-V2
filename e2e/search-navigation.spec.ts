import { expect, test, type Page } from "@playwright/test";

const movieResult = {
  id: 101,
  title: "Backrooms Film",
  overview:
    "A deterministic movie fixture for Search route regression coverage.",
  poster_path: null,
  backdrop_path: null,
  release_date: "2024-01-01",
  vote_average: 8.1,
  vote_count: 100,
  media_type: "movie"
};

const tvResult = {
  id: 202,
  name: "Backrooms Series",
  overview: "A deterministic TV fixture for Search route regression coverage.",
  poster_path: null,
  backdrop_path: null,
  first_air_date: "2023-01-01",
  vote_average: 7.9,
  vote_count: 100,
  media_type: "tv"
};

const searchResults = [
  movieResult,
  ...Array.from({ length: 10 }, (_, index) => ({
    ...movieResult,
    id: 110 + index,
    title: `Backrooms Film ${index + 2}`
  })),
  tvResult,
  ...Array.from({ length: 10 }, (_, index) => ({
    ...tvResult,
    id: 210 + index,
    name: `Backrooms Series ${index + 2}`
  }))
];

async function mockMediaApi(page: Page) {
  await page.route("**/api/media/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/search/multi")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          results: searchResults,
          total_results: searchResults.length
        })
      });
      return;
    }

    if (path.endsWith("/search/person")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ results: [] })
      });
      return;
    }

    if (/\/movie\/\d+$/.test(path)) {
      const id = Number(path.split("/").pop());
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...movieResult, id })
      });
      return;
    }

    if (path.endsWith("/tv/202")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(tvResult)
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ results: [] })
    });
  });
}

async function visiblePrimaryButton(page: Page, label: string) {
  return page.locator(`button[aria-label="${label}"]:visible`).first();
}

async function expectSearchSessionClearedAfterPrimaryNavigation(page: Page) {
  const searchButton = await visiblePrimaryButton(page, "Search");
  await searchButton.click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("searchbox")).toHaveValue("");
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 }
]) {
  test.describe(`Search navigation at ${viewport.width}x${viewport.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockMediaApi(page);
    });

    test("keeps Search route-owned and restores movie query/results on Back", async ({
      page
    }) => {
      await page.goto("/search?q=Backrooms");
      await expect(page.locator(".search-page-shell")).toBeVisible();
      await expect(page.locator(".search-overlay")).toHaveCount(0);
      await expect(page.getByRole("searchbox")).toHaveValue("Backrooms");
      await page.waitForTimeout(300);

      if (viewport.width >= 1024) {
        await page.locator("#main-content").evaluate((element) => {
          element.scrollTop = 480;
          element.dispatchEvent(new Event("scroll"));
        });
      } else {
        await page.mouse.move(300, 400);
        await page.mouse.wheel(0, 480);
      }
      await page.waitForTimeout(100);
      const scrollBefore = await page.evaluate(() => {
        const main = document.getElementById("main-content");
        return window.matchMedia("(min-width: 1024px)").matches && main
          ? main.scrollTop
          : window.scrollY;
      });
      expect(scrollBefore).toBeGreaterThan(0);
      const movieButton = page.getByRole("button", {
        name: /Backrooms Film 8, 2024 — open details/i
      });
      await expect(movieButton).toBeVisible();
      await movieButton.click();

      await expect(page).toHaveURL(/\/movie\/116$/);
      await expect(page.locator(".search-page-shell")).toHaveCount(0);
      await expect(page.locator(".search-overlay")).toHaveCount(0);

      await page.goBack();
      await page.waitForTimeout(200);
      await expect(page).toHaveURL(/\/search\?q=Backrooms$/);
      await expect(page.locator(".search-page-shell")).toBeVisible();
      await expect(page.locator(".search-overlay")).toHaveCount(0);
      await expect(page.getByRole("searchbox")).toHaveValue("Backrooms");
      await expect(movieButton).toBeVisible();

      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const main = document.getElementById("main-content");
              return window.matchMedia("(min-width: 1024px)").matches && main
                ? main.scrollTop
                : window.scrollY;
            }),
          { timeout: 2_000 }
        )
        .toBeGreaterThanOrEqual(scrollBefore - 40);
    });

    test("uses the canonical TV detail route and never renders Search on direct Detail", async ({
      page
    }) => {
      await page.goto("/search?q=Backrooms");
      const tvButton = page.getByRole("button", {
        name: /Backrooms Series, 2023 — open details/i
      });
      await expect(tvButton).toBeVisible();
      await tvButton.click();

      await expect(page).toHaveURL(/\/tv\/202$/);
      await expect(page.locator(".search-page-shell")).toHaveCount(0);
      await expect(page.locator(".search-overlay")).toHaveCount(0);

      await page.goto("/movie/101");
      await expect(page.locator(".search-page-shell")).toHaveCount(0);
      await expect(page.locator(".search-overlay")).toHaveCount(0);
    });

    test("clears the direct Search session when navigating to Library", async ({
      page
    }) => {
      await page.goto("/search?q=Backrooms");
      await expect(page.getByRole("searchbox")).toHaveValue("Backrooms");

      const libraryButton = await visiblePrimaryButton(page, "Library");
      await libraryButton.click();
      await expect(page).toHaveURL(/\/library$/);
      await expect(page.locator(".search-page-shell")).toHaveCount(0);
      await expect(page.locator(".search-overlay")).toHaveCount(0);

      await expectSearchSessionClearedAfterPrimaryNavigation(page);
    });

    test("browser Back after a primary departure returns a fresh Search session", async ({
      page
    }) => {
      await page.goto("/discover");
      const searchButton = await visiblePrimaryButton(page, "Search");
      await searchButton.click();
      await expect(page).toHaveURL(/\/search$/);

      const input = page.getByRole("searchbox");
      await input.fill("Backrooms");
      await input.press("Enter");
      await expect(input).toHaveValue("Backrooms");

      const libraryButton = await visiblePrimaryButton(page, "Library");
      await libraryButton.click();
      await expect(page).toHaveURL(/\/library$/);

      await page.goBack();
      await expect(page).toHaveURL(/\/search$/);
      await expect(page.getByRole("searchbox")).toHaveValue("");
    });

    test("clears a Search-origin detail session when Detail navigates to Library", async ({
      page
    }) => {
      test.skip(
        viewport.width < 1024,
        "Dedicated detail routes intentionally hide mobile primary navigation"
      );

      await page.goto("/search?q=Backrooms");
      const movieButton = page.getByRole("button", {
        name: /Backrooms Film, 2024 — open details/i
      });
      await expect(movieButton).toBeVisible();
      await movieButton.click();
      await expect(page).toHaveURL(/\/movie\/101$/);

      const libraryButton = await visiblePrimaryButton(page, "Library");
      await libraryButton.click();
      await expect(page).toHaveURL(/\/library$/);
      await expect(page.locator(".search-overlay")).toHaveCount(0);

      await expectSearchSessionClearedAfterPrimaryNavigation(page);
    });
  });
}
