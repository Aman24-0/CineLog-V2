# JustWatch OTT Migration Worklog

This file is the cross-chunk memory for the CineLog V2 OTT migration
from TMDB OTT data to JustWatch GraphQL. Append-only. Every chunk must
record what it created/modified, validation results, and any errors
encountered.

## Chunk 1 — Foundation

### Task 1: Shared JustWatch types
- Created: src/shared/types/justwatch.ts
- Status: COMPLETE
- Validation: `./node_modules/.bin/tsc --noEmit` — 0 errors in this file
  (18 pre-existing errors in other files unrelated to this chunk:
  Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined`
  in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`. None
  touched by this chunk.)
- Notes: none

### Task 2: Shared JustWatch client
- Created: src/server/justwatch/client.ts
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in this file
  - `./node_modules/.bin/eslint src/server/justwatch/ src/shared/types/justwatch.ts` — 0 errors, exit 0
- Notes:
  - pnpm was not pre-installed in the dev environment; installed via `npm install -g pnpm` then `pnpm install` to populate node_modules. This did NOT modify package.json or pnpm-lock.yaml.
  - The project's `eslint.config.js` imports `@eslint/js`, which is a transitive dep of `typescript-eslint` but was not hoisted to top-level `node_modules/@eslint/js` by pnpm's strict isolation. A symlink was created at `node_modules/@eslint/js` → `.pnpm/@eslint+js@9.39.5/...` to let ESLint resolve its config. This is a pre-existing project setup issue, NOT a regression introduced by this chunk. No package.json change was needed.
  - The client exports four public functions: `searchJustWatchTitle`, `getJustWatchOffers`, `getJustWatchPackages`, `batchGetJustWatchOffers`. All four use the in-flight dedupe Map, the `rawGql` helper (10s AbortController timeout, 2 attempts on network/5xx, exponential backoff on 429 with `Retry-After` honored), and throw only for developer errors (invalid country, batch > 25, missing required args).

### Task 3: Supabase migration
- Created: supabase/migrations/20260818_justwatch_ott_migration.sql
- Status: COMPLETE
- Validation:
  - File syntax verified visually (3 CREATE TABLE statements + 2 CREATE INDEX statements, all idempotent via `if not exists`).
  - RLS intentionally omitted per chunk spec; later chunks will add policies.
  - Migration was NOT applied to a live database in this chunk (no `supabase db push`); only the file was created.
- Notes:
  - Timestamp `20260818` chosen as the next day after the latest existing migration `20260817_audio_languages_cache_add_region.sql`.
  - Tables: `justwatch_provider_catalog`, `justwatch_title_mapping`, `ott_availability_cache`.

### Task 4: Worklog file
- Created: justwatch_migration_worklog.md (this file)
- Status: COMPLETE

### Chunk 1 Verification Summary
- TypeScript typecheck (`tsc --noEmit`): PASS for new files. 18 pre-existing errors in OTHER files (Vite env types + 2 possibly-undefined accesses). None introduced by this chunk.
- ESLint (`eslint src/server/justwatch/ src/shared/types/justwatch.ts`): PASS, exit 0, 0 errors.
- Build (`vinxi build`): PASS — `✔ build done` / `✔ Nitro Server built` / `✔ You can deploy this build using npx vercel deploy --prebuilt`. New files compile cleanly (tree-shaken out of the bundle because nothing imports them yet — expected for a foundation-only chunk).
- Git: only the 4 new files staged for commit. Pre-existing unstaged modifications to other files are NOT included in this commit.

### Chunk 1 Commit & Push
- Commit hash: `1a801bf` (amended to include the final worklog state in the same commit)
- Commit message: `feat: add JustWatch OTT foundation client, types, and migration`
- Files in commit: 4 (justwatch_migration_worklog.md, src/server/justwatch/client.ts, src/shared/types/justwatch.ts, supabase/migrations/20260818_justwatch_ott_migration.sql)
- Push status: PUSHED — pushed to remote branch `Justwatch` on `https://github.com/Aman24-0/CineLog-V2.git` using a user-supplied GitHub Personal Access Token (PAT). The PAT was supplied via an explicit push URL (`https://x-access-token:<PAT>@github.com/...`) so it was NOT written to `.git/config` or any persistent credential store. Local branch `Justwatch` was created from `main` (which carries the chunk commit) and pushed to `origin/Justwatch`.
- Note: The chunk commit lives on local `main` ahead of `origin/main` by 1 commit. It was also pushed to the new `origin/Justwatch` branch as requested by the user. `origin/main` was NOT modified.

