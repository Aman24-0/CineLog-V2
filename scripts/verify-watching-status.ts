// scripts/verify-watching-status.ts
//
// Build-artifact verification for the 2026-09-03 Watching status bug fix.
//
// The bug: for TV series, setSeriesStatusInSupabase ignored the user's
// explicit "Watching" request and instead derived the status from episode
// progress via deriveSeriesStatus(). This meant:
//   - Completed → Watching on a fully-watched series: derived back to
//     "Completed" → the UI stayed on Completed and the toast said
//     "Status: Completed". BUG.
//   - Planned → Watching on a series with no watched episodes: derived
//     back to "Planned" → the UI stayed on Planned and the toast said
//     "Status: Planned". BUG.
//
// The fix: added an explicit "Watching" branch in
// setSeriesStatusInSupabase that persists "Watching" as-is, keeping the
// watched prefix but not re-deriving the status.
//
// This script scans the production build's JS bundles for the fix's
// sentinel comment string. The comment "2026-09-03 fix — explicit
// "Watching" request" is preserved in the source but may be stripped
// by minification. As a more reliable marker, we also check for the
// unique string 'requestedStatus === "Watching"' which is the condition
// that guards the new branch — this string appears verbatim in the
// minified bundle (string literals are preserved).
//
// Usage:
//   npx tsx scripts/verify-watching-status.ts
//
// Requires `npm run build` to have run (creates .vercel/output/static/).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BUILD_DIR = ".vercel/output/static/_build/assets";

function main() {
  console.log(
    `Verifying Watching status fix in production build artifacts (${BUILD_DIR}/)…\n`
  );

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

  // We're looking for the string 'requestedStatus === "Watching"' (or
  // its minified equivalent). In the minified bundle, string literals
  // are preserved, so "Watching" appears as a string. The condition
  // might be minified to something like `t==="Watching"`, but the
  // "Watching" string literal is still there. We look for the "Watching"
  // string literal in the bundle that contains the seriesEpisodeStateAdapter
  // code.

  let found = false;
  let bundle: string | null = null;
  let snippet = "";

  for (const file of files) {
    if (!file.endsWith(".js") || file.endsWith(".br.js") || file.endsWith(".gz.js"))
      continue;
    const path = join(BUILD_DIR, file);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.size > 5_000_000) continue;

    let body: string;
    try {
      body = readFileSync(path, "utf-8");
    } catch {
      continue;
    }

    // Look for the "Watching" string literal in a context that suggests
    // it's the explicit-Watching-request branch. The minified code will
    // have something like `if("Watching"===e)` or `if(e==="Watching")`
    // followed by a persistStatus call. We look for the pattern:
    // "Watching" near "persistStatus" (or the minified equivalent).
    //
    // A simpler reliable marker: the fix's sentinel comment
    // "2026-09-03 fix — explicit" is in the SOURCE but may be stripped.
    // However, the dev build preserves comments. We check both.

    // Check 1: the sentinel comment (dev builds only).
    if (body.includes("2026-09-03 fix — explicit")) {
      found = true;
      bundle = file;
      const idx = body.indexOf("2026-09-03 fix — explicit");
      snippet = body.substring(Math.max(0, idx - 40), idx + 120);
      break;
    }

    // Check 2: the "Watching" string literal near a condition check.
    // In the minified code, the fix adds a branch that checks
    // requestedStatus === "Watching" BEFORE the fall-through derivation.
    // We look for the "Watching" string literal that appears in a
    // conditional context. The buggy code also has "Watching" (in the
    // deriveSeriesStatus fall-through), so we can't just look for the
    // string alone. Instead, we look for the persistStatus call with
    // "Watching" — the fix calls persistStatus(uid, id, "tv", "Watching")
    // explicitly, while the buggy code calls persistStatus(uid, id, "tv",
    // resolvedStatus) where resolvedStatus is derived.
    //
    // The most reliable marker is the fix's return statement:
    // `return { ...state, status: "Watching" }` — the "Watching" string
    // literal in a return/object context is unique to the fix.
    //
    // In minified code, this might look like: `return{...e,status:"Watching"}`
    // We look for `status:"Watching"` in a return-like context.
    const marker = 'status:"Watching"';
    const idx = body.indexOf(marker);
    if (idx >= 0) {
      // Verify this is in a return context (preceded by `{...` or `return{`).
      const before = body.substring(Math.max(0, idx - 80), idx);
      if (before.includes("return") || before.includes("...")) {
        found = true;
        bundle = file;
        snippet = body.substring(Math.max(0, idx - 80), idx + 60);
        break;
      }
    }
  }

  if (found) {
    console.log(`  PASS — fix found in bundle: ${bundle}`);
    console.log(`  Snippet: "${snippet.slice(0, 200)}…"`);
    console.log(`\n── OVERALL: PASS (production build verified) ──`);
    process.exit(0);
  } else {
    console.log(`  FAIL — fix marker not found in any JS bundle.`);
    console.log(
      `  Looked for the sentinel comment "2026-09-03 fix — explicit" (dev builds)`
    );
    console.log(
      `  and the minified marker 'status:"Watching"' in a return context (prod builds).`
    );
    console.log(`\n── OVERALL: FAIL ──`);
    process.exit(1);
  }
}

main();
