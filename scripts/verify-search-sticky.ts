// scripts/verify-search-sticky.ts
//
// Standalone Playwright verification for the dedicated /search route's
// sticky search bar at Android mobile viewports.
//
// Usage:
//   npx tsx scripts/verify-search-sticky.ts
//
// Requires the dev server to be running on http://localhost:3000
// (start with `npm run dev` in a separate terminal).
//
// What this script verifies (matches the user's TASK 9 acceptance criteria):
//   1. /search loads
//   2. Search title + input are visible at top
//   3. After scrolling down substantially:
//      - Search title is NO LONGER visible (scrolled away)
//      - Search input is STILL visible at the top
//      - Sticky surface background is translucent (NOT a dark/black block)
//      - No horizontal overflow
//   4. Bottom navigation is still visible & clickable
//   5. Scroll back to top → no layout corruption, title reappears
//
// Viewports tested:
//   - 360x800  (Android small)
//   - 390x844  (iPhone 12/13/14 — Chromium engine, similar to Android Chrome)
//   - 412x915  (Android large / Pixel 6+)
//
// The dev server must be running. We launch a single Chromium browser
// context, set the viewport, navigate to /search, and run the test
// sequence. We do NOT use the @playwright/test runner — this is a
// standalone script so we can print verbose diagnostics.

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const VIEWPORTS: Array<{ name: string; width: number; height: number }> = [
  { name: "Android 360x800", width: 360, height: 800 },
  { name: "iPhone 390x844", width: 390, height: 844 },
  { name: "Android 412x915", width: 412, height: 915 }
];

interface ViewportResult {
  viewport: string;
  searchTitleInitiallyVisible: boolean;
  searchInputInitiallyVisible: boolean;
  searchInputTopBeforeScroll: number;
  searchInputTopAfterScroll: number;
  searchTitleTopAfterScroll: number;
  searchInputVisibleAfterScroll: boolean;
  stickyBarBgColor: string;
  stickyBarBgAlpha: number;
  hasHorizontalOverflow: boolean;
  bottomNavVisible: boolean;
  searchTitleTopAfterScrollBack: number;
  searchInputVisibleAfterScrollBack: boolean;
  stickyBarComputedOverflowX: string;
  appShellBgOverflowX: string;
  appShellBgComputedOverflowY: string;
  nearestScrollContainerTag: string;
  stickyPosition: string;
  stickyTop: string;
  stickyZIndex: string;
  pageScrollY: number;
  pageScrollHeight: number;
  stickyBarTopAfterScroll: number;
  passed: boolean;
  failures: string[];
}

