// scripts/verify-search-sticky-desktop.ts
//
// Companion to verify-search-sticky.ts — verifies the same behavior at
// DESKTOP viewports (1280x800, 1440x900) where #main-content is the
// scroll container (overflow-y: auto; height: calc(100vh - header)).
//
// Usage:
//   npx tsx scripts/verify-search-sticky-desktop.ts
//
// Requires dev server on http://localhost:3000.

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const VIEWPORTS: Array<{ name: string; width: number; height: number }> = [
  { name: "Desktop 1280x800", width: 1280, height: 800 },
  { name: "Desktop 1440x900", width: 1440, height: 900 }
];

interface DesktopResult {
  viewport: string;
  initial: { titleVisible: boolean; inputVisible: boolean; inputTop: number };
  afterScroll: {
    titleTop: number;
    stickyBarTop: number;
    inputTop: number;
    inputVisible: boolean;
  };
  scrollContainer: string;
  stickyBg: string;
  stickyBgAlpha: number;
  horizontalOverflow: boolean;
  passed: boolean;
  failures: string[];
}

async function checkDesktop(
  viewport: { width: number; height: number }
): Promise<DesktopResult> {
  const failures: string[] = [];
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  // Mock the search API to return 30 dummy results so the page has enough
  // content for #main-content to actually scroll. Without auth (no Supabase
  // session in the test environment), the trending list shows "Loading…"
  // and the page is too short for #main-content to scroll. By mocking the
  // search API and navigating to /search?q=test, we trigger SearchResults
  // rendering with 30 rows (~2600px content), which is enough to make
  // #main-content scroll on 1280x800 / 1440x900 viewports.
  await page.route("**/api/media/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/search/multi")) {
      const fakeResults = Array.from({ length: 30 }, (_, i) => ({
        id: 100 + i,
        title: `Test Movie ${i + 1}`,
        overview: "Test overview",
        poster_path: null,
        backdrop_path: null,
        release_date: "2024-01-01",
        vote_average: 7.5,
        vote_count: 100,
        media_type: "movie"
      }));
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          results: fakeResults,
          total_results: fakeResults.length
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
    await route.continue();
  });

  // Navigate to /search with a query so SearchResults renders.
  await page.goto(`${BASE_URL}/search?q=test`, { waitUntil: "networkidle" });
  await page.waitForSelector(".search-page-shell", { timeout: 10_000 });
  // Wait for search results to render (mocked, should be fast).
  await page.waitForSelector(".search-results-list .search-result-row", {
    timeout: 10_000
  });
  await page.waitForTimeout(500);

  const title = page.locator(".search-page-title").first();
  const input = page.getByRole("searchbox").first();
  const stickyBar = page.locator(".search-page-sticky-bar").first();
  const mainContent = page.locator("#main-content").first();

  const initial = {
    titleVisible: await title.isVisible().catch(() => false),
    inputVisible: await input.isVisible().catch(() => false),
    inputTop: (await input.boundingBox())?.y ?? -1
  };

  if (!initial.titleVisible) failures.push("Title not visible initially");
  if (!initial.inputVisible) failures.push("Input not visible initially");

  // Diagnostics
  const diag = await page.evaluate(() => {
    const sticky = document.querySelector(".search-page-sticky-bar") as HTMLElement | null;
    if (!sticky) return { bg: "NOT_FOUND", alpha: -1, scrollContainer: "NOT_FOUND" };
    const cs = window.getComputedStyle(sticky);
    const bg = cs.backgroundColor;
    let alpha = 1;
    const m = bg.match(/rgba?\(([^)]+)\)/);
    if (m && m[1]) {
      const parts = m[1].split(",").map((p) => p.trim());
      if (parts.length === 4) alpha = parseFloat(parts[3]!);
    }
    // Find nearest scroll container — should be #main-content on desktop.
    let ancestor: HTMLElement | null = sticky.parentElement;
    let scrollAncestor = "none";
    while (ancestor) {
      const cs2 = window.getComputedStyle(ancestor);
      const oy = cs2.overflowY;
      const ox = cs2.overflowX;
      if (
        oy === "auto" ||
        oy === "scroll" ||
        oy === "hidden" ||
        ox === "auto" ||
        ox === "scroll" ||
        ox === "hidden"
      ) {
        scrollAncestor = `${ancestor.tagName}#${ancestor.id || "(no-id)"} (overflow-y:${oy}, overflow-x:${ox})`;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    return { bg, alpha, scrollContainer: scrollAncestor };
  });

  // On desktop, the scroll container is #main-content. Scroll it.
  await mainContent.evaluate((el) => {
    el.scrollTop = 600;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(500);

  const titleTop = (await title.boundingBox())?.y ?? 9999;
  const stickyBarTop = (await stickyBar.boundingBox())?.y ?? 9999;
  const inputTop = (await input.boundingBox())?.y ?? -1;
  const inputVisible = await input.isVisible().catch(() => false);

  if (titleTop > -10) {
    failures.push(`Title still at y=${titleTop} after scroll (should be negative)`);
  }
  if (stickyBarTop > 5 || stickyBarTop < -5) {
    failures.push(`Sticky bar at y=${stickyBarTop} after scroll (expected ≈0)`);
  }
  if (!inputVisible) {
    failures.push("Input not visible after scroll");
  }
  if (inputTop > 80) {
    failures.push(`Input at y=${inputTop} after scroll (expected near sticky bar top)`);
  }
  if (diag.alpha >= 0.8) {
    failures.push(`Sticky bg alpha ${diag.alpha} — too opaque (dark block)`);
  }

  const horizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  });
  if (horizontalOverflow) failures.push("Horizontal overflow detected");

  await browser.close();

  return {
    viewport: `${viewport.width}x${viewport.height}`,
    initial,
    afterScroll: { titleTop, stickyBarTop, inputTop, inputVisible },
    scrollContainer: diag.scrollContainer,
    stickyBg: diag.bg,
    stickyBgAlpha: diag.alpha,
    horizontalOverflow,
    passed: failures.length === 0,
    failures
  };
}

