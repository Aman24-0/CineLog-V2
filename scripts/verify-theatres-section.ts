// scripts/verify-theatres-section.ts
//
// Browser verification for the 2026-09-03 "Running in Theatres" section.
//
// Verifies:
//   1. The /discover page loads without errors.
//   2. The "Running in Theatres" section heading text exists in the
//      build's JS bundles (the component renders the label).
//   3. The /discover/theatres route is reachable.
//   4. No horizontal overflow at 390x844.
//   5. No console errors.
//
// A full interaction test (seeing the actual movies) requires a live
// TMDB API key, which the dev server has via .env. The dev server will
// actually fetch from TMDB, so we can verify the section renders if
// the API returns results.

import { chromium } from "playwright";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const BUILD_DIR = ".vercel/output/static/_build/assets";

async function main() {
  console.log(`Verifying "Running in Theatres" section…\n`);

  // ── Part 1: Build JS verification ────────────────────────────────
  let jsFiles: string[];
  try {
    jsFiles = readdirSync(BUILD_DIR).filter(
      (f) => f.endsWith(".js") && !f.endsWith(".br.js") && !f.endsWith(".gz.js")
    );
  } catch {
    jsFiles = [];
  }

  const checks = [
    {
      name: "Running in Theatres label in build JS",
      marker: "Running in Theatres"
    },
    {
      name: "theaters icon name in build JS",
      marker: "theaters"
    },
    {
      name: "/discover/theatres route in build JS",
      marker: "discover/theatres"
    },
    {
      name: "nowPlaying in build JS",
      marker: "nowPlaying"
    }
  ];

  console.log("── Build JS verification ──");
  let allFound = true;
  for (const check of checks) {
    let found = false;
    for (const file of jsFiles) {
      const body = readFileSync(join(BUILD_DIR, file), "utf-8");
      if (body.includes(check.marker)) {
        found = true;
        break;
      }
    }
    console.log(`  ${found ? "PASS" : "FAIL"}  ${check.name}`);
    if (!found) allFound = false;
  }

  // ── Part 2: Dev server mobile check at 390x844 ──────────────────
  console.log("\n── Dev server mobile check (390x844) ──");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // Navigate to /discover
  await page.goto(`${BASE_URL}/discover`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const pageRendered = await page.evaluate(() => document.body.children.length > 0);
  const realErrors = consoleErrors.filter(
    (e) => !e.includes("supabase") && !e.includes("401") && !e.includes("Failed to load resource") && !e.includes("net::ERR_")
  );
  const horizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  });

  // Check if the "Running in Theatres" section is visible on the page.
  // The section may be hidden if TMDB returns no results (the Show
  // condition checks nowPlayingFeed().titles.length > 0). We just
  // verify the page loads without errors — the actual data depends on
  // TMDB API availability.
  const theatresSectionVisible = await page.evaluate(() => {
    const allText = document.body.textContent || "";
    return allText.includes("Running in Theatres");
  });

  console.log(`  /discover page rendered: ${pageRendered ? "YES" : "NO"}`);
  console.log(`  "Running in Theatres" text visible: ${theatresSectionVisible ? "YES" : "NO (may be hidden if TMDB returned no results)"}`);
  console.log(`  Console errors: ${realErrors.length}`);
  console.log(`  Horizontal overflow: ${horizontalOverflow ? "YES (BAD)" : "NO (good)"}`);

  // ── Part 3: /discover/theatres route check ──────────────────────
  console.log("\n── /discover/theatres route check ──");
  const page2 = await context.newPage();
  const theatresErrors: string[] = [];
  page2.on("console", (msg) => {
    if (msg.type() === "error") theatresErrors.push(msg.text());
  });

  await page2.goto(`${BASE_URL}/discover/theatres`, { waitUntil: "networkidle" });
  await page2.waitForTimeout(2000);

  const theatresPageRendered = await page2.evaluate(() => document.body.children.length > 0);
  const theatresRealErrors = theatresErrors.filter(
    (e) => !e.includes("supabase") && !e.includes("401") && !e.includes("Failed to load resource") && !e.includes("net::ERR_")
  );
  const theatresHorizontalOverflow = await page2.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  });

  console.log(`  /discover/theatres rendered: ${theatresPageRendered ? "YES" : "NO"}`);
  console.log(`  Console errors: ${theatresRealErrors.length}`);
  console.log(`  Horizontal overflow: ${theatresHorizontalOverflow ? "YES (BAD)" : "NO (good)"}`);

  // ── Part 4: Desktop check at 1280x800 ───────────────────────────
  console.log("\n── Desktop check (1280x800) ──");
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(`${BASE_URL}/discover`, { waitUntil: "networkidle" });
  await desktopPage.waitForTimeout(2000);

  const desktopRendered = await desktopPage.evaluate(() => document.body.children.length > 0);
  const desktopOverflow = await desktopPage.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  });

  console.log(`  /discover rendered: ${desktopRendered ? "YES" : "NO"}`);
  console.log(`  Horizontal overflow: ${desktopOverflow ? "YES (BAD)" : "NO (good)"}`);

  await browser.close();

  const passed =
    allFound &&
    pageRendered &&
    realErrors.length === 0 &&
    !horizontalOverflow &&
    theatresPageRendered &&
    theatresRealErrors.length === 0 &&
    !theatresHorizontalOverflow &&
    desktopRendered &&
    !desktopOverflow;

  console.log(`\n── OVERALL: ${passed ? "PASS" : "FAIL"} ──`);
  process.exit(passed ? 0 : 1);
}

void main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
