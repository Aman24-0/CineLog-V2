# Contributing to CineLog V2

First off — thank you for taking the time to contribute. CineLog V2 is a
single-developer project at heart, but it has reached the size where outside
contributions are genuinely valuable. This document describes the setup,
testing, branching, and review expectations that keep the codebase healthy.

---

## 1. Project Snapshot

CineLog V2 is a **SolidStart + Supabase** PWA for tracking movies and TV
shows. The stack is:

- **Framework:** SolidStart (SolidJS) on Vinxi/Vite, Vercel preset.
- **Language:** TypeScript in `strict` mode, `isolatedModules`, zero `as any`.
- **Styling:** Tailwind CSS 3 + a custom Glassmorphism design system.
- **Backend / Auth / DB:** Supabase (Postgres + RLS + Storage + Auth).
- **External APIs:** TMDB (primary metadata), AniList (anime enrichment),
  MDBList (ratings), Resend (transactional email).
- **Deployment:** Vercel.
- **Testing:** Vitest + jsdom + `@solidjs/testing-library`.

Before contributing, skim `ARCHITECTURE.md` so you understand the
four-layer `core/` → `lib/` → `shared/` → `features/` dependency rule. Most
PR rejections come from a layering violation (e.g. importing a Supabase
client from inside `core/`).

---

## 2. Local Setup

### 2.1 Prerequisites

- **Node.js 20.x or 22.x** (enforced in `package.json#engines`). Older
  versions will fail on the Vinxi/Vite 5 ESM graph. Newer (23+) is
  untested.
- **npm 10+** (ships with Node 20). `pnpm` and `yarn` will work but the
  lockfile is `package-lock.json` — using a different package manager
  silently desyncs the dependency tree.
- A **Supabase project** (free tier is fine). You need the project URL
  and anon key for local dev. The service-role key is only needed for
  admin-feature testing.
- A **TMDB API key** (free). Used for all metadata. Without it the app
  boots but every page shows an empty state.
- Optional: an **AniList access token** if you want to test anime
  enrichment above the anonymous rate limit (90 req/min).

### 2.2 Install & Run

```bash
git clone https://github.com/Aman24-0/CineLog-V2.git
cd CineLog-V2
npm install
npm run dev          # http://localhost:3000
```

The dev server hot-reloads on file save. The first build takes ~30s
because Vinxi has to trace the route graph.

### 2.3 Environment Variables

Copy `.env.example` (if present) to `.env` and fill in:

```bash
# Required for the app to function.
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

# Required for TMDB metadata. Server-proxied.
TMDB_API_KEY=your_tmdb_v3_key

# Optional — anime enrichment above anonymous rate limit.
ANILIST_API_URL=https://graphql.anilist.co
ANILIST_ACCESS_TOKEN=

# Optional — Sentry error monitoring. Without these, captureException
# falls back to console.error (no network calls).
VITE_SENTRY_DSN=               # client-side (browser)
SENTRY_DSN=                    # server-side (Node)
SENTRY_RELEASE=                # optional, set by CI on deploy

# Optional — admin features (2FA, weekly recap cron).
ADMIN_JWT_SECRET=              # >= 32 chars recommended
CRON_SECRET=                   # gates /api/cron/* and /api/push/send-admin
```

All `VITE_*` vars are inlined into the client bundle — never put a
secret there. Server-only secrets (`TMDB_API_KEY`, `ANILIST_ACCESS_TOKEN`,
`SENTRY_DSN`, `ADMIN_JWT_SECRET`, `CRON_SECRET`) are read via
`process.env` in API routes and never reach the browser.

### 2.4 Database Setup

Apply migrations in order:

```bash
supabase db push                # applies everything in supabase/migrations/
```

If you already have a partial DB, the migrations are idempotent
(`IF NOT EXISTS` / `CREATE OR REPLACE`) so re-running is safe.

---

## 3. Testing

Testing is non-negotiable. The CI gate is `npx tsc --noEmit && npx vitest run`
— both must pass before merge.

### 3.1 Commands

```bash
npm test                      # one-shot vitest run
npm run test:watch            # watch mode (re-runs on file change)
npm run test:coverage         # vitest with V8 coverage
npx vitest run src/lib/supabase/repositories   # scoped to one folder
npx vitest run -t "should detect anime"        # scoped by test name
```

### 3.2 Test File Conventions

- Tests live next to the source: `src/lib/foo/__tests__/foo.test.ts`.
  Do **not** create a parallel `tests/` tree — it breaks co-location.
- Test files use the `.test.ts` (logic) or `.test.tsx` (component)
  suffix. Vitest's `include` glob is `src/**/__tests__/**/*.test.{ts,tsx}`.
