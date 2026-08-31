// scripts/verify-library-scroll.ts
//
// Browser verification for the 2026-09-03 Library scroll fix + Search
// sticky preservation.
//
// Verifies:
//   1. /library — the .library-header-glass element does NOT have
//      position: sticky applied (either via Tailwind utility classes
//      or computed style). When the user scrolls, the header scrolls
//      away with the page.
//   2. /search — the .search-page-sticky-bar element DOES have
//      position: sticky applied (computed style). When the user
//      scrolls, the search bar stays at the top.
//   3. /library — after scrolling, the header's bounding rect top
//      is NEGATIVE (it has scrolled above the viewport). This is the
//      behavioral proof that the header is NOT sticky.
//   4. /search — after scrolling, the sticky bar's bounding rect top
//      is ~0 (it has stayed at the top of the viewport).
//
// Mobile viewport (390x844) is used for both tests.

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

interface ViewportResult {
  route: string;
  headerClass: string;
  headerComputedPosition: string;
  headerTopBeforeScroll: number;
  headerTopAfterScroll: number;
  isSticky: boolean;
  passed: boolean;
  failures: string[];
}

async function checkRoute(
  route: string,
  selector: string,
  expectSticky: boolean
): Promise<ViewportResult> {
  const failures: string[] = [];
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Find the header element.
  const header = await page.locator(selector).first();
  const headerExists = await header.isVisible().catch(() => false);

  if (!headerExists) {
    failures.push(
      `${selector} not visible on ${route} — cannot verify sticky behavior`
    );
    await browser.close();
    return {
      route,
      headerClass: "NOT_FOUND",
      headerComputedPosition: "NOT_FOUND",
      headerTopBeforeScroll: 9999,
      headerTopAfterScroll: 9999,
      isSticky: false,
      passed: false,
      failures
    };
  }

  // Get the header's class list + computed position.
  const headerInfo = await header.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      className: el.className,
      position: cs.position
    };
  });

  const boxBefore = await header.boundingBox();
  const headerTopBeforeScroll = boxBefore?.y ?? 9999;

  // Scroll down by 500px.
  await page.evaluate(() => {
    window.scrollTo(0, 500);
  });
  await page.waitForTimeout(500);

  const boxAfter = await header.boundingBox();
  const headerTopAfterScroll = boxAfter?.y ?? 9999;

  // If the header is sticky, its top after scroll should be ~0 (it
  // stays at the viewport top). If it's NOT sticky, its top should be
  // negative (it scrolled above the viewport).
  const isSticky =
    headerTopAfterScroll > -5 && headerTopAfterScroll < 30;

  if (expectSticky && !isSticky) {
    failures.push(
      `${route} ${selector}: expected sticky but header scrolled away (top after scroll: ${headerTopAfterScroll}, expected ~0)`
    );
  }
  if (!expectSticky && isSticky) {
    failures.push(
      `${route} ${selector}: expected NOT sticky but header stayed at top (top after scroll: ${headerTopAfterScroll}, expected negative)`
    );
  }

  // Also verify the computed position.
  if (expectSticky && headerInfo.position !== "sticky") {
    failures.push(
      `${route} ${selector}: computed position is "${headerInfo.position}", expected "sticky"`
    );
  }
  if (!expectSticky && headerInfo.position === "sticky") {
    failures.push(
      `${route} ${selector}: computed position is "sticky", expected something else (static/relative/absolute)`
    );
  }

  await browser.close();

  return {
    route,
    headerClass: headerInfo.className,
    headerComputedPosition: headerInfo.position,
    headerTopBeforeScroll,
    headerTopAfterScroll,
    isSticky,
    passed: failures.length === 0,
    failures
  };
}

async function main() {
  console.log(`Verifying Library scroll + Search sticky at ${BASE_URL}…\n`);

  const libraryResult = await checkRoute(
    "/library",
    ".library-header-glass",
    false // Library header should NOT be sticky
  );

  const searchResult = await checkRoute(
    "/search",
    ".search-page-sticky-bar",
    true // Search bar SHOULD be sticky
  );

  console.log("── Library /library ──");
  console.log(`  ${libraryResult.passed ? "PASS" : "FAIL"} (expected NOT sticky)`);
  console.log(`    header class: ${libraryResult.headerClass}`);
  console.log(`    computed position: ${libraryResult.headerComputedPosition}`);
  console.log(`    top before scroll: ${libraryResult.headerTopBeforeScroll}`);
  console.log(`    top after scroll: ${libraryResult.headerTopAfterScroll}`);
  console.log(`    is sticky: ${libraryResult.isSticky}`);
  if (libraryResult.failures.length > 0) {
    console.log("    FAILURES:");
    for (const f of libraryResult.failures) console.log(`      - ${f}`);
  }

  console.log("");
  console.log("── Search /search ──");
  console.log(`  ${searchResult.passed ? "PASS" : "FAIL"} (expected sticky)`);
  console.log(`    header class: ${searchResult.headerClass}`);
  console.log(`    computed position: ${searchResult.headerComputedPosition}`);
  console.log(`    top before scroll: ${searchResult.headerTopBeforeScroll}`);
  console.log(`    top after scroll: ${searchResult.headerTopAfterScroll}`);
  console.log(`    is sticky: ${searchResult.isSticky}`);
  if (searchResult.failures.length > 0) {
    console.log("    FAILURES:");
    for (const f of searchResult.failures) console.log(`      - ${f}`);
  }

  const allPass = libraryResult.passed && searchResult.passed;
  console.log(`\n── OVERALL: ${allPass ? "PASS" : "FAIL"} ──`);
  process.exit(allPass ? 0 : 1);
}

void main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