async function checkViewport(): Promise<ViewportResult> {
  const failures: string[] = [];

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: VIEWPORTS[0]!.width, height: VIEWPORTS[0]!.height }
  });
  // We'll re-set viewport per test below.
  const page = await context.newPage();

  const vp = VIEWPORTS[0]!;
  await page.setViewportSize({ width: vp.width, height: vp.height });

  // Navigate to /search. The route may redirect to /discover if not
  // signed in, but for CineLog dev the user is typically already
  // authenticated in localStorage. If not, we just inspect whatever
  // loads at /search.
  await page.goto(`${BASE_URL}/search`, { waitUntil: "networkidle" });

  // Wait for the search-page-shell to mount.
  await page.waitForSelector(".search-page-shell", { timeout: 10_000 });

  // Step 1: confirm Search title and input are visible.
  const titleLocator = page.locator(".search-page-title").first();
  const inputLocator = page.getByRole("searchbox").first();
  const searchTitleInitiallyVisible = await titleLocator.isVisible().catch(() => false);
  const searchInputInitiallyVisible = await inputLocator.isVisible().catch(() => false);

  if (!searchTitleInitiallyVisible) failures.push("Search title not visible at top on initial load");
  if (!searchInputInitiallyVisible) failures.push("Search input not visible at top on initial load");

  // Record initial position of the input.
  const inputBoxBefore = await inputLocator.boundingBox();
  const searchInputTopBeforeScroll = inputBoxBefore?.y ?? -1;

  // Inspect the sticky bar's computed styles for diagnostics.
  const diagnostics = await page.evaluate(() => {
    const stickyBar = document.querySelector(".search-page-sticky-bar") as HTMLElement | null;
    if (!stickyBar) {
      return {
        stickyBarBgColor: "NOT_FOUND",
        stickyBarBgAlpha: -1,
        stickyPosition: "NOT_FOUND",
        stickyTop: "NOT_FOUND",
        stickyZIndex: "NOT_FOUND",
        stickyBarComputedOverflowX: "NOT_FOUND",
        appShellBgOverflowX: "NOT_FOUND",
        appShellBgComputedOverflowY: "NOT_FOUND",
        nearestScrollContainerTag: "NOT_FOUND"
      };
    }
    const cs = window.getComputedStyle(stickyBar);
    const bg = cs.backgroundColor;
    // Parse rgba(r, g, b, a) or rgb(r, g, b)
    let alpha = 1;
    const rgbaMatch = bg.match(/rgba?\(([^)]+)\)/);
    if (rgbaMatch) {
      const parts = rgbaMatch[1]!.split(",").map((p) => p.trim());
      if (parts.length === 4) alpha = parseFloat(parts[3]!);
    }

    // Find the nearest scroll-container ancestor of the sticky bar.
    let ancestor: HTMLElement | null = stickyBar.parentElement;
    let scrollAncestor: string = "none";
    while (ancestor) {
      const cs2 = window.getComputedStyle(ancestor);
      const oy = cs2.overflowY;
      const ox = cs2.overflowX;
      // A scroll container has overflow-y: auto, scroll, OR hidden
      // (hidden computes to auto when overflow-x is not visible).
      if (
        oy === "auto" ||
        oy === "scroll" ||
        oy === "hidden" ||
        ox === "auto" ||
        ox === "scroll" ||
        ox === "hidden"
      ) {
        scrollAncestor = `${ancestor.tagName}#${ancestor.id}.${ancestor.className.split(" ")[0] ?? ""} (overflow-y:${oy}, overflow-x:${ox})`;
        break;
      }
      ancestor = ancestor.parentElement;
    }

    const appShell = document.querySelector(".app-shell-bg") as HTMLElement | null;
    const appShellCs = appShell ? window.getComputedStyle(appShell) : null;

    return {
      stickyBarBgColor: bg,
      stickyBarBgAlpha: alpha,
      stickyPosition: cs.position,
      stickyTop: cs.top,
      stickyZIndex: cs.zIndex,
      stickyBarComputedOverflowX: cs.overflowX,
      appShellBgOverflowX: appShellCs?.overflowX ?? "NOT_FOUND",
      appShellBgComputedOverflowY: appShellCs?.overflowY ?? "NOT_FOUND",
      nearestScrollContainerTag: scrollAncestor
    };
  });

  // Step 2: scroll down substantially (3x viewport height).
  await page.evaluate(() => {
    window.scrollTo(0, window.innerHeight * 3);
  });
  // Wait a tick for sticky to engage + any repainting.
  await page.waitForTimeout(500);

  // Step 3: confirm Search title is gone and input is still visible.
  // We use boundingBox().y instead of isVisible() because Playwright's
  // isVisible() only checks if the element has a non-empty bounding box
  // and is not display:none — it does NOT check viewport intersection.
  // A title scrolled above the viewport (y < 0) still "isVisible()"=true.
  const titleBoxAfter = await titleLocator.boundingBox();
  const searchTitleTopAfterScroll = titleBoxAfter?.y ?? 9999;
  const searchInputVisibleAfterScroll = await inputLocator.isVisible().catch(() => false);

  if (searchTitleTopAfterScroll > -10) {
    failures.push(
      `Search title still at y=${searchTitleTopAfterScroll} after scroll (should be negative — scrolled away)`
    );
  }
  if (!searchInputVisibleAfterScroll) {
    failures.push("Search input NOT visible after scrolling (sticky failed)");
  }

  // Confirm the input is anchored to the top of the viewport (allow some tolerance).
  const inputBoxAfter = await inputLocator.boundingBox();
  const searchInputTopAfterScroll = inputBoxAfter?.y ?? -1;
  if (searchInputTopAfterScroll > 80) {
    failures.push(
      `Search input top is at y=${searchInputTopAfterScroll} after scroll (expected near 0; sticky not engaging)`
    );
  }

  // Also check the sticky bar's actual position for diagnostic clarity.
  const stickyBarBoxAfter = await page
    .locator(".search-page-sticky-bar")
    .first()
    .boundingBox();
  const stickyBarTopAfterScroll = stickyBarBoxAfter?.y ?? 9999;
  // If sticky is engaging, the sticky bar's top should be at 0 (or very close,
  // within a few pixels for subpixel rendering). If sticky is NOT engaging,
  // the sticky bar's top would be negative (it scrolled away with the page).
  // We allow up to 5px tolerance for subpixel rendering.
  if (stickyBarTopAfterScroll > 5 || stickyBarTopAfterScroll < -5) {
    failures.push(
      `Sticky bar top is at y=${stickyBarTopAfterScroll} after scroll (expected ≈0 — sticky not engaging)`
    );
  }

  // Capture scroll position for diagnostics.
  const scrollInfo = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight
  }));

  // Step 4: check the sticky bar's background — should NOT be a dark block.
  // We consider "dark block" as a background with alpha >= 0.7 AND a dark color.
  // The new design uses var(--glass-bg) = 0.56 alpha.
  if (diagnostics.stickyBarBgAlpha >= 0.8) {
    failures.push(
      `Sticky bar background alpha is ${diagnostics.stickyBarBgAlpha} (color ${diagnostics.stickyBarBgColor}) — looks like an opaque dark block, expected translucent glass (alpha ~0.56)`
    );
  }

  // Step 5: check horizontal overflow.
  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  });
  if (hasHorizontalOverflow) {
    failures.push("Page has horizontal overflow (scroll bar appears)");
  }

  // Step 6: check bottom navigation.
  const bottomNavVisible = await page
    .locator(".bottom-nav-glass")
    .first()
    .isVisible()
    .catch(() => false);
  if (!bottomNavVisible) {
    failures.push("Bottom navigation not visible after scroll");
  }

  // Step 7: scroll back to top.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);

  const titleBoxBack = await titleLocator.boundingBox();
  const searchTitleTopAfterScrollBack = titleBoxBack?.y ?? 9999;
  const searchInputVisibleAfterScrollBack = await inputLocator.isVisible().catch(() => false);

  if (searchTitleTopAfterScrollBack > 100) {
    failures.push(
      `Search title at y=${searchTitleTopAfterScrollBack} after scrolling back to top (should be near initial position ~95)`
    );
  }
  if (!searchInputVisibleAfterScrollBack) {
    failures.push("Search input not visible after scrolling back to top");
  }

  await browser.close();

  return {
    viewport: `${vp.width}x${vp.height}`,
    searchTitleInitiallyVisible,
    searchInputInitiallyVisible,
    searchInputTopBeforeScroll,
    searchInputTopAfterScroll,
    searchTitleTopAfterScroll,
    searchInputVisibleAfterScroll,
    stickyBarBgColor: diagnostics.stickyBarBgColor,
    stickyBarBgAlpha: diagnostics.stickyBarBgAlpha,
    hasHorizontalOverflow,
    bottomNavVisible,
    searchTitleTopAfterScrollBack,
    searchInputVisibleAfterScrollBack,
    stickyBarComputedOverflowX: diagnostics.stickyBarComputedOverflowX,
    appShellBgOverflowX: diagnostics.appShellBgOverflowX,
    appShellBgComputedOverflowY: diagnostics.appShellBgComputedOverflowY,
    nearestScrollContainerTag: diagnostics.nearestScrollContainerTag,
    stickyPosition: diagnostics.stickyPosition,
    stickyTop: diagnostics.stickyTop,
    stickyZIndex: diagnostics.stickyZIndex,
    pageScrollY: scrollInfo.scrollY,
    pageScrollHeight: scrollInfo.scrollHeight,
    stickyBarTopAfterScroll,
    passed: failures.length === 0,
    failures
  };
}

