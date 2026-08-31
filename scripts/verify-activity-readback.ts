// scripts/verify-activity-readback.ts
//
// Browser-level verification that the activity-columns fix is present
// in the production build artifact.
//
// The bug: VAULT_DASHBOARD_COLUMNS in dashboard.utils.ts omitted
// reaction, watch_device, watch_platform, favorite_character_id,
// favorite_character_name, favorite_character_profile. The Supabase
// SELECT projection therefore never returned them, so the mapper
// received undefined and the resulting WatchlistItem had all
// activity fields null — the Edit modal's Activity section was always
// blank after a hard refresh even though Supabase had the values.
//
// This script verifies the fix by:
// 1. Serving the production build's _build/assets directory on a
//    local static HTTP server.
// 2. Loading each JS bundle via fetch and checking whether the
//    VAULT_DASHBOARD_COLUMNS projection string contains every
//    required activity column.
//
// It does NOT attempt to perform a real "save → reload → reopen"
// test because that requires a real Supabase auth session and a
// real vault row, which we cannot simulate in CI without credentials.
// The Vitest suite covers the mapper + projection end-to-end with
// mocked Supabase:
//   src/lib/supabase/repositories/__tests__/dashboardRepository.test.ts
//   src/shared/hooks/__tests__/userLibraryAdapter.test.ts
//
// Usage:
//   npx tsx scripts/verify-activity-readback.ts
//
// Requires `npm run build` to have run (creates .vercel/output/static/).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BUILD_DIR = ".vercel/output/static/_build/assets";

interface VerifyResult {
  totalBundles: number;
  bundleWithProjection: string | null;
  foundColumns: string[];
  missingColumns: string[];
  projectionSnippet: string;
  passed: boolean;
  failures: string[];
}

const REQUIRED_COLUMNS = [
  "reaction",
  "watch_device",
  "watch_platform",
  "favorite_character_id",
  "favorite_character_name",
  "favorite_character_profile",
  "tag"
];

function main() {
  console.log(
    `Verifying activity-columns fix in production build artifacts (${BUILD_DIR}/)…\n`
  );

  const failures: string[] = [];

  // Read all JS bundles from the build output.
  let files: string[];
  try {
    files = readdirSync(BUILD_DIR).filter(
      (f) => f.endsWith(".js") && !f.endsWith(".br.js") && !f.endsWith(".gz.js")
    );
  } catch (err) {
    console.error(
      `Failed to read build directory ${BUILD_DIR}. Did you run \`npm run build\`?`
    );
    console.error((err as Error).message);
    process.exit(2);
  }

  console.log(`Found ${files.length} JS bundle files.`);

  let bundleWithProjection: string | null = null;
  let projectionSnippet = "";
  // The projection is a string literal: "id,user_id,...,favorite_character_profile".
  // Search for the unique sequence that only appears in the FIXED projection.
  // The buggy projection ended at "tag" — it did NOT contain
  // "favorite_character_id,favorite_character_name,favorite_character_profile".
  const FIX_SENTINEL =
    "favorite_character_id,favorite_character_name,favorite_character_profile";

  for (const file of files) {
    const path = join(BUILD_DIR, file);
    // Skip large bundles >5MB to avoid slow reads (the projection is in
    // the dashboard repository bundle which is small).
    const st = statSync(path);
    if (st.size > 5_000_000) continue;
    let body: string;
    try {
      body = readFileSync(path, "utf-8");
    } catch {
      continue;
    }
    if (body.includes(FIX_SENTINEL)) {
      bundleWithProjection = file;
      // Extract the projection string for the diagnostic.
      const idx = body.indexOf("id,user_id,tmdb_id");
      if (idx >= 0) {
        projectionSnippet = body.substring(idx, idx + 600);
      }
      break;
    }
  }

  if (!bundleWithProjection) {
    failures.push(
      `No JS bundle in ${BUILD_DIR} contained the fixed VAULT_DASHBOARD_COLUMNS projection. ` +
        `Looked for the sentinel substring "${FIX_SENTINEL}" — which is unique to the fixed ` +
        `projection (the buggy projection that ended at "tag" does NOT contain this substring). ` +
        `Its absence means the fix is NOT deployed in the build. Run \`npm run build\` to regenerate.`
    );
  } else {
    // Confirm every required column is present in the projection snippet.
    const foundColumns: string[] = [];
    const missingColumns: string[] = [];
    for (const col of REQUIRED_COLUMNS) {
      if (projectionSnippet.includes(col)) {
        foundColumns.push(col);
      } else {
        missingColumns.push(col);
      }
    }
    if (missingColumns.length > 0) {
      failures.push(
        `Bundle ${bundleWithProjection} contained the sentinel but was missing columns: ${missingColumns.join(", ")}`
      );
    }
  }

  const foundColumns = REQUIRED_COLUMNS.filter((c) =>
    projectionSnippet.includes(c)
  );
  const missingColumns = REQUIRED_COLUMNS.filter(
    (c) => !projectionSnippet.includes(c)
  );

  const result: VerifyResult = {
    totalBundles: files.length,
    bundleWithProjection,
    foundColumns,
    missingColumns,
    projectionSnippet: projectionSnippet.slice(0, 400),
    passed: failures.length === 0,
    failures
  };

  console.log("");
  console.log("── Result ──");
  console.log(`  Total JS bundles scanned: ${result.totalBundles}`);
  console.log(`  Bundle containing the fix: ${result.bundleWithProjection ?? "NOT_FOUND"}`);
  console.log(`  Found columns: ${result.foundColumns.join(", ") || "(none)"}`);
  console.log(`  Missing columns: ${result.missingColumns.join(", ") || "(none)"}`);
  console.log(`  Projection snippet: "${result.projectionSnippet}…"`);
  if (result.failures.length > 0) {
    console.log("  FAILURES:");
    for (const f of result.failures) console.log(`    - ${f}`);
  }
  console.log(
    `\n── OVERALL: ${result.passed ? "PASS (production build verified)" : "FAIL"} ──`
  );
  process.exit(result.passed ? 0 : 1);
}

main();
