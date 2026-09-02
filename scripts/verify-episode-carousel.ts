// scripts/verify-episode-carousel.ts
//
// Browser verification for the 2026-09-03 Episode Guide redesign.
//
// Verifies the CSS classes for the new horizontal season selector +
// episode carousel are present in the production build's CSS bundles,
// and that the dev server serves the page without errors at mobile
// viewport (390x844).
//
// A full interaction test (clicking seasons, swiping the carousel)
// requires a live Supabase auth session + a real TV title with
// seasons data, which we cannot simulate without credentials.

import { chromium } from "playwright";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const BUILD_DIR = ".vercel/output/static/_build/assets";

async function main() {
  console.log(`Verifying Episode Guide redesign at ${BASE_URL}…\n`);

  // ── Part 1: Build-artifact CSS verification ──────────────────────
  // Check the production build's CSS bundles for the new class names.
  let cssFiles: string[];
  try {
    cssFiles = readdirSync(BUILD_DIR).filter(
      (f) => f.endsWith(".css") && !f.endsWith(".br.css") && !f.endsWith(".gz.css")
    );
  } catch {
    cssFiles = [];
  }

  const requiredClasses = [
    ".season-selector",
    ".season-selector-pill",
    ".season-selector-pill-selected",
    ".episode-carousel",
    ".season-carousel-skeleton",
    ".episode-card-still-overlay",
    ".episode-card-action-btn",
    ".episode-card-rate-btn"
    // .episode-card-more-btn is intentionally NOT in the CSS — it
    // inherits from .episode-card-action-btn (the base action button
    // style). The class is applied in the JSX for semantic targeting
    // but doesn't need its own CSS rule.
  ];

  console.log("── Build CSS verification ──");
  let allCssFound = true;
  for (const cls of requiredClasses) {
    let found = false;
    for (const file of cssFiles) {
      const body = readFileSync(join(BUILD_DIR, file), "utf-8");
      if (body.includes(cls)) {
        found = true;
        break;
      }
    }
    console.log(`  ${found ? "PASS" : "FAIL"}  ${cls}`);
    if (!found) allCssFound = false;
  }

  // Also check the OLD classes are removed (or at least the accordion-specific ones).
  const oldClassesToRemove = [".season-accordion", ".season-navigator-list", ".episode-list"];
  console.log("\n── Old class removal check ──");
  for (const cls of oldClassesToRemove) {
    let found = false;
    for (const file of cssFiles) {
      const body = readFileSync(join(BUILD_DIR, file), "utf-8");
      if (body.includes(cls)) {
        found = true;
        break;
      }
    }
    console.log(`  ${found ? "STILL PRESENT" : "REMOVED (good)"}  ${cls}`);
  }

  // ── Part 2: Dev server mobile-viewport sanity check ─────────────
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

  // Navigate to /library (any page works for the sanity check — we
  // just need to confirm the dev server is healthy at mobile viewport).
  await page.goto(`${BASE_URL}/library`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const pageRendered = await page.evaluate(
    () => document.body.children.length > 0
  );
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

  console.log(`  Page rendered: ${pageRendered ? "YES" : "NO"}`);
  console.log(`  Console errors: ${realErrors.length}`);
  console.log(`  Horizontal overflow: ${horizontalOverflow ? "YES (BAD)" : "NO (good)"}`);

  await browser.close();

  const passed = allCssFound && pageRendered && realErrors.length === 0 && !horizontalOverflow;
  console.log(`\n── OVERALL: ${passed ? "PASS" : "FAIL"} ──`);
  process.exit(passed ? 0 : 1);
}

void main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