async function main() {
  console.log(`Verifying ${BASE_URL}/search at ${VIEWPORTS.length} mobile viewports…\n`);

  const results: ViewportResult[] = [];
  for (const vp of VIEWPORTS) {
    // We re-run checkViewport per viewport — but checkViewport hardcodes
    // VIEWPORTS[0]. Override by temporarily replacing VIEWPORTS[0].
    const original = VIEWPORTS[0]!;
    VIEWPORTS[0] = vp;
    process.stdout.write(`  → ${vp.name}…`);
    try {
      const result = await checkViewport();
      results.push(result);
      console.log(` ${result.passed ? "PASS" : "FAIL"}`);
    } catch (err) {
      console.log(` ERROR: ${(err as Error).message}`);
      results.push({
        viewport: `${vp.width}x${vp.height}`,
        searchTitleInitiallyVisible: false,
        searchInputInitiallyVisible: false,
        searchInputTopBeforeScroll: -1,
        searchInputTopAfterScroll: -1,
        searchTitleTopAfterScroll: -1,
        searchInputVisibleAfterScroll: false,
        stickyBarBgColor: "ERROR",
        stickyBarBgAlpha: -1,
        hasHorizontalOverflow: false,
        bottomNavVisible: false,
        searchTitleTopAfterScrollBack: -1,
        searchInputVisibleAfterScrollBack: false,
        stickyBarComputedOverflowX: "ERROR",
        appShellBgOverflowX: "ERROR",
        appShellBgComputedOverflowY: "ERROR",
        nearestScrollContainerTag: "ERROR",
        stickyPosition: "ERROR",
        stickyTop: "ERROR",
        stickyZIndex: "ERROR",
        pageScrollY: -1,
        pageScrollHeight: -1,
        stickyBarTopAfterScroll: -1,
        passed: false,
        failures: [(err as Error).message]
      });
    }
    VIEWPORTS[0] = original;
  }

  console.log("");
  console.log("── Detailed results ──");
  for (const r of results) {
    console.log(`\n[${r.viewport}] ${r.passed ? "PASS" : "FAIL"}`);
    console.log(`  Initial:  title=${r.searchTitleInitiallyVisible} input=${r.searchInputInitiallyVisible}`);
    console.log(`  Input top before scroll: ${r.searchInputTopBeforeScroll}`);
    console.log(`  Page scrollY after 3x: ${r.pageScrollY}  (page scrollHeight: ${r.pageScrollHeight})`);
    console.log(`  After 3x scroll:  input=${r.searchInputVisibleAfterScroll}`);
    console.log(`  Title top after scroll:  ${r.searchTitleTopAfterScroll}  (should be negative — scrolled away)`);
    console.log(`  Sticky bar top after scroll: ${r.stickyBarTopAfterScroll}  (should be near 0)`);
    console.log(`  Input top after scroll:  ${r.searchInputTopAfterScroll}  (should be near sticky bar top)`);
    console.log(`  Sticky bar bg: ${r.stickyBarBgColor}  (alpha=${r.stickyBarBgAlpha})`);
    console.log(`  Sticky position: ${r.stickyPosition} top=${r.stickyTop} z=${r.stickyZIndex}`);
    console.log(`  .app-shell-bg overflow-x: ${r.appShellBgOverflowX} (computed overflow-y: ${r.appShellBgComputedOverflowY})`);
    console.log(`  Nearest scroll-container ancestor: ${r.nearestScrollContainerTag}`);
    console.log(`  Horizontal overflow: ${r.hasHorizontalOverflow}`);
    console.log(`  Bottom nav visible: ${r.bottomNavVisible}`);
    console.log(`  Scroll back:  title top=${r.searchTitleTopAfterScrollBack} input=${r.searchInputVisibleAfterScrollBack}`);
    if (r.failures.length > 0) {
      console.log(`  FAILURES:`);
      for (const f of r.failures) console.log(`    - ${f}`);
    }
  }

  const allPass = results.every((r) => r.passed);
  console.log(`\n── OVERALL: ${allPass ? "PASS (browser verified)" : "FAIL"} ──`);
  process.exit(allPass ? 0 : 1);
}

void main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
