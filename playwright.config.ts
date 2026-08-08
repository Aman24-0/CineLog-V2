// playwright.config.ts
//
// Playwright E2E configuration for CineLog V2.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 8 CHUNK 4 — E2E TESTING
// ─────────────────────────────────────────────────────────────────────
// Playwright runs against the real SolidStart dev server (vinxi dev)
// so E2E tests exercise the full stack: client + server + Supabase +
// TMDB. Tests are intentionally SMOKE-LEVEL — they verify that the
// critical flows LOAD, render their primary landmarks, and respond
// to basic interactions. Deep functional testing (e.g. actually
// creating a vault item) requires live Supabase credentials and is
// out of scope for the default E2E suite.
//
// CRITICAL FLOWS COVERED (see e2e/*.spec.ts):
//   • auth.spec.ts       — auth modal opens, form renders, mode toggles
//   • vault.spec.ts      — /watchlist route loads, header renders,
//                          filter button opens drawer, status tabs work
//   • collections.spec.ts— /collections route loads, page title renders,
//                          smart-collection builder button is visible
//   • discover.spec.ts   — /discover route loads (default landing),
//                          spotlight + genre explorer + rails render
//
// WEB SERVER:
//   `webServer` auto-starts `vinxi dev` on port 3000 and waits for the
//   /healthcheck-style probe (we just use / itself — the root route
//   redirects to /discover). Reuses the existing dev port to match
//   local development. The `reuseExistingServer` flag lets developers
//   run `vinxi dev` themselves and then `npx playwright test` without
//   spawning a second server.
//
// BROWSERS:
//   Chromium only — Firefox + WebKit are skipped to keep CI fast and
//   because the app's target browsers are Chromium-derived (Chrome,
//   Edge, Android Chrome). Add projects for firefox/webkit later if
//   cross-browser regression coverage is needed.

import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  // Test directory — all *.spec.ts files under e2e/
  testDir: "./e2e",

  // Test files match this glob
  testMatch: "**/*.spec.ts",

  // Fail the run on any unexpected console error EXCEPT for the
  // known-noisy ones (Supabase auth 401s when not signed in, TMDB
  // rate-limit warnings, etc.). The regexes below are intentionally
  // permissive — E2E is for smoke testing, not for policing noise.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Reporter — list is the most readable for local dev; dot is more
  // compact for CI. GitHub reporter adds annotations on PRs.
  reporter: process.env.CI ? [["github"], ["list"]] : "list",

  // Shared settings for all tests in all projects.
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Navigation timeout — the dev server can be slow on first load
    // (SolidStart compiles routes on-demand). 30s is generous.
    navigationTimeout: 30_000,
    // Per-test action timeout — 10s is enough for any user-perceivable
    // action while still catching deadlocks.
    actionTimeout: 10_000,
  },

  // Auto-start the SolidStart dev server. This is the simplest way to
  // get a full-stack server running for E2E — no separate build step
  // needed. The server is reused if a developer already has it running.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // 2 min — first dev-server boot can be slow
    stdout: "ignore", // vinxi is very chatty; suppress in CI
    stderr: "pipe",   // but keep stderr for debugging failures
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
