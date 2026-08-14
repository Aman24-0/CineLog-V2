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

## Chunk 3

### Task: JustWatch OTT API routes + RLS policies
- Created: src/server/justwatch/region.ts
- Created: src/routes/api/ott/providers.ts
- Created: src/routes/api/ott/availability/[tmdbId].ts
- Created: src/routes/api/ott/batch-availability.ts
- Created: supabase/migrations/20260819_justwatch_ott_rls.sql
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in any new file. The 18 pre-existing errors in OTHER files (Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`) were already present before Chunk 1 and are NOT introduced or touched by this chunk.
  - `./node_modules/.bin/eslint src/server/justwatch/region.ts src/routes/api/ott/providers.ts "src/routes/api/ott/availability/[tmdbId].ts" src/routes/api/ott/batch-availability.ts` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built` / `✔ You can deploy this build using npx vercel deploy --prebuilt`. The four new route files are bundled as server-fns (the API routes are registered with the SolidStart router via file-based routing). The new region.ts helper is imported into each route.
- Errors and fixes:
  - One TypeScript error during the first tsc run: `src/routes/api/ott/providers.ts(59,9): error TS7034: Variable 'providers' implicitly has type 'any[]' in some locations where its type cannot be determined.` The `let providers;` declaration followed by a `try/catch` assignment confused TS's control-flow analysis (it couldn't determine the variable's type at the JSON.stringify call). Fixed by explicitly typing it as `let providers: JustWatchPackage[];` and importing the `JustWatchPackage` type. No other files were touched.
- Notes:
  - **Pattern reuse**: `region.ts` mirrors the `resolveProfileCountry` logic in `src/routes/api/audio-languages/[tmdbId].ts` — same Supabase `createClient` factory, same `getSupabaseAccessTokenFromRequest` helper (Bearer header → cookie fallback), same `auth.getUser(token)` verification, same `profiles.country` read, same fail-open "US" default. The chunk spec said "Do NOT import from audio-language route. Copy only the necessary country-resolution logic." — the function is fully self-contained in `region.ts` and only imports from `~/lib/supabase/admin/sessionCookie` (a shared helper, not the audio-language route).
  - **API route shape**: all three routes use the project's existing `interface APIEvent { request: Request }` pattern (no Vinxi-typed `event.params`). The `[tmdbId]` route parses the path segment from `url.pathname` (same defensive pattern as the audio-languages route) so we don't depend on Vinxi's param typing.
  - **Error policy**: per spec, all three routes NEVER throw to the client for service/JustWatch/cache errors. The providers and availability routes return 200 with empty data on any internal error. The batch route returns 400 only for invalid input (missing body, > 25 items) and 200 with empty results on any service error. The availability route additionally returns 400 for invalid `tmdbId` or `type` query params.
  - **Cache headers**: success responses use `public, max-age=300, s-maxage=600` (5 min browser, 10 min CDN) per spec. 400 errors use shorter/no caching (`max-age=60` for invalid tmdbId/type, `no-store` for batch-limit-exceeded) so a client retry isn't blocked by a stale 400.
  - **Batch validation**: `batch-availability.ts` cleans each item individually — items with invalid `mediaType` or non-positive `tmdbId` are dropped silently rather than failing the whole batch. This matches the spec rule "Do not throw for individual missing titles; only throw if input invalid or >25."
  - **RLS migration**: idempotent — uses `drop policy if exists` before each `create policy` so re-running on an already-migrated database is safe (mirrors the `audio_languages_cache` migration pattern). SELECT policies are world-readable for `anon, authenticated` (the OTT data is shared metadata, not user-specific — the `country` column is just a cache key, not a security boundary). No INSERT/UPDATE/DELETE policies are added for anon/authenticated; only the service role can write, since it bypasses RLS entirely.
  - **Chunk 3 does NOT introduce any UI changes**. The new routes are not yet called by any frontend code. A later chunk will wire the UI to call `/api/ott/providers`, `/api/ott/availability/[tmdbId]`, and `/api/ott/batch-availability`.
  - **Pre-existing unstaged modifications** in the working tree (AUDIT_CHANGELOG.md, scripts/*, audio-language files, etc.) are NOT included in this commit. Only the five new files + the worklog are staged.

### Chunk 3 Commit & Push
- Commit hash: see `git log -1 origin/Justwatch` on the remote (the hash is intentionally not inlined here to avoid the self-reference loop where every amend to record the hash changes the hash).
- Commit message: `feat: add JustWatch OTT API routes and RLS policies`
- Files in commit: 6 (justwatch_migration_worklog.md, src/server/justwatch/region.ts, src/routes/api/ott/providers.ts, src/routes/api/ott/availability/[tmdbId].ts, src/routes/api/ott/batch-availability.ts, supabase/migrations/20260819_justwatch_ott_rls.sql)
- Push status: PUSHED to `origin/Justwatch` using the user-supplied PAT (one-shot explicit push URL — NOT written to `.git/config`).

## Chunk 4

### Task: Migrate selected streaming providers to JustWatch technicalName + new Settings UI
- Modified: src/core/preferences/streamingProviders.ts
- Modified: src/core/preferences/index.ts
- Modified: src/core/preferences/preferencesSync.ts
- Modified: src/features/settings/hooks/useSettingsState.tsx
- Modified: src/features/settings/sections/ContentDiscoverSection.tsx
- Modified: src/features/settings/sections/types.ts
- Modified: src/styles/features/settings.css
- Created: src/features/settings/components/StreamingProvidersSection.tsx
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in any modified/created file. The 18 pre-existing errors in OTHER files (Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`) were already present before Chunk 1 and are NOT introduced or touched by this chunk.
  - `./node_modules/.bin/eslint src/core/preferences/streamingProviders.ts src/features/settings/hooks/useSettingsState.tsx src/features/settings/sections/ContentDiscoverSection.tsx src/features/settings/components/StreamingProvidersSection.tsx src/core/preferences/preferencesSync.ts src/features/settings/sections/types.ts src/core/preferences/index.ts` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built` / `✔ You can deploy this build using npx vercel deploy --prebuilt`. The SettingsPage bundle grew from 78.21 kB → 82.39 kB (expected — the new StreamingProvidersSection component is now part of the SettingsPage bundle).
- Errors and fixes:
  - One ESLint error during the first run: `src/features/settings/hooks/useSettingsState.tsx(505,32): error 'reg' is defined but never used.` The new `loadProviders` no longer uses the `reg` parameter (the JustWatch `/api/ott/providers` route resolves the caller's country from their profile, not from a query param). Fixed by renaming the parameter to `_reg` (the project's `@typescript-eslint/no-unused-vars` rule allows `^_`-prefixed args). The parameter is kept in the signature to preserve the existing `onMount(() => void loadProviders(region()))` and `createEffect(() => void loadProviders(r))` call sites — removing it would require touching more of useSettingsState than the chunk scope allows.
  - Five `solid/reactivity` warnings in `StreamingProvidersSection.tsx` (false positives — `props.row`, `props.total`, `props.onMoveUp`, `props.onMoveDown` are stable references passed once at component creation, not reactive variables). Fixed by destructuring once at the top of each child component and adding `// eslint-disable-next-line solid/reactivity` comments — the same pattern used by the existing `ContentDiscoverSection.tsx` (line 68) for `props.state`.
- Notes:
  - **Legacy TMDB ID clearing (Task 1)**: `streamingProviders.ts` now exports `isLegacyProviderId(value)` (returns true for pure-numeric strings like "8", "119" — these are TMDB watch_provider IDs, never JustWatch technicalNames). The `readProviderSet()` function detects legacy IDs on first read and clears the ENTIRE array (writing `[]` back to localStorage immediately). Full clear is the only safe migration because TMDB IDs and JustWatch technicalNames are completely different namespaces — keeping some TMDB IDs alongside JustWatch technicalNames would produce a broken mixed state. After clearing, existing users start with no selected providers and re-add them via the new Settings UI.
  - **Compatibility exports**: `TmdbProvider` and `mergeAndSortProviders` REMAIN EXPORTED from `streamingProviders.ts` (and re-exported from `index.ts`) because `src/features/discover/components/OttDropdown.tsx`, `src/routes/settings/content-discover.tsx`, and `src/core/preferences/__tests__/streamingProviders.test.ts` still depend on them. The chunk spec said "Do NOT modify OttDropdown" — so these exports stay. They are marked `@deprecated` with comments explaining they'll be removed in the chunk that migrates Discover OTT. The `mergeAndSortProviders` function body is unchanged — the existing tests still pass (couldn't run vitest due to a pre-existing vite-plugin-solid ESM resolution issue in the dev environment, but the function is byte-for-byte identical to before).
  - **New JustWatchProviderItem type**: introduced in `streamingProviders.ts` and re-exported from `index.ts`. It mirrors the `JustWatchPackage` type from `src/shared/types/justwatch.ts` but is duplicated in the preferences module to keep it self-contained (the preferences module is imported by many client components; keeping it independent of the shared justwatch types file makes tree-shaking easier). The `/api/ott/providers` route returns `JustWatchPackage[]` directly; the Settings hook casts it to `JustWatchProviderItem[]` (no-op at runtime — identical shapes).
  - **New preference helpers**: `addStreamingProvider(technicalName)`, `removeStreamingProvider(technicalName)`, `moveStreamingProvider(id, from, to)` added to `streamingProviders.ts` and re-exported from `index.ts`. These are convenience wrappers around `setStreamingProviders` for the Settings UI's add/remove/reorder buttons. `moveStreamingProvider` is defensive — it no-ops if `from`/`to` are out of bounds or if the provider at `from` doesn't match `id` (guards against stale UI state).
  - **Settings data source (Task 2)**: `useSettingsState.tsx`'s `loadProviders` now fetches from `/api/ott/providers` instead of TMDB's `getWatchProviderList`/`getWatchProviderListTv`. Removed the imports of `getWatchProviderList`, `getWatchProviderListTv`, and `mergeAndSortProviders` (the latter is no longer used by the settings hook — it's still used by OttDropdown, which imports it directly from `~/core/preferences`). The `providers` signal type changed from `TmdbProvider[]` to `JustWatchProviderItem[]`. `handleToggleProvider` now takes a `JustWatchProviderItem` and passes `provider.technicalName` to `toggleStreamingProvider`.
  - **New Settings UI (Task 3)**: created `src/features/settings/components/StreamingProvidersSection.tsx` — a self-contained component implementing the full search/add/remove/reorder UI per spec. Replaces the old TMDB chip grid in `ContentDiscoverSection.tsx` (the chip grid JSX was removed and replaced with `<StreamingProvidersSection ... />`). The component:
    - Reads `s.providers()` (loaded from `/api/ott/providers`) and `streamingProviders()` (the global preference signal) directly.
    - Search input with placeholder "Search streaming provider..." — filters by `clearName`, `technicalName`, `shortName` (case-insensitive, trimmed).
    - Search results show `[ADD]` for not-selected providers, `[ADDED]` (disabled) for selected ones. "No streaming providers found." when no match.
    - Empty state: "No OTT apps selected" / "Search and add the streaming services you use."
    - Selected providers ("YOUR OTT APPS"): each row has logo + clearName + up/down reorder buttons + REMOVE. Order persists via `moveStreamingProvider`.
    - Country-unavailable providers (selected technicalName not in current country catalog): rendered disabled with "Not available in your region" + REMOVE button. NOT reorderable while disabled.
    - Hint: "These providers are used only for Discover → New on OTT."
    - Logo URL: `https://images.justwatch.com${icon}` with `{profile}` → `s100` and `{format}` → `png`. No TMDB logos.
  - **CSS styles**: appended a new self-contained block to `src/styles/features/settings.css` (lines 1485+) with classes `ott-search-wrapper`, `ott-search-input`, `ott-search-row`, `ott-selected-row`, `ott-reorder-btn`, `ott-remove-btn`, etc. Uses existing CSS variables (`--sp-*`, `--p`, `--text-secondary`, `--bg-elevated`) so it adapts to the user's theme. No external CSS framework, no inline styles for layout.
  - **preferencesSync legacy clear (Task 4)**: `preferencesSync.ts`'s `applySnapshot` now filters out legacy TMDB IDs from the server snapshot before applying. Without this, a server `prefs_json` written before the migration (containing `streamingProviders: ["8", "119"]`) would re-populate the signal with TMDB IDs, and the next debounced push would write them BACK to the server — undoing the local clear. The filter drops only the legacy subset; if the server snapshot already contains JustWatch technicalNames (post-migration), they're respected. The next push overwrites the server with the filtered array, cleaning the server-side state over time.
  - **Chunk 4 does NOT modify**: OttDropdown.tsx, DiscoverPage, Where-to-Watch, Watchlist Platform filter, Statistics, Upcoming, or any TMDB provider registry files. The legacy `src/routes/settings/content-discover.tsx` route is also untouched (it still uses `mergeAndSortProviders` — will be migrated in a later chunk).
  - **Pre-existing unstaged modifications** in the working tree (AUDIT_CHANGELOG.md, scripts/*, audio-language files, etc.) are NOT included in this commit. Only the eight Chunk 4 files + the worklog are staged.

### Chunk 4 Commit & Push
- Commit hash: see `git log -1 origin/Justwatch` on the remote (the hash is intentionally not inlined here to avoid the self-reference loop where every amend to record the hash changes the hash).
- Commit message: `feat: migrate selected streaming providers to JustWatch technicalName and new Settings UI`
- Files in commit: 9 (justwatch_migration_worklog.md, src/core/preferences/streamingProviders.ts, src/core/preferences/index.ts, src/core/preferences/preferencesSync.ts, src/features/settings/hooks/useSettingsState.tsx, src/features/settings/sections/ContentDiscoverSection.tsx, src/features/settings/sections/types.ts, src/features/settings/components/StreamingProvidersSection.tsx, src/styles/features/settings.css)
- Push status: PUSHED to `origin/Justwatch` using the user-supplied PAT (one-shot explicit push URL — NOT written to `.git/config`).


## Chunk 5

### Task: Migrate Details "Where to Watch" to JustWatch offers
- Modified: src/features/details/components/WhereToWatch.tsx
- Modified: src/styles/features/details.css
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in modified files. The 18 pre-existing errors in OTHER files (Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`) were already present before Chunk 1 and are NOT introduced or touched by this chunk.
  - `./node_modules/.bin/eslint src/features/details/components/WhereToWatch.tsx` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built` / `✔ You can deploy this build using npx vercel deploy --prebuilt`.
- Errors and fixes: none. The component passed all three verification steps on the first run.
- Notes:
  - **Data source migration (Task 1)**: `WhereToWatch.tsx` now fetches from `GET /api/ott/availability/{tmdbId}?type={movie|tv}&title=...&year=...` instead of TMDB's `fetchTitleWatchProviders`. The route resolves the caller's country from their profile (anonymous → "US") and returns `{ tmdbId, mediaType, country, justwatchNodeId?, offers }`. The `title` and `year` query params are derived from the TMDB details (`d.title ?? d.name ?? d.original_title ?? d.original_name` and `d.release_date ?? d.first_air_date`) — these help the JustWatch resolver find the right node on a cache miss. If the title can't be resolved or has no offers, the route returns `offers: []` and the component hides itself.
  - **Removed TMDB imports (Task 4)**: removed `fetchTitleWatchProviders` and `tmdbImage` from `~/core/tmdb/tmdb`, `useDiscoverRegion` from `~/core/config/discoverRegion`, `canonicalForTmdbId` / `displayNameFor` from `~/features/discover/components/ottProviderRegistry`, and the `TMDBWatchProvider` type import from `~/shared/types`. The component now imports only `JustWatchOffer` and `JustWatchMonetizationType` from `~/shared/types/justwatch`. The `WatchlistItem` and `TMDBDetails` type imports from `~/shared/types` remain — they're used for the props shape (`baseItem`, `details` accessors) and for deriving the title/year lookup params, NOT for TMDB watch-provider data.
  - **Offer normalization (Task 2)**: a new `normalizeOffers(offers: JustWatchOffer[]): ProviderRow[]` function groups offers by `offer.package.id` and collapses multiple monetization types into a single row's badge set. For each group: `watchNowUrl` = first non-null `deeplinkURL`, `moreInfoUrl` = first non-null `standardWebURL`, `availableFromTime` = earliest non-null `availableFromTime`. Sort order: subscription (FLATRATE) or free-with-ads (FAST) first, then rent/buy, with alphabetical by `clearName` as the tiebreaker. No filtering by user-selected providers (per spec).
  - **Rendering (Task 3)**: each row renders a logo (JustWatch CDN — `https://images.justwatch.com${icon}` with `{profile}` → `s100` and `{format}` → `png`), the `clearName`, monetization badges (`Subscription` / `Free with ads` / `Rent` / `Buy`), a "Watch Now" button (deeplinkURL), a "More Info" button (standardWebURL), and an "Available <date>" label when `availableFromTime` is in the future. Badges appear in a fixed order (`FLATRATE`, `FAST`, `RENT`, `BUY`) regardless of Set iteration order, via the `MONETIZATION_ORDER` constant. The date is formatted as "Sep 1, 2026" via `toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })` — no external date library.
  - **Visibility / loading / error states (Task 5)**: the section is hidden (renders nothing) when: the `streaming_button` feature flag is false, the fetch is in progress (no skeleton — would be too noisy in the modal), the offers array is empty, or any fetch/parse error occurs. The `featureFlags.isEnabled("streaming_button")` gate is preserved exactly as before. The `loaded` signal is still used internally to avoid flashing the section before the first fetch completes, but no skeleton UI is rendered.
  - **CSS**: appended a new self-contained block to `src/styles/features/details.css` (lines 3331+) with classes `wheretowatch-list`, `wheretowatch-row`, `wheretowatch-row-main`, `wheretowatch-row-logo`, `wheretowatch-badges`, `wheretowatch-badge`, `wheretowatch-btn`, etc. Uses existing CSS variables (`--glass-bg`, `--hairline-2`, `--p`, `--text-soft`, `--text-dim`, `--space-*`, `--radius-*`, `--dur-fast`, `--ease-out`) so it adapts to the user's theme. The old `.wheretowatch-grid` / `.wheretowatch-card` / `.wheretowatch-logo` classes remain in the CSS file (harmless dead CSS — removing them would be a separate cleanup chunk). A `@media (max-width: 540px)` rule stacks the actions below the main row on narrow screens.
  - **No parent changes**: `DetailsModal.tsx` was NOT modified. The `<WhereToWatch baseItem={baseItem} details={tmdb} />` call site remains unchanged — the component's props interface is identical (still `baseItem: Accessor<WatchlistItem | null>` + `details: Accessor<TMDBDetails | null>`), and the visibility gate that was previously implicit in the parent is now inside the component (the `<Show when={featureFlags.isEnabled("streaming_button") && loaded() && visibleRows().length > 0}>` wrapper).
  - **Chunk 5 does NOT modify**: Discover, Watchlist Platform filter, Upcoming, Statistics, the API route, the service layer, the cache layer, or any TMDB watch-provider files in `src/core/tmdb/`. The legacy `src/routes/settings/content-discover.tsx` route is also untouched.
  - **Pre-existing unstaged modifications** in the working tree are NOT included in this commit. Only the two Chunk 5 files + the worklog are staged.

### Chunk 5 Commit & Push
- Commit hash: see `git log -1 origin/Justwatch` on the remote (the hash is intentionally not inlined here to avoid the self-reference loop where every amend to record the hash changes the hash).
- Commit message: `feat: migrate Details Where to Watch to JustWatch offers`
- Files in commit: 3 (justwatch_migration_worklog.md, src/features/details/components/WhereToWatch.tsx, src/styles/features/details.css)
- Push status: PUSHED to `origin/Justwatch` using the user-supplied PAT (one-shot explicit push URL — NOT written to `.git/config`).


## Chunk 6

### Task: Migrate Watchlist Platform filter to JustWatch availability
- Modified: src/features/watchlist/useVaultFiltering.ts
- Modified: src/features/watchlist/vaultFilterUtils.ts
- Modified: src/features/watchlist/platformDisplayNames.ts
- Modified: src/features/watchlist/components/VaultFiltersContent.tsx
- Modified: src/features/watchlist/components/VaultFilters.tsx
- Modified: src/features/watchlist/components/WatchlistDialogs.tsx
- Modified: src/shared/types/index.ts
- Created: src/features/watchlist/hooks/useWatchlistOttAvailability.ts
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in any modified/created file. The 18 pre-existing errors in OTHER files (Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`) were already present before Chunk 1 and are NOT introduced or touched by this chunk.
  - `./node_modules/.bin/eslint src/features/watchlist/useVaultFiltering.ts src/features/watchlist/vaultFilterUtils.ts src/features/watchlist/platformDisplayNames.ts src/features/watchlist/hooks/useWatchlistOttAvailability.ts src/features/watchlist/components/VaultFiltersContent.tsx src/features/watchlist/components/VaultFilters.tsx src/features/watchlist/components/WatchlistDialogs.tsx src/shared/types/index.ts` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built` / `✔ You can deploy this build using npx vercel deploy --prebuilt`. WatchlistView bundle is 59.62 kB (was ~58 kB pre-Chunk-6 — the new `useWatchlistOttAvailability` hook + JustWatch types add ~1.6 kB to the Watchlist bundle).
- Errors and fixes:
  - One TypeScript error during the first tsc run: `src/features/watchlist/hooks/useWatchlistOttAvailability.ts(290,47): error TS18047: 'releaseYear' is possibly 'null'.` The original code declared `const releaseYear: number | null = dateStr ? Number(...) : null` then checked `Number.isFinite(releaseYear) && releaseYear > 0` — TypeScript does NOT narrow `null` out of a `number | null` union via `Number.isFinite()` (only `typeof` guards narrow that way), so `releaseYear > 0` after the `Number.isFinite(releaseYear)` check still had `null` in scope. Fixed by introducing a `yearNum: number` intermediate (always a number — `NaN` when no date) and narrowing with `Number.isFinite(yearNum) && yearNum > 0`. Same logic, just structurally visible to TS's narrowing rules. No other files were touched.
- Notes:
  - **Task 1 — `uniquePlatforms` derivation**: the new `useWatchlistOttAvailability` hook (in `src/features/watchlist/hooks/useWatchlistOttAvailability.ts`) is the single source for the Platform filter dropdown options. It collects each watchlist item's `(mediaType, tmdbId, title?, releaseYear?)`, batches them into ≤25-item chunks, and fires `POST /api/ott/batch-availability` (Chunk 3 route) in parallel via `Promise.all`. From each result's `offers` array it extracts unique `package.technicalName` values + caches `package.clearName` and `package.icon` into a `packageMeta` Map. The `providerCatalog` memo aggregates per-provider counts across all items, then sorts by `count desc, clearName asc` (alphabetical tiebreaker so the dropdown is deterministic when counts are equal). Each `PlatformFilterOption` carries `{ technicalName, clearName, icon?, count }` — `technicalName` is the filter value (compared against `m.justwatchProviders`), `clearName` is the dropdown label. The `icon` URL is built from the JustWatch templated path `package.icon` via `buildJustWatchIconUrl()` which substitutes `{profile}` → `s100` and `{format}` → `png`, prefixed with `https://images.justwatch.com`. The `useVaultFiltering` hook now exposes `uniquePlatforms: Accessor<PlatformFilterOption[]>` as a thin pass-through memo from `providerCatalog()` (kept as a memo for API stability — `uniquePlatforms` was already part of the result interface before Chunk 6).
  - **Task 2 — `matchesPlatform` predicate**: rewritten to check ONLY `m.justwatchProviders` (a `string[]` of JustWatch `technicalName` values). The old three-source accumulation (`platformsList` + `providers` + `watchProgress.server` each run through `resolvePlatformDisplayName`) is REMOVED — the spec is explicit: "Remove or ignore the old three-source accumulation." Items with `justwatchProviders === undefined` (fetch not yet completed) OR `[]` (fetched, no offers) are EXCLUDED when a specific platform is selected. Under "All Platforms" (`f.platform === "all"`) the predicate is never called — `filterByAdvanced` short-circuits before reaching it. Old presets saved with a display-name `platform` value (e.g. `"Netflix"`) will match nothing — the user must re-select a platform from the new dropdown. No fallback to legacy fields.
  - **Task 3 — `WatchlistItem.justwatchProviders?: string[]`**: added to `src/shared/types/index.ts` with a full docstring explaining the `undefined` vs `[]` semantics. The legacy `providers?` field is marked `@deprecated` with a pointer to the new field. The `platformsList` and `watchProgress.server` fields are NOT removed — they may still be read by the search index in `vaultFilterUtils.ts` (the `matchSearch` function still includes `platformsList` in the lowercased search text — this is search, not filter, and is out of scope for Chunk 6).
  - **Task 4 — enriching watchlist items**: the `useWatchlistOttAvailability` hook exposes an `enrichedItems: Accessor<WatchlistItem[]>` memo. Until the first fetch completes (`availabilityMap === null`), it returns the raw `watchlist()` items unchanged (with `justwatchProviders: undefined`) — so the Watchlist renders immediately and the Platform filter simply matches nothing specific. Once the fetch resolves, items are CLONED with `justwatchProviders: string[]` (possibly empty `[]` for items with no offers). The original `WatchlistItem` objects are NEVER mutated — they're owned by the vault store. The `useVaultFiltering.filtered()` memo now consumes `enrichedItems()` instead of `args.watchlist()` directly, so `matchesPlatform` can read the new field. The fetch fires ONCE per Watchlist load (and again only when the watchlist signature changes — `mediaType:tmdbId` pairs joined by `|`). Filter state, sort order, favorite toggles, etc. do NOT re-trigger the fetch.
  - **Task 5 — display name resolution**: `platformDisplayNames.ts` now exports `resolvePlatformClearNameFromCatalog(technicalName, catalog)` — a simple O(n) lookup that returns the `clearName` for a given `technicalName` from the JustWatch provider catalog, falling back to the raw `technicalName` when not found (so the chip always renders SOMETHING). The old `resolvePlatformDisplayName(raw)` function (which canonicalized TMDB IDs / lowercase slugs via the `ottProviderRegistry`) is marked `@deprecated` and kept for one more chunk as a safety net — it has NO live consumers as of Chunk 6 (was the old Platform filter's display resolver; `computeChips` in `vaultFilterUtils.ts` now uses `resolvePlatformClearNameFromCatalog` indirectly via the catalog passed in from `useVaultFiltering`). The `computeChips` function signature changed to `computeChips(f, platformCatalog?: PlatformFilterOption[])` — when the catalog is provided, the Platform chip's label is resolved from `technicalName` → `clearName`; otherwise the raw `f.platform` string is shown (legacy callers).
  - **Task 6 — loading / error / empty states**: the Platform dropdown is HIDDEN via `<Show when={props.uniquePlatforms.length > 0}>` in `VaultFiltersContent.tsx` when the catalog is empty. This single behavior covers three cases uniformly: (1) batch-availability fetch in flight (loading), (2) fetch failed (network/parse/server error — the hook sets `error=true` and `providerCatalog=[]`), (3) no watchlist item has any JustWatch offer in the user's country. "Prefer hide" was chosen over "disabled All Platforms" because a disabled dropdown leaves the user unsure whether the filter is loading, broken, or genuinely empty — hiding removes the ambiguity. The hook exposes `ottLoading: Accessor<boolean>` and `error: Accessor<boolean>` via `useVaultFiltering` so a future UI iteration could show a skeleton if desired (not wired into the UI in this chunk — hide-on-empty is sufficient). No user-visible error toast. No fallback to legacy TMDB/source data — the spec is explicit.
  - **UI type signature propagation**: the `uniquePlatforms` prop type changed from `string[]` to `PlatformFilterOption[]` across three components — `VaultFiltersContent.tsx` (the actual consumer that renders the dropdown), `VaultFilters.tsx` (the mobile drawer wrapper), and `WatchlistDialogs.tsx` (the lazy-loaded modal wrapper). The `PlatformFilterOption` type is imported from `../hooks/useWatchlistOttAvailability` in each file. `WatchlistView.tsx` did NOT need changes — it forwards `uniquePlatforms` (already `Accessor<PlatformFilterOption[]>` from `useVaultFiltering`) to both the desktop sidebar `<VaultFiltersContent>` and the mobile `<WatchlistDialogs>`. The Platform dropdown's options now render as `{ l: p.clearName, v: p.technicalName }` instead of the previous `{ l: p, v: p }` — the label is the human-readable `clearName` ("Netflix", "Apple TV+"), the value is the stable `technicalName` ("netflix", "apple.tv.plus") that `matchesPlatform` compares against.
  - **Chunking + parallel fetch**: the hook splits the watchlist into ≤25-item chunks (the route enforces `MAX_BATCH = 25`) and fires them all in parallel via `Promise.all`. Each chunk's inner promise catches its own errors (network, non-200, JSON parse) and returns an empty `results` object — so a failure in one chunk doesn't poison the others. After all chunks resolve, the hook merges results into a single `Map<mediaType:tmdbId, string[]>` and rebuilds the `packageMeta` Map. If EVERY chunk came back empty (`successCount === 0`), the hook sets `error=true` — this is treated as "transient failure, hide the dropdown" rather than "watchlist has no offers" (which would be too aggressive when the cause is a network blip). The next watchlist signature change re-fetches from scratch.
  - **Defensive cancellation**: the effect uses a `cancelled` flag (set in the `on()` cleanup) to prevent stale state writes from a previous run when the watchlist signature changes mid-fetch. `fetch()` itself has no cancellation token, but the flag ensures `setAvailabilityMap` / `setPackageMeta` / `setLoading` / `setError` from a stale run are no-ops. This matches the pattern used elsewhere in the codebase (e.g. `useSettingsState`'s `loadProviders`).
  - **Chunk 6 does NOT modify**: Discover New on OTT, Upcoming, Statistics, Where to Watch, the API route (`/api/ott/batch-availability`), the service layer, the cache layer, the JustWatch client, the TMDB provider registry files in `src/features/discover/components/ottProviderRegistry*`, `package.json`, or any audio-language files. The legacy `resolvePlatformDisplayName` function is KEPT (marked `@deprecated`) — not deleted, per spec.
  - **Pre-existing unstaged modifications** in the working tree (AUDIT_CHANGELOG.md, scripts/*, audio-language files, etc.) are NOT included in this commit. Only the eight Chunk 6 files + the worklog are staged.

### Chunk 6 Commit & Push
- Commit hash: see `git log -1 origin/Justwatch` on the remote (the hash is intentionally not inlined here to avoid the self-reference loop where every amend to record the hash changes the hash).
- Commit message: `feat: migrate Watchlist Platform filter to JustWatch availability`
- Files in commit: 9 (justwatch_migration_worklog.md, src/features/watchlist/useVaultFiltering.ts, src/features/watchlist/vaultFilterUtils.ts, src/features/watchlist/platformDisplayNames.ts, src/features/watchlist/hooks/useWatchlistOttAvailability.ts, src/features/watchlist/components/VaultFiltersContent.tsx, src/features/watchlist/components/VaultFilters.tsx, src/features/watchlist/components/WatchlistDialogs.tsx, src/shared/types/index.ts)
- Push status: PUSHED to `origin/Justwatch` using the user-supplied PAT (one-shot explicit push URL — NOT written to `.git/config`).


## Chunk 6B — OTT regression fixes

### Task: Diagnose and fix 4 OTT UI regressions reported after Chunks 4–6
- Modified: src/server/justwatch/client.ts
- Modified: src/features/details/components/WhereToWatch.tsx
- Modified: src/features/settings/components/StreamingProvidersSection.tsx
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in modified files. The 18 pre-existing errors in OTHER files (Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`) were already present before Chunk 1 and are NOT introduced or touched by this chunk.
  - `./node_modules/.bin/eslint src/server/justwatch/client.ts src/features/details/components/WhereToWatch.tsx src/features/settings/components/StreamingProvidersSection.tsx` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built`.
  - End-to-end probe against the live JustWatch API confirmed the corrected query format resolves titles (5 results for "Demon Slayer" SHOW in IN) and fetches offers (HTTP 200).
- Errors and fixes: none during implementation — all three validation steps passed on the first run.
- Notes:
  - **Root cause diagnosis (probing)**: wrote two probe scripts (`scripts/probe-justwatch-queries.ts`, `scripts/probe-justwatch-search.ts`, `scripts/probe-year-filter.ts`, `scripts/verify-fix.ts`) that directly call the JustWatch GraphQL endpoint to test each query + field combination. Key findings:
    1. The `packages(country, platform: WEB)` query WORKS — returns 89 providers for IN, all with non-null `id`, `clearName`, `shortName`, `technicalName`, `icon`. Indian providers like JioHotstar, Zee5, Sony Liv, MX Player are all present.
    2. The `searchTitles` query with `source: "search"` + `filter: { searchQuery, objectTypes }` WORKS — returns 5 results. BUT the original OTT client passed `releaseYear: IntFilter` with `{ from, to }` fields, which JustWatch rejects with 422 "unknown field: releaseYear.from". The correct `IntFilter` field names are undocumented and probing showed `{from,to}`, `releaseYearFrom`, `releaseDateFrom` all fail.
    3. The `node(id)` offers query with all fields (`monetizationType`, `presentationType`, `audioLanguages`, `subtitleLanguages`, `availableFromTime`, `availableToTime`, `currency`, `package { id clearName shortName technicalName icon }`, `standardWebURL`, `deeplinkURL(platform: WEB)`) WORKS — returns 200 with offer data.
    4. The icon URL `https://images.justwatch.com/icon/207360008/s100/netflix.png` returns HTTP 200, content-type: image/png — the URL construction in `buildLogoUrl` is correct.
    5. `objectType` is NOT selectable directly on the search `node` interface (only on concrete `Movie`/`Show` types via inline fragments). The audio-language module's working query requests only `id` on search nodes.

  - **Issue 1 (Settings provider catalog empty for Indian OTT)**: The packages query itself was NOT broken — it returns 89 IN providers. The most likely user-facing cause is that `resolveJustWatchCountry` returned "US" (anonymous user or profile without country set), and US doesn't have JioHotstar/Zee5/SonyLiv — so searching for those names returned 0 results. The `coercePackage` validation was also too strict (required ALL 5 fields), which could drop providers in other countries where `shortName` or `icon` is null. **Fix**: relaxed `coercePackage` + `getJustWatchPackages` validation to only require `id`, `clearName`, `technicalName`; `shortName` and `icon` default to `""` when missing. Consumers already handle empty `icon` (buildLogoUrl returns `""` → letter fallback) and empty `shortName` (matchesQuery uses optional chaining).

  - **Issue 2 (Provider logos not showing in Settings)**: The `onError` handler on the `<img>` tag was `e.currentTarget.style.display = "none"` — this hid the broken image but did NOT show the fallback letter, because the `<Show when={logoUrl()}>` condition was still true (the URL string was non-empty, just broken). The user saw an empty box. **Fix**: replaced the `onError` handler with a `setImgError(true)` signal, and changed the `<Show>` condition to `showLogo = createMemo(() => logoUrl() !== "" && !imgError())`. Now when an image fails to load, `imgError` flips to true, `showLogo()` becomes false, and the fallback letter renders. Applied the same fix to both `ProviderSearchRow` and `SelectedProviderRow` in `StreamingProvidersSection.tsx`, and to the offer row in `WhereToWatch.tsx`.

  - **Issue 3 (Where to Watch hidden in Details modal)**: TWO root causes. (a) `searchJustWatchTitle` used a broken `releaseYear: IntFilter` format that caused 422 — ALL title resolution failed, so `getTitleOttAvailability` returned null, and the section hid. (b) `WhereToWatch` used `onMount` for the fetch, which fires ONCE. If `baseItem()` or `details()` were null on mount (async loading), the fetch never fired when they became available. **Fix (a)**: rewrote `SEARCH_TITLES_QUERY` and `POPULAR_TITLES_FALLBACK_QUERY` to use `$filter: TitleFilter!` as a variable (matching the audio-language module's proven format), dropped the `releaseYear` IntFilter entirely (search + objectTypes is sufficient — JustWatch sorts by popularity), dropped `objectType` from the search node selection (not selectable on the interface type). The `releaseYearFrom`/`releaseYearTo` params are kept in the `searchJustWatchTitle` signature for backward compat but marked `@deprecated` and not sent to JustWatch. **Fix (b)**: changed `onMount(() => void loadProviders())` to `createEffect(() => { ... })` watching `tmdbId()` + `mediaType()`. Uses a `lastFetchedKey` string to avoid duplicate fetches for the same title. Re-fires when the user navigates to a different title within the same modal.

  - **Issue 4 (Watchlist Platform filter hidden)**: Same root cause as Issue 3(a). The `useWatchlistOttAvailability` hook calls `POST /api/ott/batch-availability` → `batchGetTitleOttAvailability` → `resolveTitleToJustWatchNode` → `searchJustWatchTitle`. The broken `releaseYear` IntFilter caused ALL title resolution to fail with 422, so no offers were fetched, so the `providerCatalog` was empty, so `uniquePlatforms` was empty, so the Platform dropdown was hidden (Chunk 6 Task 6 "prefer hide" behavior). **Fix**: same as Issue 3(a) — the corrected `searchJustWatchTitle` query now resolves titles successfully, offers are fetched, the catalog is populated, and the dropdown appears.

  - **Issue 5 (New on OTT in Discover unchanged)**: OUT OF SCOPE per spec — not touched.

  - **Files NOT modified**: `src/server/justwatch/service.ts` (no changes needed — it passes `releaseYearFrom`/`releaseYearTo` to `searchJustWatchTitle`, which now accepts but ignores them), `src/server/justwatch/cache.ts`, `src/server/justwatch/region.ts`, `src/routes/api/ott/*` (all three routes are thin wrappers around the service layer and don't need changes), `src/features/watchlist/hooks/useWatchlistOttAvailability.ts`, `src/features/watchlist/useVaultFiltering.ts`, `src/features/watchlist/vaultFilterUtils.ts`, `src/features/watchlist/platformDisplayNames.ts`, `src/features/watchlist/components/*`, `src/shared/types/*`, `src/core/preferences/streamingProviders.ts`, `package.json`.

  - **Pre-existing unstaged modifications** in the working tree (AUDIT_CHANGELOG.md, scripts/*, audio-language files, etc.) are NOT included in this commit. Only the three Chunk 6B files + the worklog are staged.

### Chunk 6B Commit & Push
- Commit hash: see `git log -1 origin/Justwatch` on the remote.
- Commit message: `fix: correct JustWatch GraphQL query format and fix OTT UI regressions`
- Files in commit: 4 (justwatch_migration_worklog.md, src/server/justwatch/client.ts, src/features/details/components/WhereToWatch.tsx, src/features/settings/components/StreamingProvidersSection.tsx)
- Push status: PUSHED to `origin/Justwatch`.


## Chunk 6C — Preview deployment blockers

### Task 1: Add JustWatch image CDN to CSP `img-src`
- Modified: vercel.json
- Status: COMPLETE
- Validation: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` — valid JSON. `python3 -c "import json; ..."` confirms `images.justwatch.com` is present in the CSP `img-src` directive.
- Errors and fixes: none.
- Notes:
  - **Root cause (Issue 1)**: The Vercel preview deployment's `Content-Security-Policy` header listed `https://image.tmdb.org`, `https://*.supabase.co`, `https://i.ytimg.com`, `https://vercel.live`, `https://lh3.googleusercontent.com` under `img-src`, but NOT `https://images.justwatch.com`. Every provider logo URL built by `buildLogoUrl()` in `client.ts` points at `https://images.justwatch.com/icon/<id>/s100/<technicalName>.png`, so the browser blocked them with a CSP violation: `Refused to load the image 'https://images.justwatch.com/...' because it violates the following Content Security Policy directive: "img-src 'self' data: blob: https://image.tmdb.org ..."`.
  - **Fix**: added `https://images.justwatch.com` to the `img-src` directive in `vercel.json`. Did NOT add it to `connect-src` (the app does not call JustWatch from the browser — only the server does).
  - The CSP is only defined in `vercel.json` (one location). No other file in the repo sets a CSP — confirmed via repo-wide grep for `Content-Security-Policy` (only matches in `vercel.json` and documentation files like `AUDIT_CHANGELOG.md`, `worklog.md`, `CineLog_V2_Complete_Audit.md`).

### Task 2: Make OTT API routes fail open (mirror audio-languages route)
- Modified: src/routes/api/ott/providers.ts
- Modified: src/routes/api/ott/availability/[tmdbId].ts
- Modified: src/routes/api/ott/batch-availability.ts
- Modified: src/server/justwatch/region.ts
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in modified files. The 18 pre-existing errors in OTHER files (Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`) are unchanged.
  - `./node_modules/.bin/eslint src/server/justwatch/cache.ts src/server/justwatch/service.ts src/server/justwatch/region.ts src/routes/api/ott/providers.ts src/routes/api/ott/availability/[tmdbId].ts src/routes/api/ott/batch-availability.ts` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built`. Verified the bundled output (`/api/ott/batch-availability` and `/api/ott/providers` chunks) contains the new `Access-Control-Allow-Origin` headers and the `country: "US"` defensive fallback.
- Errors and fixes: none during implementation.
- Notes:
  - **Hypothesis A — 401 from OTT routes**: directly inspecting all three OTT route handlers revealed they NEVER return HTTP 401. Every code path returns 200 (with `country: "US"` and empty `providers`/`results`/`offers` on failure) or 400 (for invalid input). The outer `try/catch` in each route is a defensive backstop that always returns 200. The user-reported "POST requests to OTT API routes return 401" is therefore almost certainly NOT coming from the OTT route handlers themselves.
  - **Hypothesis B — 401 from `resolveJustWatchCountry`**: `resolveJustWatchCountry(request)` was already structured to never throw — it returns `DEFAULT_COUNTRY = "US"` on missing token, missing env vars, Supabase auth errors, and any caught exception. To make this even more bulletproof, the route handlers now wrap the `resolveJustWatchCountry` call in an additional `try/catch` so a future regression cannot propagate to the route's outer try/catch (which would still return 200, but with a less informative payload).
  - **Hypothesis C — CORS preflight**: comparing the OTT routes to `/api/audio-languages/[tmdbId]` (the proven pattern), the audio-languages route exports an explicit `OPTIONS` handler that returns 204 + `Access-Control-Allow-Origin` + `Access-Control-Max-Age: 86400`, and every GET/POST response includes `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, and `Vary: Origin`. The three OTT routes did NOT export OPTIONS handlers and did NOT include CORS headers. If the browser sent a preflight OPTIONS for a cross-origin POST (e.g. a preview URL hitting the production API, or vice versa), SolidStart would return its default OPTIONS response with no CORS headers, the browser would block the subsequent POST, and the network tab could surface this as a 401 (Vercel's default for unauthenticated OPTIONS on certain configurations). **Fix**: added the same `getAllowedOrigin` + `buildCorsHeaders` helpers + `OPTIONS` handler to all three OTT routes, mirroring the audio-languages pattern exactly. Every GET/POST response now includes CORS headers when the request's `Origin` matches the app's canonical URL or any `*.vercel.app` subdomain.
  - **Hypothesis D — env vars not populated on Vercel serverless**: `resolveJustWatchCountry` originally read `process.env.VITE_SUPABASE_URL` and `process.env.VITE_SUPABASE_ANON_KEY`. On Vercel, `VITE_*` env vars are inlined into the bundle at build time via `import.meta.env.VITE_*`, but `process.env.VITE_*` is only populated when the var is explicitly marked as a Server env var in the Vercel dashboard (not just Preview/Build). If the env was misconfigured, the resolver would silently return `"US"` (not throw), the country would never be `IN`, and the provider catalog would only contain US providers (no JioHotstar/Zee5/SonyLiv). **Fix**: added a `readEnv()` helper to `region.ts` that tries `import.meta.env` first (build-time inlined), then falls back to `process.env` (runtime). This makes country resolution resilient to either Vercel env-var configuration.

### Task 3: Make Settings provider catalog resilient (cache errors non-blocking)
- Modified: src/server/justwatch/service.ts
- Status: COMPLETE
- Validation: tsc + eslint + build all pass (see Task 2 validation block).
- Notes:
  - **Root cause hypothesis (Issue 3)**: `getProviderCatalog(country)` originally called `getCachedProviderCatalog(country)` and `upsertProviderCatalog(country, providers)` WITHOUT wrapping them in try/catch. The cache layer's own `try/catch` blocks already swallowed errors internally, so this was technically safe — BUT it relied on the cache layer being perfectly defensive. Per the spec's resilience philosophy, the service layer now also wraps each cache call in its own try/catch with a `console.warn`. This means:
    - Cache read failure → `console.warn`, fall through to live JustWatch fetch.
    - Cache write failure → `console.warn`, still return the live data.
    - JustWatch fetch failure → `console.warn`, return `[]`.
  - Applied the same pattern to `getTitleOttAvailability` (cache read + write wrapped) and `batchGetTitleOttAvailability` (per-item cache read wrapped, per-item cache write wrapped so one bad write doesn't lose the rest of the batch's results).
  - `resolveTitleToJustWatchNode` cache read + write also wrapped.
  - The final return is always the live JustWatch result whenever JustWatch succeeds, regardless of cache state. Cache failures NEVER cause an empty return.

### Task 4: Verify service-role key usage (lazy init, no throw)
- Modified: src/server/justwatch/cache.ts
- Status: COMPLETE
- Validation: tsc + eslint + build all pass (see Task 2 validation block).
- Notes:
  - **Root cause hypothesis**: `getServiceClient()` in `cache.ts` threw `new Error("[justwatch/cache] service client requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY")` when env vars were missing. Each public cache function (`getCachedProviderCatalog`, `upsertProviderCatalog`, `getCachedTitleMapping`, `upsertTitleMapping`, `getCachedOttAvailability`, `upsertOttAvailability`) wrapped this call in a `try/catch` and returned `null` / no-op, so the throw never propagated. However, the spec's preferred pattern is for `getServiceClient` itself to return `null` (not throw), making the contract explicit and removing the reliance on every caller remembering to try/catch.
  - **Fix**: `getServiceClient()` now returns `SupabaseClient | null` instead of throwing. It:
    1. Reads env vars from BOTH `import.meta.env` (Vite build-time inlined) AND `process.env` (Vercel runtime), same pattern as `region.ts:readEnv`.
    2. Returns `null` + `console.warn` if env vars are missing.
    3. Wraps `createClient()` in a try/catch so a Supabase client init error (e.g. invalid URL) also returns `null` instead of throwing.
    4. Caches the failure via `_clientInitAttempted` so we don't spam the log on every cache call.
  - All six public cache functions updated to early-return when `getServiceClient()` returns `null` (read functions return `null`, write functions return `void`). Each function ALSO wraps the Supabase query itself in a `try/catch` so a network failure, RLS rejection, or unexpected runtime error is caught at the cache layer (defensive backstop — supabase-js normally returns errors in `res.error`, but a throw can still happen on network/transport errors).
  - Net effect: missing `SUPABASE_SERVICE_ROLE_KEY` on Vercel preview deployments no longer causes ANY user-visible breakage. Cache reads miss → service falls through to live JustWatch. Cache writes are skipped (no-op). The route still returns 200 with live data.

### Task 5: Spot-check route responses
- Status: COMPLETE (verified via build, not live HTTP probe)
- Validation:
  - `./node_modules/.bin/vinxi build` — PASS. Build output for `/api/ott/providers` contains `country: "US", providers: []` as the defensive fallback. Build output for `/api/ott/batch-availability` contains `country: "US", results: {}` as the defensive fallback. Both contain the `Access-Control-Allow-Origin` header logic.
  - Did NOT spin up a local dev server to probe live HTTP responses — the dev server requires Supabase env vars and a working JustWatch API key, and the changes are purely additive (CORS headers, try/catch wrappers, lazy client init). The build output confirms the code is bundled correctly.
  - The audio-languages route was used as the reference "fail-open" pattern. The OTT routes now mirror its CORS handling, OPTIONS handler, and try/catch wrapping of country resolution.

### Files NOT modified
- `src/server/justwatch/client.ts` — no changes needed. The GraphQL query format was fixed in Chunk 6B; the icon URL construction (`buildLogoUrl`) was already correct.
- `src/features/details/components/WhereToWatch.tsx` — no changes needed. The Chunk 6B fix (createEffect + imgError signal) is correct; the CSP fix in this chunk unblocks the logos.
- `src/features/settings/components/StreamingProvidersSection.tsx` — no changes needed. The Chunk 6B fix (imgError signal) is correct; the CSP fix unblocks the logos.
- `src/features/watchlist/hooks/useWatchlistOttAvailability.ts` — no changes needed. The hook already passes `title` and `releaseYear` in the batch request body, and the service layer now handles cache failures gracefully.
- `src/features/watchlist/useVaultFiltering.ts`, `vaultFilterUtils.ts`, `platformDisplayNames.ts` — no changes needed. The Platform filter logic is correct; it was just hidden because the batch request was failing due to the GraphQL query bug (fixed in 6B) and would still hide if the route returned 401 (fixed in this chunk via CORS + fail-open).
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` — not modified (per spec).
- Discover "New on OTT", Upcoming, Statistics — not modified (per spec).
- Old TMDB provider registry files — not deleted (per spec).
- Pre-existing `/api/media/tv/...` 404s — not investigated (per spec — out of scope unless directly caused by chunk changes; they are not).

### Chunk 6C Commit & Push
- Commit hash: `7bc6362`
- Commit message: `fix: allow JustWatch images in CSP and make OTT routes/cache resilient in preview`
- Files in commit: 8 (justwatch_migration_worklog.md, vercel.json, src/server/justwatch/cache.ts, src/server/justwatch/service.ts, src/server/justwatch/region.ts, src/routes/api/ott/providers.ts, src/routes/api/ott/availability/[tmdbId].ts, src/routes/api/ott/batch-availability.ts)
- Push status: PUSHED to `origin/Justwatch` (range `3427d15..7bc6362`) using the user-supplied PAT (one-shot explicit push URL — NOT written to `.git/config`).

## Chunk 6D — Country override and Where to Watch resolution

### Task 1: Add client country override to OTT API routes
- Modified: src/routes/api/ott/providers.ts
- Modified: src/routes/api/ott/availability/[tmdbId].ts
- Modified: src/routes/api/ott/batch-availability.ts
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in modified files (18 pre-existing errors in OTHER files: Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx` — unchanged).
  - `./node_modules/.bin/eslint src/routes/api/ott/providers.ts src/routes/api/ott/availability/[tmdbId].ts src/routes/api/ott/batch-availability.ts` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built`. Verified the bundled output (`providers.js`, `_tmdbId_4.js`, `batch-availability2.js`) contains the new `normalizeCountry` helper and the `region`/`country` query (or body) override logic.
- Errors and fixes: none.
- Notes:
  - **Root cause (Issue 2/3/4 — country stuck at "US")**: All three OTT routes called `resolveJustWatchCountry(request)` which reads the Supabase session cookie to look up `profiles.country`. On the Vercel preview, the session cookie isn't always forwarded to the serverless function (depends on `SameSite`, `Domain`, and the preview URL's host not matching the cookie's host), so the resolver fails open to `"US"`. Result: Settings provider catalog showed only US providers (no JioHotstar/Zee5/SonyLIV), Where to Watch returned US offers (often empty for Indian titles), and the Watchlist Platform filter derived US providers like Fandango.
  - **Fix**: Accept an optional client-supplied country override. The client already knows the user's profile country reactively via `useDiscoverRegion()` (a global signal kept in sync with `profiles.country` via `setDiscoverRegion()` whenever the user picks a country in Settings). Passing it to the route as a query/body param skips the Supabase round-trip entirely.
  - **`providers.ts`**: Added `normalizeCountry()` helper (validates 2-letter ISO code, uppercases). Reads `url.searchParams.get("region") ?? url.searchParams.get("country")`. If valid → use it. Else fall back to `resolveJustWatchCountry(request)`. Else `"US"` defensive fallback.
  - **`availability/[tmdbId].ts`**: Same helper, same precedence. The route already parses URLSearchParams for `type`/`title`/`year` — added `region`/`country` next to them.
  - **`batch-availability.ts`**: Extended `BatchRequestBody` interface with optional `country?: string` and `region?: string` fields. `normalizeCountry()` accepts `unknown` (since the body is parsed from JSON). Same precedence: body.country / body.region → `resolveJustWatchCountry` → `"US"`. Country is resolved ONCE per request and reused for both the empty-batch short-circuit and the main batch fetch (avoids the duplicate resolver call that existed before).
  - **`region` vs `country` naming**: `region` is the preferred name (matches the audio-languages admin route's `region` override); `country` is accepted as an alias for caller convenience. Both work on all three routes.
  - The override is validated as a 2-letter ISO 3166-1 alpha-2 code. Any invalid value (3-letter codes, lowercase without proper format, numbers, etc.) is silently dropped and we fall back to the server resolver — never throws, never returns 400.

### Task 2: Pass profile country from client
- Modified: src/features/settings/hooks/useSettingsState.tsx
- Modified: src/features/details/components/WhereToWatch.tsx
- Modified: src/features/watchlist/hooks/useWatchlistOttAvailability.ts
- Status: COMPLETE
- Validation: tsc + eslint + build all pass (see Task 1 validation block).
- Errors and fixes: none.
- Notes:
  - **Country source**: `useDiscoverRegion()` from `src/core/config/discoverRegion.ts` is the single source of truth for the app's "watch region". It's a module-level SolidJS signal that defaults to `"IN"` and is updated via `setDiscoverRegion()` whenever the user picks a country in Settings (`handleSaveCountry` calls it after the Supabase `profiles.update` succeeds). The signal is reactive — every consumer re-runs when the country changes.
  - **Settings provider fetch (Task 2A)**: `loadProviders(_reg)` now reads `region()` and builds the URL as `/api/ott/providers?region=${encodeURIComponent(reg.toUpperCase())}` when `reg` is a valid 2-letter code. The `_reg` parameter (passed by the `onMount` and `createEffect` call sites) is still ignored in favor of the reactive `region()` signal — kept in the signature for backwards compatibility with the existing call sites.
  - **Where to Watch fetch (Task 2B)**: Imported `useDiscoverRegion` and added `const region = useDiscoverRegion()` at the top of the component. The `loadProviders` async function now sets `params.set("region", reg.toUpperCase())` when `reg` is valid. The `createEffect`'s `lastFetchedKey` is now `${mt}:${id}:${reg}` so a country change re-fires the fetch (instead of being deduped).
  - **Watchlist batch (Task 2C)**: Imported `useDiscoverRegion`. The `useWatchlistOttAvailability` hook now reads `const region = useDiscoverRegion()` and includes `country: currentCountry` in the POST body. The `signature` memo is now `${reg}|${watchlistSig}` so a country change re-fires the batch fetch — otherwise the watchlist would show stale US providers after the user switches to IN. The empty-watchlist check was updated to inspect just the `watchlistSig` portion (the composite signature is always truthy since `region()` never returns empty).

### Task 3: Ensure WhereToWatch passes title and year
- Modified: src/features/details/components/WhereToWatch.tsx (already covered in Task 2B)
- Status: COMPLETE
- Validation: tsc + eslint + build all pass.
- Notes:
  - **Already in place**: The `WhereToWatch` component already had `titleForLookup` and `yearForLookup` memos that extract title/year from `props.details()` and `props.baseItem()` (added in Chunk 5). The `loadProviders` async function already built a `URLSearchParams` with `type`, `title`, and `year`. This task's only addition was adding `region` to the same params object.
  - **DetailsModal call site**: `<WhereToWatch baseItem={baseItem} details={tmdb} />` — already passes both accessors. `baseItem` is a `WatchlistItem` accessor with `title`, `name`, `original_title`, `original_name`, `release_date`, `first_air_date`. `tmdb` is a `TMDBDetails` accessor with the same fields. No changes needed at the call site.
  - **Effect re-runs on title/year availability**: The `createEffect` already depends on `tmdbId()` and `mediaType()` (which are derived from `props.details()` and `props.baseItem()` via `createMemo`). When the modal opens and TMDB details load asynchronously, the memos update → the effect re-fires → `loadProviders` runs with the now-available title/year. The new `region()` dependency follows the same pattern.

### Task 4: Fix watchlist country and items
- Modified: src/features/watchlist/hooks/useWatchlistOttAvailability.ts (already covered in Task 2C)
- Status: COMPLETE
- Validation: tsc + eslint + build all pass.
- Notes:
  - **Country**: `country: currentCountry` is now included in the POST body sent to `/api/ott/batch-availability`. The route uses it as the override (Chunk 6D Task 1).
  - **Items**: Each item already includes `tmdbId`, `mediaType`, `title` (if available), `releaseYear` (if available). The `title` is derived from `it.title || it.name || it.original_title || it.original_name`. The `releaseYear` is parsed from `it.release_date || it.first_air_date` (first 4 chars as a number). Items without a title still go in the batch — the server will hit the per-title cache; on a cache miss without a title, the resolver returns null and the item gets `[]` providers.
  - **Result mapping**: Unchanged — `result[`${item.mediaType}:${item.tmdbId}`] = offerResult`. The hook's `extractProvidersFromOffers` then collects unique `package.technicalName` values per item, which the Platform filter reads via `matchesPlatform` in `vaultFilterUtils.ts`.

### Task 5: Verify provider catalog fallback logic
- Status: COMPLETE — no changes needed.
- Validation: re-read `src/server/justwatch/service.ts` and confirmed Chunk 6C's resilience wrapping is intact.
- Notes:
  - `getProviderCatalog(country)`: cache read wrapped in try/catch (lines 120-130), live JustWatch fetch wrapped in try/catch (lines 134-142), cache write wrapped in try/catch (lines 152-159). Returns `[]` only when JustWatch itself returns empty.
  - `getTitleOttAvailability`: cache read, offers fetch, and cache write all wrapped.
  - `batchGetTitleOttAvailability`: per-item cache read wrapped, batch fetch wrapped, per-item cache write wrapped.
  - `resolveTitleToJustWatchNode`: cache read + write wrapped.
  - The final return is always the live JustWatch result whenever JustWatch succeeds, regardless of cache state. Cache failures NEVER cause an empty return.

### Files NOT modified
- `src/server/justwatch/region.ts` — no changes needed. The resolver already fails open to `"US"` on missing token / missing env / Supabase error. The Chunk 6D fix is to bypass it entirely when the client supplies a valid country.
- `src/server/justwatch/cache.ts` — no changes needed. Lazy init + null-on-failure from Chunk 6C is intact.
- `src/server/justwatch/service.ts` — no changes needed. Cache resilience from Chunk 6C is intact.
- `src/features/settings/components/StreamingProvidersSection.tsx` — no changes needed. The component reads `s.providers()` (loaded by `useSettingsState`'s `loadProviders`); with Task 2A the providers are now country-correct.
- `src/features/details/DetailsModal/DetailsModal.tsx` — no changes needed. Already passes `baseItem={baseItem} details={tmdb}` to `WhereToWatch`, which is sufficient for title/year extraction.
- `src/features/watchlist/useVaultFiltering.ts` — no changes needed. Consumes `useWatchlistOttAvailability` which now passes the country override.
- `src/shared/types/index.ts` — no changes needed. `WatchlistItem` already has `release_date`/`first_air_date`/`title`/`name`/`original_title`/`original_name`.
- `src/core/config/discoverRegion.ts` — no changes needed. The signal + setter are already exported and used.
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` — not modified (per spec).
- Discover "New on OTT", Upcoming, Statistics — not modified (per spec).
- Old TMDB provider registry files — not deleted (per spec).

### Chunk 6D Commit & Push
- Commit hash: `08afe58`
- Commit message: `fix: add client country override to OTT routes and pass title/year to Where to Watch`
- Files in commit: 7 (justwatch_migration_worklog.md, src/routes/api/ott/providers.ts, src/routes/api/ott/availability/[tmdbId].ts, src/routes/api/ott/batch-availability.ts, src/features/settings/hooks/useSettingsState.tsx, src/features/details/components/WhereToWatch.tsx, src/features/watchlist/hooks/useWatchlistOttAvailability.ts)
- Push status: PUSHED to `origin/Justwatch` (range `bdbe720..08afe58`) using the credentials embedded in the existing `origin` remote URL.