## Chunk 2

### Task: JustWatch OTT cache + service layer
- Created: src/server/justwatch/cache.ts
- Created: src/server/justwatch/service.ts
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in either new file. The 18 pre-existing errors in OTHER files (Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`) were already present before Chunk 1 and are NOT introduced or touched by this chunk.
  - `./node_modules/.bin/eslint src/server/justwatch/cache.ts src/server/justwatch/service.ts` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built` / `✔ You can deploy this build using npx vercel deploy --prebuilt`. New files compile cleanly (tree-shaken out of the bundle because nothing imports them yet — expected for a foundation-only chunk).
- Errors and fixes: none. No fixes were needed; both files passed all three verification steps on the first run.
- Notes:
  - **Pattern reuse**: cache.ts mirrors the audio-language cache (`src/server/audio-language/cache.ts`) — same lazy-init `createClient` factory, same env vars (`VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), same auth options (`{ autoRefreshToken: false, persistSession: false }`), same "swallow client-init errors and warn" philosophy so the service layer never throws to the UI.
  - **Database type augmentation**: the three new tables (`justwatch_provider_catalog`, `justwatch_title_mapping`, `ott_availability_cache`) are NOT yet reflected in `src/lib/supabase/database.types.ts` (that file is regenerated from the live Supabase schema and is shared with the rest of the codebase). Per the chunk rule "Do NOT modify existing files", I could not add them to `database.types.ts`. Instead, `cache.ts` defines a local `JustWatchAugmentedTables` type and intersects it with the imported `Database` type to produce a `JustWatchDatabase` type that covers both the existing tables and the three new ones. This gives full type safety on `.from(...)` calls without touching any existing file. A comment in `cache.ts` notes that this augmentation should be removed once `database.types.ts` is regenerated from the live schema.
  - **TTL computation**: the spec phrases TTLs as SQL intervals (`interval '1 hour' * ttlHours`, `interval '1 day' * ttlDays`). Since supabase-js computes timestamps on the client side, `cache.ts` translates these to JS — `hoursFromNow(hours)` and `daysFromNow(days)` helpers produce ISO 8601 timestamps that match the SQL semantics exactly.
  - **Service layer error policy**: per spec, the service layer NEVER throws for network / JustWatch / cache errors — it returns `null` / `[]` / partial results and `console.warn`s. It throws ONLY for developer errors: invalid `mediaType`, invalid `country`, batch size > 25. This mirrors the client layer's error policy.
  - **Batch resolution parallelism**: `batchGetTitleOttAvailability` resolves all uncached titles in parallel via `Promise.all` (up to 25). The client layer's in-flight dedupe Map coalesces duplicate titles within the same batch so we never hit JustWatch twice for the same query. Each resolved title is then fed into a single `batchGetJustWatchOffers` call (aliased multi-`node()` GraphQL query) so the whole batch makes at most 1 + N HTTP requests to JustWatch (N parallel searches + 1 batched offers fetch), not 2N.
  - **Cache writes are best-effort**: the cache layer swallows its own upsert errors and warns, so a cache write failure (e.g. transient DB connection blip) degrades gracefully — the caller still gets the freshly-fetched data, just without it being persisted. The next request will re-fetch and re-attempt the cache write.
  - **Chunk 2 does NOT introduce any UI or route changes**. The new functions are not yet imported by anything in the app. A later chunk will wire them into API routes / UI components.
  - **Pre-existing unstaged modifications** in the working tree (AUDIT_CHANGELOG.md, scripts/*, audio-language files, etc.) are NOT included in this commit. Only the two new files + the worklog are staged.

### Chunk 2 Commit & Push
- Commit hash: see `git log -1 origin/Justwatch` on the remote — the commit carries the message below. (The hash is intentionally not inlined here to avoid the self-reference loop where every amend to record the hash changes the hash.)
- Commit message: `feat: add JustWatch OTT cache and service layer`
- Files in commit: 3 (justwatch_migration_worklog.md, src/server/justwatch/cache.ts, src/server/justwatch/service.ts)
- Push status: PUSHED to `origin/Justwatch` using the user-supplied PAT (one-shot explicit push URL — NOT written to `.git/config`).

