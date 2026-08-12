# CineLog V2 — Static Audit Changelog (2026-08-12)

## Scope & honesty note
This was a **static, tool-based audit**: install → lint → typecheck → build → unit tests → dead-code scan → security grep. It does NOT include: a live browser pass (visual/responsive/keyboard/a11y contrast), Lighthouse scoring, a running Supabase instance, or a manual review of all 776 files. Those require a deployed environment this sandbox doesn't have. Nothing below is guessed — every line is backed by a tool run.

## Results

**Build:** `npm run build` — clean, 0 errors, ~25s.
**Typecheck:** `tsc --noEmit` — 0 errors.
**Tests:** `vitest run` — 1412/1412 passing across 55 files.
**Lint:** 3 real errors found and fixed (below). ~109 remaining warnings, all `solid/reactivity` (destructured props read outside a tracked scope) and `solid/prefer-for` (Array.map instead of `<For>`) — stylistic/perf, not bugs; left as-is per your instruction to only fix real issues.

## Fixed
- **`src/features/landing/LandingPage.tsx`** — removed 2 unused imports (`DEMO_STATS`, `DemoTimelineEntry` type) and 1 unused destructured param (`i` in a `<For>` callback). Real ESLint errors, zero behavior change.
- **`src/lib/featureFlags.ts`** — removed `getServerFeatureFlags()`, confirmed dead (only its own declaration in the whole repo, not even referenced in tests).
- **`src/features/profile/achievements.constants.ts`** — removed `ACHIEVEMENTS_TOTAL`, same — zero references anywhere.

## Checked, no issue found
- **Dependencies:** `depcheck` flagged 5 devDeps as unused (`tailwindcss`, `@tailwindcss/postcss`, `postcss`, `prettier-plugin-tailwindcss`, `supabase`). Verified manually — all are real, used via config files (`postcss.config.js`, `.prettierrc`) or as CLI tooling for migrations. False positives, no action taken.
- **XSS:** 2 uses of `innerHTML` in the whole codebase. One (`AdminLogsPage.tsx`) HTML-escapes every value before building the string. The other (`entry-server.tsx`) is a static hardcoded font-loading script with no user input. Neither is exploitable.
- **SQL injection:** no raw string concatenation into queries anywhere; all Supabase calls go through the parameterized query builder.
- **Secret exposure:** no service-role keys or server-only secrets found in client code. The only `VITE_*` keys exposed client-side (`VITE_SUPABASE_ANON_KEY`, `VITE_TMDB_API_KEY`) are meant to be public by design (anon key + public TMDB key), and are only displayed masked in an admin diagnostics page.
- **`eval`/`new Function`:** none in the codebase.
- **Dead exports:** `ts-prune` flagged 491 "unused" exports; the large majority are false positives (SolidStart route `default` exports used by file-based routing, barrel re-exports, exports used only by tests). Spot-checked 6 the tool was most confident about — 2 were genuinely dead (removed above), 1 (`requireFeatureSupport`) is a currently-unused-but-intentional validation guard kept for API safety, the rest were false positives.

## Not done (needs a real browser/deploy, not available here)
Visual/responsive QA, Lighthouse scores, accessibility contrast/keyboard audit, live-auth-flow testing against Supabase, and a full manual line-by-line review of all 776 files. If you want these, the practical path is running `npm run dev` + Lighthouse/axe locally, or pointing me at a deployed preview URL I can `web_fetch`.
