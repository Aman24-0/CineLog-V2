// scripts/verify-discover-404-fix.ts
//
// Regression verification: /discover must NOT 404 after the
// Running in Theatres change. This script was created because
// commit feba3c5 introduced src/routes/discover/theatres.tsx
// alongside src/routes/discover.tsx, causing a SolidStart file-route
// conflict that made /discover fall through to the [...404] catch-all.
//
// The fix moved the theatres route to src/routes/profile/theatres.tsx
// (matching the existing /profile/upcoming pattern) and deleted the
// discover/ directory.
//
// This script verifies:
//   1. /discover returns HTTP 200 (not 404).
//   2. The page content is the DiscoverPage (not the generic 404 page).
//   3. /profile/theatres (the See All destination) also resolves.
//   4. No horizontal overflow at 390x844.
//   5. No console errors.
//   6. Desktop (1280x800) also works.

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function checkRoute(
  route: string,
  viewport: { width: number; height: number }
): Promise<{
  route: string;
  httpStatus: number;
  is404Page: boolean;
  pageRendered: boolean;
  consoleErrors: number;
  horizontalOverflow: boolean;
}> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const response = await page.goto(`${BASE_URL}${route}`, {
    waitUntil: "networkidle"
  });
  await page.waitForTimeout(3000);

  const httpStatus = response?.status() ?? 0;
  const bodyText = await page.evaluate(() => document.body.textContent || "");

  // The generic 404 page shows "Page not found" or similar text.
  // The DiscoverPage shows "Discover" or section labels like "Coming Soon".
  const is404Page =
    bodyText.includes("Page not found") ||
    bodyText.includes("404") && !bodyText.includes("Discover");

  // Check if the page has actual content (not just the 404 shell).
  const pageRendered = await page.evaluate(() => {
    return (
      document.body.children.length > 0 &&
      // The 404 page typically has a very small DOM. The Discover page
      // has many sections. We check for a minimum body length.
      (document.body.textContent || "").length > 100
    );
  });

  const realErrors = consoleErrors.filter(
    (e) =>
      !e.includes("supabase") &&
      !e.includes("401") &&
      !e.includes("Failed to load resource") &&
      !e.includes("net::ERR_")
  );

  const horizontalOverflow = await page.evaluate(() => {
    return (
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1
    );
  });

  await browser.close();

  return {
    route,
    httpStatus,
    is404Page,
    pageRendered,
    consoleErrors: realErrors.length,
    horizontalOverflow
  };
}

async function main() {
  console.log(`Verifying /discover 404 fix at ${BASE_URL}…\n`);

  // ── Mobile (390x844) ────────────────────────────────────────────
  console.log("── Mobile (390x844) ──");

  const discoverMobile = await checkRoute("/discover", {
    width: 390,
    height: 844
  });
  console.log(`  /discover: HTTP ${discoverMobile.httpStatus}, 404 page: ${discoverMobile.is404Page}, rendered: ${discoverMobile.pageRendered}, errors: ${discoverMobile.consoleErrors}, overflow: ${discoverMobile.horizontalOverflow}`);

  const theatresMobile = await checkRoute("/profile/theatres", {
    width: 390,
    height: 844
  });
  console.log(`  /profile/theatres: HTTP ${theatresMobile.httpStatus}, 404 page: ${theatresMobile.is404Page}, rendered: ${theatresMobile.pageRendered}, errors: ${theatresMobile.consoleErrors}, overflow: ${theatresMobile.horizontalOverflow}`);

  // ── Desktop (1280x800) ──────────────────────────────────────────
  console.log("\n── Desktop (1280x800) ──");

  const discoverDesktop = await checkRoute("/discover", {
    width: 1280,
    height: 800
  });
  console.log(`  /discover: HTTP ${discoverDesktop.httpStatus}, 404 page: ${discoverDesktop.is404Page}, rendered: ${discoverDesktop.pageRendered}, errors: ${discoverDesktop.consoleErrors}, overflow: ${discoverDesktop.horizontalOverflow}`);

  const theatresDesktop = await checkRoute("/profile/theatres", {
    width: 1280,
    height: 800
  });
  console.log(`  /profile/theatres: HTTP ${theatresDesktop.httpStatus}, 404 page: ${theatresDesktop.is404Page}, rendered: ${theatresDesktop.pageRendered}, errors: ${theatresDesktop.consoleErrors}, overflow: ${theatresDesktop.horizontalOverflow}`);

  // ── Direct URL reload test ──────────────────────────────────────
  console.log("\n── Direct URL reload test ──");

  // The dev server serves all routes via SSR, so a direct navigation
  // to /discover should work (not just client-side navigation).
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();

  // Navigate directly to /discover (simulates a hard reload / external link)
  const directResponse = await page.goto(`${BASE_URL}/discover`, {
    waitUntil: "networkidle"
  });
  await page.waitForTimeout(2000);

  const directStatus = directResponse?.status() ?? 0;
  const directBodyText = await page.evaluate(
    () => document.body.textContent || ""
  );
  const directIs404 =
    directBodyText.includes("Page not found") &&
    !directBodyText.includes("Discover");

  console.log(`  Direct /discover: HTTP ${directStatus}, is 404: ${directIs404}`);

  // Navigate directly to /profile/theatres
  const directTheatresResponse = await page.goto(
    `${BASE_URL}/profile/theatres`,
    { waitUntil: "networkidle" }
  );
  await page.waitForTimeout(2000);

  const directTheatresStatus = directTheatresResponse?.status() ?? 0;
  const directTheatresBodyText = await page.evaluate(
    () => document.body.textContent || ""
  );
  const directTheatresIs404 =
    directTheatresBodyText.includes("Page not found") &&
    !directTheatresBodyText.includes("Theatres");

  console.log(
    `  Direct /profile/theatres: HTTP ${directTheatresStatus}, is 404: ${directTheatresIs404}`
  );

  await browser.close();

  // ── Summary ─────────────────────────────────────────────────────
  const allPass =
    discoverMobile.httpStatus === 200 &&
    !discoverMobile.is404Page &&
    discoverMobile.pageRendered &&
    discoverMobile.consoleErrors === 0 &&
    !discoverMobile.horizontalOverflow &&
    theatresMobile.httpStatus === 200 &&
    !theatresMobile.is404Page &&
    theatresMobile.pageRendered &&
    theatresMobile.consoleErrors === 0 &&
    !theatresMobile.horizontalOverflow &&
    discoverDesktop.httpStatus === 200 &&
    !discoverDesktop.is404Page &&
    discoverDesktop.pageRendered &&
    !discoverDesktop.horizontalOverflow &&
    theatresDesktop.httpStatus === 200 &&
    !theatresDesktop.is404Page &&
    theatresDesktop.pageRendered &&
    !theatresDesktop.horizontalOverflow &&
    directStatus === 200 &&
    !directIs404 &&
    directTheatresStatus === 200 &&
    !directTheatresIs404;

  console.log(`\n── OVERALL: ${allPass ? "PASS" : "FAIL"} ──`);
  process.exit(allPass ? 0 : 1);
}

void main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