async function main() {
  console.log(`Verifying ${BASE_URL}/search at desktop viewports…\n`);
  const results: DesktopResult[] = [];
  for (const vp of VIEWPORTS) {
    process.stdout.write(`  → ${vp.name}…`);
    try {
      const r = await checkDesktop(vp);
      results.push(r);
      console.log(` ${r.passed ? "PASS" : "FAIL"}`);
    } catch (err) {
      console.log(` ERROR: ${(err as Error).message}`);
      results.push({
        viewport: `${vp.width}x${vp.height}`,
        initial: { titleVisible: false, inputVisible: false, inputTop: -1 },
        afterScroll: { titleTop: -1, stickyBarTop: -1, inputTop: -1, inputVisible: false },
        scrollContainer: "ERROR",
        stickyBg: "ERROR",
        stickyBgAlpha: -1,
        horizontalOverflow: false,
        passed: false,
        failures: [(err as Error).message]
      });
    }
  }

  console.log("");
  console.log("── Detailed results ──");
  for (const r of results) {
    console.log(`\n[${r.viewport}] ${r.passed ? "PASS" : "FAIL"}`);
    console.log(`  Initial:  title=${r.initial.titleVisible} input=${r.initial.inputVisible} inputTop=${r.initial.inputTop}`);
    console.log(`  After scroll:  titleTop=${r.afterScroll.titleTop} stickyBarTop=${r.afterScroll.stickyBarTop} inputTop=${r.afterScroll.inputTop} input=${r.afterScroll.inputVisible}`);
    console.log(`  Scroll container: ${r.scrollContainer}`);
    console.log(`  Sticky bg: ${r.stickyBg} (alpha=${r.stickyBgAlpha})`);
    console.log(`  Horizontal overflow: ${r.horizontalOverflow}`);
    if (r.failures.length > 0) {
      console.log("  FAILURES:");
      for (const f of r.failures) console.log(`    - ${f}`);
    }
  }

  const allPass = results.every((r) => r.passed);
  console.log(`\n── OVERALL: ${allPass ? "PASS (browser verified)" : "FAIL"} ──`);
  process.exit(allPass ? 0 : 1);
}

void main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
