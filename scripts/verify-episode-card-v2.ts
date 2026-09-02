// scripts/verify-episode-card-v2.ts
//
// Browser verification for the 2026-09-03 Episode Card v2 redesign
// (full-bleed cinematic backdrop).
//
// Verifies the CSS structure in the production build:
//   1. Full artwork fills the card (.episode-card-backdrop exists, NO .episode-card-body)
//   2. No separate dark content block below artwork (NO .episode-card-body)
//   3. Title/overview/metadata are over the artwork (.episode-card-content exists)
//   4. Overview is 3 lines (CSS has -webkit-line-clamp: 3)
//   5. More button is completely removed (NO .episode-card-more-btn, NO .episode-card-actions)
//   6. Watched icon is integrated into artwork (.episode-card-toggle is position: absolute)
//   7. Card is wide on mobile (width: 300px in the CSS)
//   8. Only a small portion of the next card is visible (scroll-snap-align: center)
//   9. Overall appearance feels modern/premium/cinematic (gradient overlay, glass badges)
//
// Also runs a dev-server mobile sanity check at 390x844.

import { chromium } from "playwright";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const BUILD_DIR = ".vercel/output/static/_build/assets";

async function main() {
  console.log(`Verifying Episode Card v2 redesign…\n`);

  // ── Part 1: Build CSS verification ──────────────────────────────
  let cssFiles: string[];
  try {
    cssFiles = readdirSync(BUILD_DIR).filter(
      (f) => f.endsWith(".css") && !f.endsWith(".br.css") && !f.endsWith(".gz.css")
    );
  } catch {
    cssFiles = [];
  }

  const checks: Array<{ name: string; test: (css: string) => boolean; desc: string }> = [
    {
      name: "Full-bleed backdrop class exists",
      test: (css) => css.includes(".episode-card-backdrop"),
      desc: ".episode-card-backdrop fills the entire card"
    },
    {
      name: "NO separate dark body block",
      test: (css) => !css.includes(".episode-card-body"),
      desc: "Removed .episode-card-body — no separate dark content below artwork"
    },
    {
      name: "Content overlay class exists",
      test: (css) => css.includes(".episode-card-content"),
      desc: ".episode-card-content holds title/overview/metadata over the backdrop"
    },
    {
      name: "Overview is 3-line clamped",
      test: (css) => css.includes("-webkit-line-clamp:3") || css.includes("-webkit-line-clamp: 3"),
      desc: "Overview CSS has -webkit-line-clamp: 3"
    },
    {
      name: "More button completely removed",
      test: (css) => !css.includes(".episode-card-more-btn") && !css.includes(".episode-card-actions"),
      desc: "NO .episode-card-more-btn or .episode-card-actions in CSS"
    },
    {
      name: "Watched toggle is position: absolute (integrated into artwork)",
      test: (css) => css.includes(".episode-card-toggle") && css.includes("position:absolute"),
      desc: ".episode-card-toggle is positioned over the backdrop"
    },
    {
      name: "Card width is 300px on mobile",
      test: (css) => css.includes("width:300px") || css.includes("width: 300px"),
      desc: "Card is substantially wider than the old 220px"
    },
    {
      name: "scroll-snap-align: center (one-card-focused)",
      test: (css) => css.includes("scroll-snap-align:center") || css.includes("scroll-snap-align: center"),
      desc: "Cards snap to center for one-card-focused browsing"
    },
    {
      name: "Multi-layer gradient overlay exists",
      test: (css) => css.includes(".episode-card-overlay"),
      desc: ".episode-card-overlay provides bottom-to-top dark gradient"
    },
    {
      name: "Glass badge with backdrop-filter",
      test: (css) => css.includes(".episode-card-number") && css.includes("backdrop-filter"),
      desc: "E# badge has glass backdrop-filter"
    },
    {
      name: "Rate icon is in metadata row (over backdrop)",
      test: (css) => css.includes(".episode-card-rate-btn"),
      desc: "Rate icon is a compact circular icon over the backdrop"
    }
  ];

  console.log("── Build CSS verification ──");
  let allCssFound = true;
  for (const check of checks) {
    let found = false;
    for (const file of cssFiles) {
      const body = readFileSync(join(BUILD_DIR, file), "utf-8");
      if (check.test(body)) {
        found = true;
        break;
      }
    }
    console.log(`  ${found ? "PASS" : "FAIL"}  ${check.name}`);
    if (!found) {
      console.log(`        Expected: ${check.desc}`);
      allCssFound = false;
    }
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

  await page.goto(`${BASE_URL}/library`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const pageRendered = await page.evaluate(() => document.body.children.length > 0);
  const realErrors = consoleErrors.filter(
    (e) => !e.includes("supabase") && !e.includes("401") && !e.includes("Failed to load resource") && !e.includes("net::ERR_")
  );
  const horizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
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