- The global setup file is `test/setup.ts`. It registers
  `@testing-library/jest-dom` matchers, mocks browser APIs
  (`IntersectionObserver`, `ResizeObserver`, `matchMedia`), and clears
  `localStorage` + module-level signals in `beforeEach`. Do NOT add
  per-file `beforeEach` for these — extend `test/setup.ts` instead.
- Module-level Solid signals are reset between tests via
  `test/resetModuleState.ts` (Phase 8). If you add a new hook with
  module-level state, add a `__resetForTest()` export and wire it in
  there.

### 3.3 Coverage Thresholds

`vitest.config.ts` enforces:

| Metric    | Threshold |
| --------- | --------- |
| Statements | 75%       |
| Branches   | 65%       |
| Functions  | 75%       |
| Lines      | 75%       |

Coverage is **only measured** on pure-functional core (utilities,
repositories, adapters, business logic). UI components and routes are
excluded — they're tested manually and via integration smoke tests.
Lowering these thresholds requires explicit justification in the PR.

### 3.4 What to Test

- ✅ **Pure functions** (utils, adapters, mappers, normalizers) — 100%
  coverage, edge cases included.
- ✅ **Repositories** — happy path + error path + RLS-relevant edge cases.
- ✅ **Business logic** (timeline sort, smart-rule evaluation, anime
  detection) — algorithmic, high regression risk.
