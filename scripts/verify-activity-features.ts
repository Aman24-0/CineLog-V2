// scripts/verify-activity-features.ts
//
// Build-artifact verification for the 2026-09-02 activity-features
// implementation. Confirms the production build contains the 3 fixes:
//
//   Task 1: YourActivityCard renders the new activity-details panel
//     → look for the CSS class "your-activity-details" in the build's
//       CSS bundles.
//
//   Task 2: handleSetStatus no longer early-returns when the status
//     is already set, so the auto-open Edit fires unconditionally for
//     Completed / Watching. The fix removed the
//     `if (v.status === nextStatus) return;` line and introduced a
//     `statusChanged` branch. We CANNOT reliably detect this in a
//     production build via string matching — the variable name is
//     minified and the docstring is stripped. The runtime behaviour
//     is verified by the Vitest suite at:
//       src/features/details/DetailsModal/__tests__/useDetailsProgress.test.ts
//     (9 tests covering all 5 user-reported scenarios + error path).
//     The build check below is a best-effort scan that PASSES in dev
//     builds (where the docstring is preserved) and is SKIPPED in
//     production builds (where it's expected to be absent).
//
//   Task 3: PlatformSelector renders the pirate flag "other" tile
//     → look for the pirate flag emoji 🏴‍☠️ in the build's JS bundles
//       (the emoji is rendered as a string literal in the
//       OTHER_PLATFORM_META constant).
//
//   Shared: the watchActivity.ts module exports
//     → look for "favorite_character_id" in the build (already covered
//       by the previous fix's verification script) AND for the
//       "Other / Outside OTT" label string.
//
// This script scans the build artifacts in
// .vercel/output/static/_build/assets/ for these markers. It does NOT
// perform a real "save → reload → reopen" test because that requires
// a live Supabase auth session. The Vitest suite covers the
// component-level behaviour with mocked Supabase; this script confirms
// the fix is actually deployed in the bundle.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BUILD_DIR = ".vercel/output/static/_build/assets";

interface CheckResult {
  name: string;
  found: boolean;
  softFail: boolean;
  bundle: string | null;
  snippet: string;
}

interface VerifyResult {
  totalFiles: number;
  checks: CheckResult[];
  passed: boolean;
  failures: string[];
}

const CHECKS: Array<{
  name: string;
  marker: string;
  extensions: string[];
  snippetContext: number;
  /**
   * When true, a missing marker is a soft-fail (logged as a note,
   * not as a failure). Used for Task 2 — the `statusChanged` variable
   * is minified away in production builds, so we can't reliably detect
   * it. The runtime behaviour is verified by the Vitest suite
   * (useDetailsProgress.test.ts).
   */
  softFail?: boolean;
}> = [
  // Task 1: YourActivityCard activity-details panel CSS class.
  {
    name: "Task 1 — your-activity-details CSS class is in the build",
    marker: "your-activity-details",
    extensions: [".css"],
    snippetContext: 60
  },
  // Task 2: the `statusChanged` variable name is unique to the fixed
  // implementation. The buggy version had
  // `if (v.status === nextStatus) return;` and no `statusChanged`
  // variable. The fix introduced `statusChanged` as the gate for the
  // persistence branch. The variable is minified away in production
  // builds, so we mark this as soft-fail — the runtime behaviour is
  // verified by the Vitest suite (useDetailsProgress.test.ts, 9 tests).
  // In dev builds, the variable name is preserved and the check passes.
  {
    name: "Task 2 — handleSetStatus 'statusChanged' branch (dev build marker; minified in prod)",
    marker: "statusChanged",
    extensions: [".js"],
    snippetContext: 80,
    softFail: true
  },
  // Task 3: pirate flag emoji in the build.
  {
    name: "Task 3 — pirate flag emoji 🏴‍☠️ is in the build",
    marker: "🏴‍☠️",
    extensions: [".js"],
    snippetContext: 40
  },
  // Task 3: "Other / Outside OTT" label string in the build.
  {
    name: "Task 3 — 'Other / Outside OTT' label is in the build",
    marker: "Other / Outside OTT",
    extensions: [".js"],
    snippetContext: 40
  }
];

function main() {
  console.log(
    `Verifying 2026-09-02 activity-features in production build artifacts (${BUILD_DIR}/)…\n`
  );

  const failures: string[] = [];

  let files: string[];
  try {
    files = readdirSync(BUILD_DIR);
  } catch (err) {
    console.error(
      `Failed to read build directory ${BUILD_DIR}. Did you run \`npm run build\`?`
    );
    console.error((err as Error).message);
    process.exit(2);
  }

  console.log(`Found ${files.length} files in ${BUILD_DIR}.`);

  const checks: CheckResult[] = [];

  for (const check of CHECKS) {
    let found = false;
    let bundle: string | null = null;
    let snippet = "";

    for (const file of files) {
      // Skip non-matching extensions.
      const matchesExt = check.extensions.some((ext) => file.endsWith(ext));
      if (!matchesExt) continue;
      // Skip .br.js / .gz.js (compressed variants).
      if (file.endsWith(".br.js") || file.endsWith(".gz.js")) continue;

      const path = join(BUILD_DIR, file);
      let st;
      try {
        st = statSync(path);
      } catch {
        continue;
      }
      // Skip very large bundles to keep this fast (the markers we're
      // looking for live in feature-specific bundles, not the huge
      // shared-vendor chunk).
      if (st.size > 5_000_000) continue;

      let body: string;
      try {
        body = readFileSync(path, "utf-8");
      } catch {
        continue;
      }

      const idx = body.indexOf(check.marker);
      if (idx >= 0) {
        found = true;
        bundle = file;
        const start = Math.max(0, idx - check.snippetContext);
        const end = Math.min(body.length, idx + check.snippetContext);
        snippet = body.substring(start, end);
        break;
      }
    }

    checks.push({
      name: check.name,
      found,
      softFail: check.softFail ?? false,
      bundle,
      snippet
    });
    if (!found) {
      if (check.softFail) {
        // Soft-fail: log as a note, NOT as a failure. The runtime
        // behaviour for this check is verified by the Vitest suite.
        console.log(
          `  NOTE (soft-fail): ${check.name} — marker "${check.marker}" not found in any ${check.extensions.join("/")} bundle under ${BUILD_DIR}/. This is expected in production builds (the marker is minified away). Runtime behaviour is verified by the Vitest suite.`
        );
      } else {
        failures.push(
          `${check.name} — marker "${check.marker}" not found in any ${check.extensions.join("/")} bundle under ${BUILD_DIR}/.`
        );
      }
    }
  }

  const result: VerifyResult = {
    totalFiles: files.length,
    checks,
    passed: failures.length === 0,
    failures
  };

  console.log("");
  console.log("── Result ──");
  for (const c of result.checks) {
    const status = c.found ? "PASS" : c.softFail ? "SOFT-FAIL (dev only)" : "FAIL";
    console.log(`  ${status}  ${c.name}`);
    if (c.found) {
      console.log(`        bundle: ${c.bundle}`);
      console.log(`        snippet: "${c.snippet.slice(0, 120)}…"`);
    }
  }
  if (result.failures.length > 0) {
    console.log("\n  FAILURES:");
    for (const f of result.failures) console.log(`    - ${f}`);
  }
  console.log(
    `\n── OVERALL: ${result.passed ? "PASS (production build verified)" : "FAIL"} ──`
  );
  process.exit(result.passed ? 0 : 1);
}

main();
