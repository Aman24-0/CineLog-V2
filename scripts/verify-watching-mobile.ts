// scripts/verify-watching-mobile.ts
//
// Quick mobile-viewport sanity check — confirms the dev server is
// reachable at 390x844 and the /library page renders without console
// errors. A full "click Watching → verify status changes" test requires
// a live Supabase auth session (not available in CI).

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  console.log(`Verifying mobile viewport at ${BASE_URL}/library…`);
  console.log(`Viewport: 390x844\n`);

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

  const pageRendered = await page.evaluate(() => {
    return document.body.children.length > 0;
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

  console.log(`Page rendered at /library: ${pageRendered ? "YES" : "NO"}`);
  console.log(`Console errors (excluding known noise): ${realErrors.length}`);
  if (realErrors.length > 0) {
    for (const e of realErrors.slice(0, 5)) console.log(`  - ${e}`);
  }
  console.log(`Horizontal overflow at 390px: ${horizontalOverflow ? "YES (BAD)" : "NO (good)"}`);

  await browser.close();

  const passed = pageRendered && realErrors.length === 0 && !horizontalOverflow;
  console.log(`\n── OVERALL: ${passed ? "PASS" : "FAIL"} ──`);
  process.exit(passed ? 0 : 1);
}

void main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