- ⚠️ **Components** — only when they contain non-trivial logic
  (e.g. `useVault`'s optimistic-update revert). Purely presentational
  Glass components do not need tests.
- ❌ **Routes / pages** — excluded from coverage. Test via manual
  click-through or the `criticalFlows.test.ts` regression suite.

---

## 4. Code Style

### 4.1 Linting & Formatting

```bash
npm run lint                 # eslint (TS + Solid rules)
npm run format               # prettier write
```

- **ESLint** uses `@typescript-eslint` + `eslint-plugin-solid`. The
  `solid/no-innerhtml` rule is relaxed for the one inline FOUT-prevention
  script in `entry-server.tsx` — every other `innerHTML` use will fail
  lint.
- **Prettier** is configured with `prettier-plugin-tailwindcss` so
  Tailwind class order is auto-sorted. Don't fight the formatter.
- **No `as any`**. The eslint config bans it. Use `as unknown as T` with
  a comment explaining why the runtime type is narrower than the static
  type (typically for Supabase JSON column casts).

### 4.2 TypeScript

- `strict: true`, `isolatedModules: true`, `forceConsistentCasingInFileNames: true`.
- The `~/*` path alias maps to `src/*`. Use it everywhere — never write
  relative paths like `../../shared/utils/foo`.
- Every file with JSX uses the `.tsx` extension and `jsxImportSource: "solid-js"`.
- Don't add `export default` to utility files — use named exports so
  tree-shaking can drop unused ones.

### 4.3 Inline Documentation

Non-trivial files have a header comment explaining:

1. **What** the module does (one paragraph).
2. **Why** it exists (the architectural decision — e.g. "moved here
   from X to break a circular import").
3. **How** it interacts with its callers (data flow, side effects,
   race conditions, gotchas).

This is mandatory for files in `lib/`, `shared/hooks/`, and any file
that documents a bug fix (reference the bug ID in the header). The
codebase has an unusually high density of inline comments — this is
intentional and reflects real production incidents that were debugged
from those comments.

### 4.4 Commit Messages

Follow the existing convention:

```
<type>(<scope>): <imperative summary>

<optional body explaining why, not what>

<optional footer referencing issue/PR>
```

Types in use: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`,
`perf`, `style`. Scope is the feature folder (`auth`, `watchlist`,
`collections`, `discover`, `admin`, ...) or `core` for cross-cutting.

Examples from `git log`:

```
fix(auth): abandon @supabase/ssr — standard supabase-js + localStorage (Task 15)
feat(details): add AniList characters section with VA cross-link
test(vault): cover episodeProgressAdapter edge cases
```

---

## 5. Branching & Pull Requests

### 5.1 Branch Strategy

- `main` is the deployable branch. Vercel auto-deploys on push to `main`.
  Never commit directly to `main`.
- Branch from `main` with the naming convention
  `<type>/<short-scope>-<short-description>`:
  - `feat/watchlist-csv-export`
  - `fix/auth-callback-race`
  - `docs/api-openapi-spec`
  - `chore/upgrade-solid-router`
- Keep branches short-lived (< 1 week). Rebase onto `main` before
  opening a PR to avoid merge commits.

### 5.2 Pull Request Checklist

Before requesting review:

- [ ] `npx tsc --noEmit` passes with zero errors.
- [ ] `npm run lint` passes with zero errors.
- [ ] `npx vitest run` passes (no skipped tests, no new failures).
- [ ] Coverage thresholds are met (CI will fail otherwise).
- [ ] New env vars are documented in `.env.example` and `CONTRIBUTING.md`.
- [ ] New API routes are documented in `openapi.yaml`.
- [ ] New migrations are idempotent and tested against a fresh DB.
- [ ] Inline comments explain the **why** for any non-obvious logic.
- [ ] No `console.log` left in production code (`console.warn` /
  `console.error` are fine for genuine warnings/errors).
- [ ] No `debugger` statements.
- [ ] Commit history is clean (squash-merge is fine, but individual
  commits within the branch should be coherent).

### 5.3 Review Expectations

Reviews focus on, in priority order:

1. **Security** — RLS coverage, service-role key isolation, constant-time
   comparisons, no PII in logs, no `VITE_*` secrets.
2. **Correctness** — edge cases, race conditions, error paths,
   optimistic-update reverts.
3. **Architecture** — layering (`core` → `lib` → `shared` → `features`),
   no circular imports, no god-components.
4. **Performance** — N+1 queries, unnecessary re-renders, missing
   `createMemo`, bundle-size regressions.
5. **Style** — naming, comment density, prettier compliance.

Reviews do NOT focus on bikeshedding (formatting, minor naming
preferences) — that's what prettier + eslint are for.

### 5.4 Merge Process

- Squash-merge is the default. The PR title becomes the commit summary.
- For multi-commit features where the intermediate commits are
  meaningful (e.g. "extract helper", "use helper in X", "use helper in Y"),
  a regular merge is acceptable.
- Force-push to `main` is disabled at the GitHub branch-protection level.
- Vercel deploys `main` automatically — there is no staging environment.
  If your change is risky, land it behind a feature flag (see
  `src/lib/featureFlags.ts`).

---

## 6. Database Migrations

Migrations live in `supabase/migrations/` with a `YYYYMMDD_description.sql`
naming convention (or `NN_description.sql` for the original numbered set).

Rules:

1. **Idempotent** — every `CREATE TABLE` / `CREATE POLICY` / `CREATE INDEX`
   must use `IF NOT EXISTS`. Every `DROP` must use `IF EXISTS`. Re-running
   the migration against a partially-applied DB must succeed.
2. **Additive** — never `DROP COLUMN` without a deprecation period. Add
   the new column, migrate the data, deploy the code, then schedule the
   drop in a follow-up migration.
3. **RLS-aware** — every new table must have `ENABLE ROW LEVEL SECURITY`
   and at least one policy. Tables without RLS will be rejected at review.
4. **Indexed** — any column that appears in a `WHERE` / `JOIN` / `ORDER BY`
   in the codebase must have an index. The repository layer is the source
   of truth for which columns are queried.
5. **Tested** — apply the migration to a fresh local Supabase project and
   run `npm run dev` + click through the affected feature before
   requesting review.

---

## 7. Adding a New Feature

A typical feature touches all four layers. Use this checklist:

1. **`core/`** — add pure utilities (no Supabase, no Solid). Examples:
   a normalizer, a detector, a pure sort function. Add tests.
2. **`lib/supabase/repositories/<domain>/`** — add the repository with
   `read.ts`, `write.ts`, `utils.ts`, `repository.ts`, `types.ts`,
   `index.ts`. Mirror the existing `vault/` or `profile/` structure.
   Add tests.
3. **`shared/hooks/`** — add the Solid hook that wraps the repository
   for client consumption. Use `createResource` for SSR-compatible
   reads, plain `createSignal` for client-only state.
4. **`features/<name>/`** — add the UI components and the page. Use the
   Glass design system (`shared/ui/glass/*`) — don't introduce new
   component primitives.
5. **`routes/`** — add the file-route. If it's an API route, document
   it in `openapi.yaml`.
6. **`supabase/migrations/`** — add the migration (if needed).
7. **`vitest.config.ts`** — add the new files to the `coverage.include`
   list so they're measured against the thresholds.

---

## 8. Getting Help

- Read `ARCHITECTURE.md` first — most "where does this go?" questions
  are answered by the layering rules.
- Read the file header comments — the codebase is unusually well
  documented and many design decisions are explained inline.
- Open a GitHub Discussion for "how do I..." questions.
- Open a GitHub Issue for bugs with a minimal reproduction case.

---

## 9. License

By contributing, you agree that your contributions are licensed under the
project's MIT license (see repository root).
